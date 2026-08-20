const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
// Apenas links diretos de documento do Acessórias
const DOC_LINK_RE = /^https?:\/\/app\.acessorias\.com\/getguia\.php/i;

/**
 * Extrai o CNPJ do HTML do e-mail.
 * O Acessórias coloca o CNPJ como primeiro conteúdo em <strong> no topo do HTML.
 * Busca nos primeiros 500 chars do HTML onde a densidade de tags é baixa.
 */
export function extractCnpjFromHtml(html: string): string | null {
  // Pega os primeiros 500 chars e remove tags HTML para ler o texto limpo
  const top = html.slice(0, 500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const match = top.match(CNPJ_REGEX);
  return match ? normalizeCnpj(match[1]) : null;
}

/**
 * Extrai só os links de documento do Acessórias do HTML.
 * Descarta rodapés de marketing (redes sociais, app stores, etc.).
 */
export function extractDocLinks(html: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = decodeHtmlEntities(m[1].trim());
    if (!DOC_LINK_RE.test(url) || seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

/** Normaliza CNPJ removendo pontuação (retorna 14 dígitos). */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}
