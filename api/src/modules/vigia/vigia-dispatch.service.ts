import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConversationStatus, MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ConversationFsmService } from '../messaging/conversations/conversation-fsm.service';
import { MessageContentType } from '../channel-hub/ports/types/normalized-message.types';

const OPEN_STATUSES = [
  ConversationStatus.PENDING,
  ConversationStatus.OPEN,
  ConversationStatus.BOT,
  ConversationStatus.WAITING,
];

@Injectable()
export class VigiaDispatchService {
  private readonly logger = new Logger(VigiaDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fsm: ConversationFsmService,
    @InjectQueue('outbound-messages') private readonly outboundQueue: Queue,
  ) {}

  /**
   * Para um contato com opt-in habilitado, envia uma mensagem com os links
   * e fecha a conversa. Cria a conversa com aiEnabled=null (herda org/canal)
   * para que uma resposta do cliente reative a IA normalmente.
   */
  async dispatch(params: {
    organizationId: string;
    channelId: string;
    contactId: string;
    phone: string;
    links: string[];
  }): Promise<void> {
    const { organizationId, channelId, contactId, phone, links } = params;

    const contactExternalId = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    const text = links.join('\n');

    // Garante que existe um ContactChannel para este par contato+canal
    await this.prisma.contactChannel.upsert({
      where: { uq_contact_channel_external: { channelId, externalId: contactExternalId } },
      create: { contactId, channelId, externalId: contactExternalId },
      update: {},
    });

    // Reutiliza conversa aberta ou cria nova com aiEnabled=null (não desliga IA)
    const open = await this.prisma.conversation.findFirst({
      where: { organizationId, channelId, contactId, status: { in: OPEN_STATUSES } },
      orderBy: { updatedAt: 'desc' },
    });

    let conversationId: string;
    if (open) {
      conversationId = open.id;
    } else {
      const protocol = this.generateProtocol();
      const conv = await this.prisma.conversation.create({
        data: {
          organizationId,
          channelId,
          contactId,
          status: ConversationStatus.OPEN,
          // aiEnabled=null → herda org/canal; IA entra normalmente se cliente responder
          protocol,
          isGroup: false,
        },
      });
      conversationId = conv.id;
    }

    // Cria a mensagem como sistema (senderId=null, como automações)
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        type: 'TEXT' as any,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.QUEUED,
        senderId: null,
        content: { text } as any,
      },
    });

    // Enfileira envio real
    await this.outboundQueue.add(
      'send-outbound',
      {
        messageId: message.id,
        channelId,
        contactExternalId,
        message: {
          type: MessageContentType.TEXT,
          content: { text },
        },
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true },
    );

    // Fecha conversa imediatamente — a IA entra quando o cliente responder
    try {
      await this.fsm.transition(conversationId, ConversationStatus.CLOSED, undefined, {
        trigger: 'vigia_notification',
      });
    } catch (err: any) {
      // Se a conversa já foi fechada por outro caminho, não é erro crítico
      this.logger.warn(`vigia: transition CLOSED falhou para ${conversationId}: ${err?.message}`);
    }

    this.logger.log(
      `vigia dispatch: contact=${contactId} conv=${conversationId} links=${links.length}`,
    );
  }

  private generateProtocol(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VIG-${date}-${rand}`;
  }
}
