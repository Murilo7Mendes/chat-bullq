import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface VigiaEmail {
  uid: number;
  messageId: string;
  subject: string;
  html: string;
}

@Injectable()
export class VigiaImapService implements OnModuleDestroy {
  private readonly logger = new Logger(VigiaImapService.name);
  private client: ImapFlow | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy() {
    await this.safeLogout();
  }

  private async getClient(): Promise<ImapFlow> {
    if (this.client) {
      try {
        await this.client.noop();
        return this.client;
      } catch {
        this.client = null;
      }
    }

    const user = this.config.getOrThrow<string>('VIGIA_GMAIL_USER');
    const pass = this.config.getOrThrow<string>('VIGIA_GMAIL_APP_PASSWORD');

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    this.client = client;
    this.logger.log(`IMAP conectado: ${user}`);
    return client;
  }

  private async safeLogout() {
    if (this.client) {
      try { await this.client.logout(); } catch { /* ignore */ }
      this.client = null;
    }
  }

  /** Busca e-mails não lidos na INBOX. Marca como lidos após buscar. */
  async fetchUnseen(): Promise<VigiaEmail[]> {
    let client: ImapFlow;
    try {
      client = await this.getClient();
    } catch (err: any) {
      this.logger.error(`vigia IMAP: falha de conexão — ${err?.message}`);
      this.client = null;
      return [];
    }

    const emails: VigiaEmail[] = [];

    await client.mailboxOpen('INBOX');

    const uids = await client.search({ seen: false }, { uid: true });
    // imapflow retorna false quando não há resultados
    if (!uids || (uids as unknown as false) === false || (uids as number[]).length === 0) {
      return emails;
    }

    const uidList = uids as number[];
    this.logger.log(`vigia IMAP: ${uidList.length} e-mail(s) não lido(s)`);
    const uidRange = uidList.join(',');

    for await (const msg of client.fetch(uidRange, { source: true, uid: true }, { uid: true })) {
      if (!msg.source) continue;
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        emails.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? `uid-${msg.uid}`,
          subject: parsed.subject ?? '',
          html: typeof parsed.html === 'string' ? parsed.html : (parsed.text ?? ''),
        });
      } catch (parseErr: any) {
        this.logger.warn(`vigia IMAP: falha ao parsear uid=${msg.uid}: ${parseErr?.message}`);
      }
    }

    // Marca como lido para não reprocessar no próximo tick
    if (uidList.length > 0) {
      await client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true });
    }

    return emails;
  }
}
