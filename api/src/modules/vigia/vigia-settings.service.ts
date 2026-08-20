import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export const VIGIA_DEFAULT_TEMPLATE =
  '{{assunto}}\nClique no link para acessar o arquivo.\n{{links}}';

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

  /** Aplica o template substituindo {{assunto}} e {{links}}. */
  applyTemplate(template: string, subject: string, links: string[]): string {
    const formattedLinks = links.map((l) => `${LINK_PREFIX}${l}`).join('\n');
    return template
      .replace(/\{\{assunto\}\}/g, subject)
      .replace(/\{\{links\}\}/g, formattedLinks);
  }
}
