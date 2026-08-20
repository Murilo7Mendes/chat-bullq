import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { IsString, IsBoolean, Matches } from 'class-validator';
import { ContactsService } from './contacts.service';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentOrg, Roles } from '../../../common/decorators';

class AddCnpjDto {
  @IsString()
  @Matches(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, { message: 'CNPJ inválido (14 dígitos ou formatado)' })
  cnpj!: string;
}

class PatchCnpjDto {
  @IsBoolean()
  autoNotify!: boolean;
}

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts with search and pagination' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentOrg('id') orgId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(orgId, search, parseInt(page || '1', 10), parseInt(limit || '20', 10));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact detail with channels, tags, conversations' })
  findOne(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact (name, phone, email, notes, metadata)' })
  update(@Param('id') id: string, @CurrentOrg('id') orgId: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete contact' })
  remove(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.remove(id, orgId);
  }

  @Get(':id/cnpjs')
  @ApiOperation({ summary: 'List CNPJs linked to a contact' })
  listCnpjs(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.listCnpjs(id, orgId);
  }

  @Post(':id/cnpjs')
  @ApiOperation({ summary: 'Add CNPJ to contact' })
  addCnpj(@Param('id') id: string, @CurrentOrg('id') orgId: string, @Body() dto: AddCnpjDto) {
    return this.service.addCnpj(id, orgId, dto.cnpj);
  }

  @Patch(':id/cnpjs/:cnpj')
  @ApiOperation({ summary: 'Toggle auto_notify for a contact CNPJ link' })
  updateCnpj(
    @Param('id') id: string,
    @Param('cnpj') cnpj: string,
    @CurrentOrg('id') orgId: string,
    @Body() dto: PatchCnpjDto,
  ) {
    return this.service.updateCnpjAutoNotify(id, orgId, cnpj, dto.autoNotify);
  }

  @Delete(':id/cnpjs/:cnpj')
  @ApiOperation({ summary: 'Remove CNPJ from contact' })
  removeCnpj(@Param('id') id: string, @Param('cnpj') cnpj: string, @CurrentOrg('id') orgId: string) {
    return this.service.removeCnpj(id, orgId, cnpj);
  }
}
