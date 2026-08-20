import { api } from '@/lib/api';

export const vigiaService = {
  async getSettings(): Promise<{ messageTemplate: string; defaultTemplate: string }> {
    const { data } = await api.get('/vigia/settings');
    return data;
  },

  async saveSettings(messageTemplate: string): Promise<{ messageTemplate: string }> {
    const { data } = await api.patch('/vigia/settings', { messageTemplate });
    return data;
  },
};
