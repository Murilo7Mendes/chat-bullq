import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { OutboundChannelPort } from '../../ports/outbound-channel.port';
import {
  MessageContentType,
  NormalizedOutboundMessage,
  RateLimitConfig,
  SendResult,
} from '../../ports/types';
import { EvolutionHttpClient } from './evolution.http-client';

@Injectable()
export class EvolutionOutboundAdapter implements OutboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_EVOLUTION;
  private readonly logger = new Logger(EvolutionOutboundAdapter.name);

  constructor(private readonly http: EvolutionHttpClient) {}

  async sendMessage(
    channel: Channel,
    contactExternalId: string,
    message: NormalizedOutboundMessage,
  ): Promise<SendResult> {
    const number = contactExternalId.replace(/@[^@]+$/, '');
    let response: any;

    switch (message.type) {
      case MessageContentType.TEXT:
        response = await this.http.sendText(channel, number, message.content.text || '');
        break;

      case MessageContentType.IMAGE: {
        const imageMedia = await this.http.resolveMediaAsBase64(
          message.content.mediaUrl!,
          message.content.mimeType,
        );
        response = await this.http.sendMedia(
          channel,
          number,
          'image',
          imageMedia,
          message.content.caption,
          undefined,
          message.content.mimeType,
        );
        break;
      }

      case MessageContentType.VIDEO: {
        const videoMedia = await this.http.resolveMediaAsBase64(
          message.content.mediaUrl!,
          message.content.mimeType,
        );
        response = await this.http.sendMedia(
          channel,
          number,
          'video',
          videoMedia,
          message.content.caption,
        );
        break;
      }

      case MessageContentType.DOCUMENT: {
        const docMedia = await this.http.resolveMediaAsBase64(
          message.content.mediaUrl!,
          message.content.mimeType,
        );
        response = await this.http.sendMedia(
          channel,
          number,
          'document',
          docMedia,
          message.content.caption,
          message.content.fileName,
          message.content.mimeType,
        );
        break;
      }

      case MessageContentType.AUDIO: {
        const audioMedia = await this.http.resolveMediaAsBase64(
          message.content.mediaUrl!,
          message.content.mimeType,
        );
        response = await this.http.sendWhatsAppAudio(
          channel,
          number,
          audioMedia,
        );
        break;
      }

      case MessageContentType.STICKER: {
        const stickerMedia = await this.http.resolveMediaAsBase64(
          message.content.mediaUrl!,
          message.content.mimeType,
        );
        response = await this.http.sendMedia(
          channel,
          number,
          'sticker',
          stickerMedia,
        );
        break;
      }

      case MessageContentType.LOCATION:
        response = await this.http.sendLocation(
          channel,
          number,
          message.content.latitude!,
          message.content.longitude!,
          message.content.text,
        );
        break;

      case MessageContentType.REACTION: {
        const r = message.content.reaction;
        const replyTo = message.replyTo;
        if (r?.targetMessageId && replyTo?.externalMessageId) {
          response = await this.http.sendReaction(
            channel,
            contactExternalId,
            r.targetMessageId,
            false,
            r.emoji,
          );
        } else {
          response = await this.http.sendText(channel, number, r?.emoji || '');
        }
        break;
      }

      default:
        response = await this.http.sendText(channel, number, message.content.text || '');
    }

    return {
      externalId: response?.key?.id || response?.id || '',
      providerResponse: response,
    };
  }

  async sendTypingIndicator(channel: Channel, contactExternalId: string): Promise<void> {
    const number = contactExternalId.replace(/@[^@]+$/, '');
    try {
      await this.http.sendPresence(channel, number);
    } catch (err: any) {
      this.logger.warn(`Evolution typing indicator failed: ${err.message}`);
    }
  }

  async getMediaUrl(_channel: Channel, mediaId: string): Promise<string> {
    return mediaId;
  }

  async downloadMedia(_channel: Channel, mediaId: string): Promise<Buffer> {
    return this.http.downloadFromUrl(mediaId);
  }

  getRateLimits(): RateLimitConfig {
    return { maxPerSecond: 1, maxPerMinute: 30, windowMs: 60_000 };
  }
}
