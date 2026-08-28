import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../database/prisma.module';
import { RagModule } from '../rag/rag.module';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [PrismaModule, RagModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
