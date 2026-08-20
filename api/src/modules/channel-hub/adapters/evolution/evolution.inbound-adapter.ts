import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import * as crypto from 'crypto';
import { InboundChannelPort, ChannelLocator } from '../../ports/inbound-channel.port';
import { WebhookParseResult, VerificationResponse } from '../../ports/types';
import { EvolutionMessageMapper } from './evolution.message-mapper';

@Injectable()
export class EvolutionInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_EVOLUTION;
  private readonly logger = new Logger(EvolutionInboundAdapter.name);

  constructor(private readonly mapper: EvolutionMessageMapper) {}

  extractLocators(
    payload: unknown,
    _headers: Record<string, string>,
  ): ChannelLocator[] {
    const event = (payload ?? {}) as Record<string, any>;
    return [
      {
        instanceId: event.instance ? String(event.instance) : undefined,
        token: event.apikey ? String(event.apikey) : undefined,
      },
    ];
  }

  matchesChannel(channel: Channel, locator: ChannelLocator): boolean {
    const cfg = (channel.config ?? {}) as Record<string, any>;

    if (locator.instanceId && cfg.instanceName) {
      return String(cfg.instanceName) === locator.instanceId;
    }

    if (locator.token && cfg.apiKey) {
      return this.timingSafeEqual(String(cfg.apiKey), locator.token);
    }

    return false;
  }

  validateWebhook(
    _headers: Record<string, string>,
    _rawBody: Buffer,
    _webhookSecret?: string,
    _channel?: Channel,
  ): boolean {
    // matchesChannel already verified the instance name and/or API key.
    return true;
  }

  parseWebhook(payload: unknown, _channel?: Channel): WebhookParseResult {
    const result: WebhookParseResult = { messages: [], statuses: [], errors: [] };
    try {
      const event = (payload ?? {}) as Record<string, any>;
      const eventType = String(event.event || '');

      if (eventType === 'messages.upsert') {
        const normalized = this.mapper.normalizeInbound(event.data);
        if (normalized) result.messages.push(normalized);
      } else if (eventType === 'messages.update') {
        const updates: any[] = Array.isArray(event.data) ? event.data : [event.data];
        for (const update of updates) {
          const status = this.mapper.normalizeStatus(update);
          if (status) result.statuses.push(status);
        }
      }
      // Other events (connection.update, qrcode.updated, contacts.upsert, etc.)
      // are silently ignored — no error, just empty result.
    } catch (error: any) {
      this.logger.error(`Failed to parse Evolution webhook: ${error.message}`);
      result.errors.push({ code: 'PARSE_ERROR', message: error.message, rawData: payload });
    }
    return result;
  }

  handleVerification(
    _query: Record<string, string>,
    _webhookSecret?: string,
  ): VerificationResponse {
    return { statusCode: 200, body: 'OK' };
  }

  private timingSafeEqual(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a);
      const bb = Buffer.from(b);
      if (ba.length !== bb.length) return false;
      return crypto.timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  }
}
