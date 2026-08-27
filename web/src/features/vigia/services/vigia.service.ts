import { api } from '@/lib/api';

export type VigiaState = 'ok' | 'error' | 'disconnected';

export interface VigiaStatus {
  state: VigiaState;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  emailsProcessedToday: number;
  emailsSkippedToday: number;
}

export const vigiaService = {
  async getSettings(): Promise<{ messageTemplate: string; defaultTemplate: string }> {
    const { data } = await api.get('/vigia/settings');
    return data;
  },

  async saveSettings(messageTemplate: string): Promise<{ messageTemplate: string }> {
    const { data } = await api.patch('/vigia/settings', { messageTemplate });
    return data;
  },

  async getStatus(): Promise<VigiaStatus> {
    const { data } = await api.get('/vigia/status');
    return data;
  },

  async reconnect(): Promise<void> {
    await api.post('/vigia/reconnect');
  },
};
