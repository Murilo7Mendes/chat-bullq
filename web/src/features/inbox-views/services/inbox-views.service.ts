import { api } from '@/lib/api';
import type { Conversation } from '@/features/inbox/services/inbox.service';

export interface InboxViewFilters {
  channelIds?: string[];
  statuses?: string[];
  assignedTo?: 'me' | 'none' | 'any' | string;
  tagIds?: string[];
  lastDirection?: 'inbound' | 'outbound' | 'any';
  /** INDIVIDUAL = 1-on-1, GROUP = group chats. Undefined = ambos. */
  kind?: 'INDIVIDUAL' | 'GROUP';
  /** Static list of conversations pinned to this view (set via bulk
   *  "create inbox from selection"). Other filters still apply on top. */
  conversationIds?: string[];
  archived?: 'exclude' | 'only' | 'any';
  unreadOnly?: boolean;
}

export interface InboxView {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  filters: InboxViewFilters;
  /** `{ builtin: true }` marks system-seeded views like "Archived" — UI
   *  hides edit/delete actions for those. */
  metadata?: Record<string, any> | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInboxViewInput {
  name: string;
  icon?: string;
  color?: string;
  filters: InboxViewFilters;
  order?: number;
}

export const inboxViewsService = {
  async list(): Promise<InboxView[]> {
    const { data } = await api.get('/inbox-views');
    return data.data ?? data;
  },
  async create(input: UpsertInboxViewInput): Promise<InboxView> {
    const { data } = await api.post('/inbox-views', input);
    return data.data ?? data;
  },
  async update(id: string, input: Partial<UpsertInboxViewInput>): Promise<InboxView> {
    const { data } = await api.patch(`/inbox-views/${id}`, input);
    return data.data ?? data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/inbox-views/${id}`);
  },
  async reorder(ids: string[]): Promise<void> {
    await api.patch('/inbox-views/reorder', { ids });
  },
  async getConversations(
    id: string,
    params?: Record<string, string>,
  ): Promise<{
    conversations: Conversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await api.get(`/inbox-views/${id}/conversations`, {
      params,
    });
    return data.data ?? data;
  },
};
