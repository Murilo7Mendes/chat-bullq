import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard, OrgGuard } from '../../common/guards';
import { CurrentOrg } from '../../common/decorators';
import { VigiaSettingsService, VIGIA_DEFAULT_TEMPLATE } from './vigia-settings.service';

class SaveTemplateDto {
  @IsString()
  @MaxLength(2000)
  messageTemplate!: string;
}

@ApiTags('Vigia')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('vigia/settings')
export class VigiaSettingsController {
  constructor(private readonly service: VigiaSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get Vigia message template for this org' })
  async get(@CurrentOrg('id') orgId: string) {
    const messageTemplate = await this.service.getTemplate(orgId);
    return { messageTemplate, defaultTemplate: VIGIA_DEFAULT_TEMPLATE };
  }

  @Patch()
  @ApiOperation({ summary: 'Save Vigia message template for this org' })
  async save(@CurrentOrg('id') orgId: string, @Body() dto: SaveTemplateDto) {
    await this.service.saveTemplate(orgId, dto.messageTemplate);
    return { messageTemplate: dto.messageTemplate };
  }
}
