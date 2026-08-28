import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DocEntry } from './vigia-link-extractor';

export const VIGIA_DEFAULT_TEMPLATE =
  'Olá! Segue(m) o(s) documento(s) disponibilizado(s) pela sua contabilidade:\n\n{{documentos}}';

const LINK_PREFIX = '«Clique aqui para acessar» → ';

@Injectable()
export class VigiaSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplate(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    return (settings.vigiaMessageTemplate as string) || VIGIA_DEFAULT_TEMPLATE;
  }

  async saveTemplate(organizationId: string, template: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const current = (org?.settings ?? {}) as Record<string, unknown>;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: { ...current, vigiaMessageTemplate: template } },
    });
  }

  /** Aplica o template substituindo {{documentos}} com cada entrada doc+link. */
  applyTemplate(template: string, entries: DocEntry[]): string {
    const formattedDocs = entries
      .map((e) => `${e.description}\n${LINK_PREFIX}${e.url}`)
      .join('\n\n');
    return template.replace(/\{\{documentos\}\}/g, formattedDocs);
  }
}
