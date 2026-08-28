const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const DOC_LINK_RE = /^https?:\/\/app\.acessorias\.com\/getguia\.php/i;

export interface DocEntry {
  description: string;
  url: string;
}

export function extractCnpjFromHtml(html: string): string | null {
  const top = html.slice(0, 500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const match = top.match(CNPJ_REGEX);
  return match ? normalizeCnpj(match[1]) : null;
}

/**
 * Extrai entradas de documento do corpo do e-mail.
 * Cada <li> que contenha um link getguia.php retorna {description, url},
 * onde description vem do texto do <strong> (nome, competência e vencimento).
 */
export function extractDocEntries(html: string): DocEntry[] {
  const entries: DocEntry[] = [];
  const seenUrls = new Set<string>();

  for (const liMatch of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const liHtml = liMatch[1];

    let url: string | null = null;
    for (const aMatch of liHtml.matchAll(/href=["']([^"']+)["']/gi)) {
      const candidate = decodeHtmlEntities(aMatch[1].trim());
      if (DOC_LINK_RE.test(candidate)) { url = candidate; break; }
    }
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Remove o elemento <a> inteiro (texto âncora repete o nome), pega o restante
    const description = liHtml
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/«[^»]*»/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\.\s*$/, '')
      .trim();

    if (description) entries.push({ description, url });
  }

  return entries;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}
