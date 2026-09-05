import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('AI Knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('ai/agents/:agentId/knowledge')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'List knowledge documents for an agent' })
  list(@CurrentOrg('id') orgId: string, @Param('agentId') agentId: string) {
    return this.service.list(orgId, agentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a knowledge document (with content)' })
  findOne(
    @CurrentOrg('id') orgId: string,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(orgId, agentId, id);
  }

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Create a knowledge document' })
  create(
    @CurrentOrg('id') orgId: string,
    @Param('agentId') agentId: string,
    @Body() dto: CreateKnowledgeDto,
  ) {
    return this.service.create(orgId, agentId, dto);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update a knowledge document' })
  update(
    @CurrentOrg('id') orgId: string,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return this.service.update(orgId, agentId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledge document' })
  remove(
    @CurrentOrg('id') orgId: string,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(orgId, agentId, id);
  }
}
