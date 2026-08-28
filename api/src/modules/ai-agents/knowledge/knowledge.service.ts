import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { VectorStoreService } from '../rag/vector-store.service';
import { chunkText } from '../rag/chunker';
import type { IndexerJobData } from '../rag/types';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorStore: VectorStoreService,
    @InjectQueue('rag-indexer') private readonly indexerQueue: Queue<IndexerJobData>,
  ) {}

  async list(orgId: string, agentId: string) {
    await this.assertAgentOwnership(orgId, agentId);
    return this.prisma.aiKnowledgeDocument.findMany({
      where: { agentId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(orgId: string, agentId: string, dto: CreateKnowledgeDto) {
    await this.assertAgentOwnership(orgId, agentId);

    const doc = await this.prisma.aiKnowledgeDocument.create({
      data: {
        organizationId: orgId,
        agentId,
        title: dto.title,
        content: dto.content,
        status: 'pending',
      },
    });

    await this.enqueueIndexing(doc.id, agentId, orgId, dto.content);
    return doc;
  }

  async update(orgId: string, agentId: string, id: string, dto: UpdateKnowledgeDto) {
    await this.assertDocOwnership(orgId, agentId, id);

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) {
      data.content = dto.content;
      data.status = 'pending';
      data.chunkCount = 0;
    }

    const doc = await this.prisma.aiKnowledgeDocument.update({ where: { id }, data });

    if (dto.content !== undefined) {
      await this.enqueueIndexing(id, agentId, orgId, dto.content);
    }

    return doc;
  }

  async remove(orgId: string, agentId: string, id: string) {
    await this.assertDocOwnership(orgId, agentId, id);

    // Remove chunks do vector store antes de deletar o doc
    await this.vectorStore.deleteByOwnerPrefix('document', `${id}:chunk:`);
    await this.prisma.aiKnowledgeDocument.delete({ where: { id } });
  }

  private async enqueueIndexing(
    docId: string,
    agentId: string,
    organizationId: string,
    content: string,
  ): Promise<void> {
    const chunks = chunkText(content);
    await this.indexerQueue.add(
      'index_document',
      { type: 'index_document', docId, agentId, organizationId, chunks },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  private async assertAgentOwnership(orgId: string, agentId: string) {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: agentId },
      select: { organizationId: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.organizationId !== orgId) throw new ForbiddenException();
  }

  private async assertDocOwnership(orgId: string, agentId: string, docId: string) {
    const doc = await this.prisma.aiKnowledgeDocument.findUnique({
      where: { id: docId },
      select: { organizationId: true, agentId: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.organizationId !== orgId || doc.agentId !== agentId) throw new ForbiddenException();
  }
}
