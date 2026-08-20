import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ContactsRepository } from './contacts.repository';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly repository: ContactsRepository) {}

  async findAll(organizationId: string, search: string | undefined, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { contacts, total } = await this.repository.findByOrg(organizationId, search, skip, limit);
    return {
      contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId: string) {
    const contact = await this.repository.findById(id);
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.organizationId !== organizationId) throw new ForbiddenException();
    return contact;
  }

  async update(id: string, organizationId: string, dto: UpdateContactDto) {
    await this.findOne(id, organizationId);
    return this.repository.update(id, dto);
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.repository.softDelete(id);
  }

  async listCnpjs(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.repository.listCnpjs(id);
  }

  async addCnpj(id: string, organizationId: string, cnpj: string) {
    await this.findOne(id, organizationId);
    return this.repository.addCnpj(id, cnpj);
  }

  async updateCnpjAutoNotify(id: string, organizationId: string, cnpj: string, autoNotify: boolean) {
    await this.findOne(id, organizationId);
    return this.repository.updateCnpjAutoNotify(id, cnpj, autoNotify);
  }

  async removeCnpj(id: string, organizationId: string, cnpj: string) {
    await this.findOne(id, organizationId);
    return this.repository.removeCnpj(id, cnpj);
  }
}
