import { api } from '@/lib/api';

export interface KnowledgeDocument {
  id: string;
  title: string;
  status: 'pending' | 'indexing' | 'ready' | 'error';
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeDto {
  title: string;
  content: string;
}

export interface UpdateKnowledgeDto {
  title?: string;
  content?: string;
}

export const knowledgeService = {
  list(agentId: string): Promise<KnowledgeDocument[]> {
    return api.get(`/ai/agents/${agentId}/knowledge`).then((r) => r.data);
  },

  create(agentId: string, dto: CreateKnowledgeDto): Promise<KnowledgeDocument> {
    return api.post(`/ai/agents/${agentId}/knowledge`, dto).then((r) => r.data);
  },

  update(agentId: string, id: string, dto: UpdateKnowledgeDto): Promise<KnowledgeDocument> {
    return api.patch(`/ai/agents/${agentId}/knowledge/${id}`, dto).then((r) => r.data);
  },

  remove(agentId: string, id: string): Promise<void> {
    return api.delete(`/ai/agents/${agentId}/knowledge/${id}`).then(() => undefined);
  },
};
