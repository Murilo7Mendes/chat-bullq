import { Controller, Get, Post, Patch, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard, OrgGuard } from '../../common/guards';
import { CurrentOrg } from '../../common/decorators';
import { VigiaSettingsService, VIGIA_DEFAULT_TEMPLATE } from './vigia-settings.service';
import { VigiaStatusService } from './vigia-status.service';
import { VigiaImapService } from './vigia-imap.service';

class SaveTemplateDto {
  @IsString()
  @MaxLength(2000)
  messageTemplate!: string;
}

@ApiTags('Vigia')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('vigia')
export class VigiaSettingsController {
  constructor(
    private readonly service: VigiaSettingsService,
    private readonly statusSvc: VigiaStatusService,
    private readonly imap: VigiaImapService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get Vigia message template for this org' })
  async get(@CurrentOrg('id') orgId: string) {
    const messageTemplate = await this.service.getTemplate(orgId);
    return { messageTemplate, defaultTemplate: VIGIA_DEFAULT_TEMPLATE };
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Save Vigia message template for this org' })
  async save(@CurrentOrg('id') orgId: string, @Body() dto: SaveTemplateDto) {
    await this.service.saveTemplate(orgId, dto.messageTemplate);
    return { messageTemplate: dto.messageTemplate };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Vigia connection and processing status' })
  async getStatus(@CurrentOrg('id') orgId: string) {
    return this.statusSvc.get(orgId);
  }

  @Post('reconnect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Force Vigia IMAP reconnection' })
  async reconnect() {
    await this.imap.reconnect();
    return { ok: true };
  }
}
