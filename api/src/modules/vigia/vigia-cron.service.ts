import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';
import { VigiaImapService } from './vigia-imap.service';
import { VigiaDispatchService } from './vigia-dispatch.service';
import { VigiaSettingsService } from './vigia-settings.service';
import { extractCnpjFromHtml, extractDocLinks } from './vigia-link-extractor';
import {
  VIGIA_QUEUE,
  VIGIA_POLL_JOB,
  VIGIA_POLL_PATTERN_DEFAULT,
  VIGIA_PROCESSED_TTL_S,
  VIGIA_REDIS_PREFIX,
} from './vigia.constants';

@Processor(VIGIA_QUEUE, { concurrency: 1 })
@Injectable()
export class VigiaCronService extends WorkerHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VigiaCronService.name);
  private redis!: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly imap: VigiaImapService,
    private readonly dispatch: VigiaDispatchService,
    private readonly settings: VigiaSettingsService,
    @InjectQueue(VIGIA_QUEUE) private readonly pollQueue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    await this.redis.connect();

    const channelId = this.config.get<string>('VIGIA_CHANNEL_ID');
    if (!channelId) {
      this.logger.warn('VIGIA_CHANNEL_ID não configurado — cron não registrado');
      return;
    }

    const pattern =
      this.config.get<string>('VIGIA_POLL_PATTERN') || VIGIA_POLL_PATTERN_DEFAULT;

    await this.pollQueue.add(VIGIA_POLL_JOB, {}, {
      repeat: { pattern },
      jobId: 'vigia-poll-cron',
      removeOnComplete: 10,
      removeOnFail: 10,
    });

    this.logger.log(`vigia cron registrado: ${pattern}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  async process(_job: Job): Promise<{ processed: number; skipped: number }> {
    const channelId = this.config.get<string>('VIGIA_CHANNEL_ID');
    if (!channelId) return { processed: 0, skipped: 0 };

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || !channel.isActive) {
      this.logger.warn(`vigia: canal ${channelId} inativo ou não encontrado`);
      return { processed: 0, skipped: 0 };
    }

    const lookbackMs = (this.config.get<number>('VIGIA_LOOKBACK_MINUTES') || 10) * 60 * 1000;
    const since = new Date(Date.now() - lookbackMs);
    const emails = await this.imap.fetchUnseen(since);
    let processed = 0;
    let skipped = 0;

    for (const email of emails) {
      const dedupKey = `${VIGIA_REDIS_PREFIX}${email.messageId}`;
      const already = await this.redis.get(dedupKey);
      if (already) {
        skipped++;
        continue;
      }

      const cnpj = extractCnpjFromHtml(email.html);
      if (!cnpj) {
        this.logger.debug(`vigia: sem CNPJ no corpo do e-mail ${email.messageId} — ignorado`);
        skipped++;
        await this.markProcessed(dedupKey);
        continue;
      }

      const links = extractDocLinks(email.html);

      if (links.length === 0) {
        this.logger.debug(`vigia: sem links no email ${email.messageId} — ignorado`);
        skipped++;
        await this.markProcessed(dedupKey);
        continue;
      }

      // Busca contatos opt-in para este CNPJ dentro da mesma org do canal
      const contactCnpjs = await this.prisma.contactCnpj.findMany({
        where: {
          cnpj,
          autoNotify: true,
          contact: { organizationId: channel.organizationId, deletedAt: null },
        },
        include: { contact: true },
      });

      if (contactCnpjs.length === 0) {
        this.logger.debug(`vigia: CNPJ ${cnpj} sem contatos opt-in — ignorado`);
        skipped++;
        await this.markProcessed(dedupKey);
        continue;
      }

      const template = await this.settings.getTemplate(channel.organizationId);
      const text = this.settings.applyTemplate(template, email.subject, links);

      // Espaça disparos para anti-ban (1 s entre contatos do mesmo e-mail)
      for (const cc of contactCnpjs) {
        const phone = cc.contact.phone;
        if (!phone) {
          this.logger.warn(`vigia: contato ${cc.contactId} sem telefone — pulado`);
          continue;
        }
        try {
          await this.dispatch.dispatch({
            organizationId: channel.organizationId,
            channelId: channel.id,
            contactId: cc.contactId,
            phone,
            text,
          });
          await new Promise((r) => setTimeout(r, 1200)); // anti-ban
        } catch (err: any) {
          this.logger.error(`vigia: dispatch falhou para ${cc.contactId}: ${err?.message}`);
        }
      }

      await this.markProcessed(dedupKey);
      processed++;
      this.logger.log(
        `vigia: processado CNPJ=${cnpj} links=${links.length} contatos=${contactCnpjs.length}`,
      );
    }

    if (emails.length > 0) {
      this.logger.log(`vigia tick: emails=${emails.length} processed=${processed} skipped=${skipped}`);
    }

    return { processed, skipped };
  }

  private async markProcessed(key: string): Promise<void> {
    await this.redis.set(key, '1', 'EX', VIGIA_PROCESSED_TTL_S);
  }
}
