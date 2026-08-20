import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  MessageContentType,
  NormalizedInboundMessage,
  NormalizedMessageContent,
  ReplyContext,
  StatusUpdate,
} from '../../ports/types';

const STATUS_MAP: Record<string, StatusUpdate['status']> = {
  ERROR: 'failed',
  PENDING: 'sent',
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
};

@Injectable()
export class EvolutionMessageMapper {
  normalizeInbound(data: any): NormalizedInboundMessage | null {
    if (!data?.key) return null;

    const key = data.key;
    const remoteJid: string = key.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    const isEcho = !!key.fromMe;

    const senderJid: string = isGroup ? (data.participant || '') : remoteJid;
    const senderPhone = senderJid.replace(/@[^@]+$/, '');

    const rawTs: number = data.messageTimestamp ?? 0;
    const timestamp = new Date(rawTs > 9_999_999_999 ? rawTs : (rawTs * 1000 || Date.now()));

    const type = this.resolveContentType(data.messageType || '');
    const content = this.extractContent(data.message, data.messageType || '');
    const replyTo = this.extractReply(data.message);

    const msg: NormalizedInboundMessage = {
      externalMessageId: key.id || '',
      externalContactId: remoteJid,
      channelType: ChannelType.WHATSAPP_EVOLUTION,
      timestamp,
      type,
      content,
      isGroup,
      isEcho,
      rawPayload: data,
    };

    if (!isEcho) {
      msg.contactName = (data.pushName as string | undefined) || undefined;
      if (!isGroup) msg.contactPhone = senderPhone || undefined;
    }

    if (isGroup && !isEcho) {
      msg.senderName =
        ((data.pushName as string | undefined)?.trim()) || senderPhone || undefined;
    }

    if (replyTo) msg.replyTo = replyTo;

    return msg;
  }

  normalizeStatus(update: any): StatusUpdate | null {
    if (!update?.key || !update?.update) return null;
    const raw = String(update.update.status || '').toUpperCase();
    const status = STATUS_MAP[raw];
    if (!status) return null;

    return {
      externalMessageId: update.key.id,
      status,
      timestamp: new Date(),
    };
  }

  private resolveContentType(messageType: string): MessageContentType {
    const t = messageType.toLowerCase();
    if (t === 'conversation' || t.includes('extendedtext')) return MessageContentType.TEXT;
    if (t.includes('image')) return MessageContentType.IMAGE;
    if (t === 'audiomessage' || t.includes('ptt') || t.includes('audio')) return MessageContentType.AUDIO;
    if (t === 'ptvmessage' || t === 'ptv') return MessageContentType.AUDIO;
    if (t.includes('video')) return MessageContentType.VIDEO;
    if (t.includes('document')) return MessageContentType.DOCUMENT;
    if (t.includes('sticker')) return MessageContentType.STICKER;
    if (t.includes('location')) return MessageContentType.LOCATION;
    if (t.includes('reaction')) return MessageContentType.REACTION;
    if (t.includes('button') || t.includes('list')) return MessageContentType.INTERACTIVE;
    return MessageContentType.TEXT;
  }

  private extractContent(message: any, messageType: string): NormalizedMessageContent {
    if (!message) return { text: '' };
    const t = messageType.toLowerCase();

    if (t === 'conversation') return { text: message.conversation || '' };

    if (t.includes('extendedtext')) {
      return { text: message.extendedTextMessage?.text || '' };
    }

    if (t.includes('image')) {
      const m = message.imageMessage || {};
      return {
        mediaUrl: m.url,
        mimeType: m.mimetype,
        fileSize: m.fileLength ? Number(m.fileLength) : undefined,
        caption: m.caption,
      };
    }

    if (t.includes('audio') || t.includes('ptt')) {
      const m = message.audioMessage || {};
      return {
        mediaUrl: m.url,
        mimeType: m.mimetype || 'audio/ogg',
        fileSize: m.fileLength ? Number(m.fileLength) : undefined,
      };
    }

    if (t === 'ptvmessage' || t === 'ptv') {
      const m = message.ptvMessage || {};
      return {
        mediaUrl: m.url,
        mimeType: m.mimetype || 'video/mp4',
        fileSize: m.fileLength ? Number(m.fileLength) : undefined,
      };
    }

    if (t.includes('video')) {
      const m = message.videoMessage || {};
      return {
        mediaUrl: m.url,
        mimeType: m.mimetype,
        fileSize: m.fileLength ? Number(m.fileLength) : undefined,
        caption: m.caption,
      };
    }

    if (t.includes('document')) {
      const m = message.documentMessage || {};
      return {
        mediaUrl: m.url,
        mimeType: m.mimetype,
        fileName: m.fileName,
        fileSize: m.fileLength ? Number(m.fileLength) : undefined,
        caption: m.caption,
      };
    }

    if (t.includes('sticker')) {
      const m = message.stickerMessage || {};
      return { mediaUrl: m.url, mimeType: m.mimetype || 'image/webp' };
    }

    if (t.includes('location')) {
      const m = message.locationMessage || {};
      return {
        latitude: m.degreesLatitude,
        longitude: m.degreesLongitude,
        text: (m.name || m.address) as string | undefined,
      };
    }

    if (t.includes('reaction')) {
      const m = message.reactionMessage || {};
      return {
        reaction: { emoji: m.text || '', targetMessageId: m.key?.id || '' },
      };
    }

    if (t.includes('contact')) {
      const m = message.contactMessage || {};
      return { text: `Contato: ${(m.displayName as string) || 'desconhecido'}` };
    }

    if (t.includes('poll')) {
      const m = message.pollCreationMessage || message.pollCreationMessageV3 || {};
      const opts: string[] = ((m.options as any[]) || []).map((o: any) => `• ${o.optionName}`);
      return {
        text: [(m.name ? `Enquete: ${m.name}` : 'Enquete'), ...opts].join('\n'),
      };
    }

    return {
      text:
        message.conversation ||
        message.extendedTextMessage?.text ||
        '[Mensagem não suportada]',
    };
  }

  private extractReply(message: any): ReplyContext | null {
    if (!message) return null;

    const contextInfo =
      message.extendedTextMessage?.contextInfo ||
      message.imageMessage?.contextInfo ||
      message.videoMessage?.contextInfo ||
      message.audioMessage?.contextInfo ||
      message.documentMessage?.contextInfo ||
      message.stickerMessage?.contextInfo ||
      null;

    const stanzaId: string | undefined =
      contextInfo?.stanzaId || contextInfo?.stanzaID;
    if (!stanzaId) return null;

    const quoted = contextInfo?.quotedMessage;
    const previewText: string | undefined = quoted
      ? (quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          quoted.imageMessage?.caption ||
          quoted.videoMessage?.caption ||
          quoted.documentMessage?.caption ||
          (quoted.imageMessage ? '[imagem]' : undefined) ||
          (quoted.videoMessage ? '[vídeo]' : undefined) ||
          (quoted.audioMessage ? '[áudio]' : undefined) ||
          (quoted.documentMessage ? '[documento]' : undefined))
      : undefined;

    return previewText
      ? { externalMessageId: stanzaId, previewText }
      : { externalMessageId: stanzaId };
  }
}
