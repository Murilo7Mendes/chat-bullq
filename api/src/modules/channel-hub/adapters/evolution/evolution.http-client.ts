import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class EvolutionHttpClient {
  private readonly logger = new Logger(EvolutionHttpClient.name);

  constructor(private readonly config: ConfigService) {}

  private getChannelConfig(channel: Channel): {
    baseUrl: string;
    apiKey: string;
    instanceName: string;
  } {
    const cfg = (channel.config ?? {}) as Record<string, any>;
    return {
      baseUrl:
        (cfg.baseUrl as string) ||
        this.config.get<string>('EVOLUTION_BASE_URL', 'http://evolution:8080'),
      apiKey: cfg.apiKey as string,
      instanceName: cfg.instanceName as string,
    };
  }

  private buildClient(channel: Channel) {
    const { baseUrl, apiKey } = this.getChannelConfig(channel);
    return axios.create({
      baseURL: baseUrl,
      headers: { apikey: apiKey },
      timeout: 30_000,
    });
  }

  getInstanceName(channel: Channel): string {
    return this.getChannelConfig(channel).instanceName;
  }

  async sendRequest<T = any>(
    channel: Channel,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    data?: Record<string, any>,
  ): Promise<T> {
    const http = this.buildClient(channel);
    try {
      let response;
      if (method === 'GET') response = await http.get<T>(path, { params: data });
      else if (method === 'DELETE') response = await http.delete<T>(path, { data });
      else response = await http.post<T>(path, data);
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Evolution ${method} ${path} — ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  async sendText(channel: Channel, number: string, text: string, delay = 1000) {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/message/sendText/${instanceName}`, {
      number,
      text,
      delay,
    });
  }

  async sendMedia(
    channel: Channel,
    number: string,
    mediatype: 'image' | 'video' | 'document' | 'audio' | 'sticker',
    media: string,
    caption?: string,
    fileName?: string,
    mimetype?: string,
  ) {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/message/sendMedia/${instanceName}`, {
      number,
      mediatype,
      media,
      ...(caption !== undefined && { caption }),
      ...(fileName !== undefined && { fileName }),
      ...(mimetype !== undefined && { mimetype }),
    });
  }

  async sendWhatsAppAudio(channel: Channel, number: string, audio: string) {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/message/sendWhatsAppAudio/${instanceName}`, {
      number,
      audio,
      encoding: true,
    });
  }

  async sendLocation(
    channel: Channel,
    number: string,
    latitude: number,
    longitude: number,
    name?: string,
  ) {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/message/sendLocation/${instanceName}`, {
      number,
      latitude,
      longitude,
      ...(name !== undefined && { name }),
    });
  }

  async sendReaction(
    channel: Channel,
    remoteJid: string,
    msgId: string,
    fromMe: boolean,
    emoji: string,
  ) {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/message/sendReaction/${instanceName}`, {
      key: { remoteJid, fromMe, id: msgId },
      reaction: emoji,
    });
  }

  async sendPresence(channel: Channel, number: string, presence = 'composing') {
    const { instanceName } = this.getChannelConfig(channel);
    return this.sendRequest(channel, 'POST', `/chat/sendPresence/${instanceName}`, {
      number,
      options: presence,
    });
  }

  async downloadFromUrl(url: string): Promise<Buffer> {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60_000 });
    return Buffer.from(res.data as ArrayBuffer);
  }

  async getConnectionState(channel: Channel): Promise<{ state: string; instance?: any }> {
    const { instanceName } = this.getChannelConfig(channel);
    try {
      const res = await this.sendRequest<any>(
        channel,
        'GET',
        `/instance/connectionState/${instanceName}`,
      );
      return { state: res?.instance?.state ?? res?.state ?? 'close', instance: res };
    } catch {
      return { state: 'close' };
    }
  }

  async connectAndGetQr(channel: Channel): Promise<{ qrBase64?: string; pairingCode?: string; status: string }> {
    const { instanceName } = this.getChannelConfig(channel);
    const state = await this.getConnectionState(channel);
    if (state.state === 'open') {
      return { status: 'open' };
    }
    try {
      const res = await this.sendRequest<any>(channel, 'GET', `/instance/connect/${instanceName}`);
      // When state is 'connecting', Evolution may return {count:0} without a QR.
      // Retry once after a short wait to catch the QR once Baileys initializes.
      if (!res?.base64 && res?.count === 0) {
        await new Promise((r) => setTimeout(r, 3000));
        const retry = await this.sendRequest<any>(channel, 'GET', `/instance/connect/${instanceName}`);
        if (retry?.base64) {
          return { status: 'qr', qrBase64: retry.base64, pairingCode: retry.pairingCode ?? undefined };
        }
        return { status: 'connecting' };
      }
      return {
        status: res?.base64 ? 'qr' : 'connecting',
        qrBase64: res?.base64 ?? undefined,
        pairingCode: res?.pairingCode ?? undefined,
      };
    } catch {
      return { status: 'error' };
    }
  }
}
