import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { normalizeCnpj } from '../../vigia/vigia-link-extractor';

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrg(
    organizationId: string,
    search: string | undefined,
    skip: number,
    take: number,
  ) {
    const where: Prisma.ContactWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: {
          channels: { include: { channel: { select: { id: true, type: true, name: true } } } },
          tags: { include: { tag: true } },
          _count: { select: { conversations: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  }

  async findById(id: string) {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: {
        channels: { include: { channel: { select: { id: true, type: true, name: true } } } },
        tags: { include: { tag: true } },
        cnpjs: { orderBy: { createdAt: 'asc' } },
        conversations: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            channel: { select: { type: true, name: true } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, type: true, createdAt: true } },
          },
        },
      },
    });
  }

  async listCnpjs(contactId: string) {
    return this.prisma.contactCnpj.findMany({ where: { contactId }, orderBy: { createdAt: 'asc' } });
  }

  async addCnpj(contactId: string, cnpj: string) {
    const normalized = normalizeCnpj(cnpj);
    return this.prisma.contactCnpj.upsert({
      where: { uq_contact_cnpj: { contactId, cnpj: normalized } },
      create: { contactId, cnpj: normalized, autoNotify: false },
      update: {},
    });
  }

  async updateCnpjAutoNotify(contactId: string, cnpj: string, autoNotify: boolean) {
    const normalized = normalizeCnpj(cnpj);
    return this.prisma.contactCnpj.update({
      where: { uq_contact_cnpj: { contactId, cnpj: normalized } },
      data: { autoNotify },
    });
  }

  async removeCnpj(contactId: string, cnpj: string) {
    const normalized = normalizeCnpj(cnpj);
    return this.prisma.contactCnpj.delete({
      where: { uq_contact_cnpj: { contactId, cnpj: normalized } },
    });
  }

  async update(id: string, data: Prisma.ContactUpdateInput) {
    return this.prisma.contact.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return this.prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
