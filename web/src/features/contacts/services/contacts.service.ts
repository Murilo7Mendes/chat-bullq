import { api } from '@/lib/api';

export interface ContactCnpj {
  id: string;
  contactId: string;
  cnpj: string;
  autoNotify: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  channels: { id: string; channelId: string; externalId: string; channel: { id: string; type: string; name: string } }[];
  tags: { tag: { id: string; name: string; color: string } }[];
  cnpjs?: ContactCnpj[];
  conversations?: any[];
  _count?: { conversations: number };
  createdAt: string;
}

export const contactsService = {
  async list(params?: Record<string, string>): Promise<{
    contacts: Contact[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await api.get('/contacts', { params });
    return data.data;
  },

  async getById(id: string): Promise<Contact> {
    const { data } = await api.get(`/contacts/${id}`);
    return data.data;
  },

  async update(id: string, payload: Partial<Pick<Contact, 'name' | 'phone' | 'email' | 'notes' | 'metadata'>>): Promise<Contact> {
    const { data } = await api.patch(`/contacts/${id}`, payload);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/contacts/${id}`);
  },

  async listCnpjs(id: string): Promise<ContactCnpj[]> {
    const { data } = await api.get(`/contacts/${id}/cnpjs`);
    return data.data ?? data;
  },

  async addCnpj(id: string, cnpj: string): Promise<ContactCnpj> {
    const { data } = await api.post(`/contacts/${id}/cnpjs`, { cnpj });
    return data.data ?? data;
  },

  async updateCnpjAutoNotify(id: string, cnpj: string, autoNotify: boolean): Promise<ContactCnpj> {
    const { data } = await api.patch(`/contacts/${id}/cnpjs/${cnpj}`, { autoNotify });
    return data.data ?? data;
  },

  async removeCnpj(id: string, cnpj: string): Promise<void> {
    await api.delete(`/contacts/${id}/cnpjs/${cnpj}`);
  },
};
