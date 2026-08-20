/**
 * Diagnóstico do vigia — lê os últimos e-mails da caixa e imprime
 * o que o vigia identificaria: CNPJ (corpo), links e mensagem montada.
 *
 * Critérios do vigia:
 *   - CNPJ é o PRIMEIRO campo do corpo do e-mail (texto puro)
 *   - Só links de app.acessorias.com/getguia.php são considerados documentos
 *
 * NÃO envia nada ao WhatsApp.
 *
 * Uso:
 *   npx ts-node -T scripts/vigia-test-imap.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const MAX_EMAILS = 10;
const DOC_LINK_RE = /^https?:\/\/app\.acessorias\.com\/getguia\.php/i;

function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}

function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

/**
 * CNPJ é o primeiro conteúdo do HTML (dentro de <strong> no topo).
 * Remove tags e busca nos primeiros 500 chars.
 */
function extractCnpjFromHtml(html: string): string | null {
  const top = html.slice(0, 500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const match = top.match(CNPJ_REGEX);
  return match ? normalizeCnpj(match[0]) : null;
}

/** Só links de documento do Acessórias — filtra rodapé de marketing. */
function extractDocLinks(html: string): string[] {
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

async function main() {
  const user = process.env.VIGIA_GMAIL_USER;
  const pass = process.env.VIGIA_GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error('❌  VIGIA_GMAIL_USER ou VIGIA_GMAIL_APP_PASSWORD não definidos no .env');
    process.exit(1);
  }

  console.log(`\n🔌  Conectando ao IMAP como ${user} ...`);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  console.log('✅  Conectado.\n');

  const lock = await client.getMailboxLock('INBOX');
  try {
    const status = await client.status('INBOX', { messages: true, unseen: true });
    const total = status.messages ?? 0;
    const unseen = status.unseen ?? 0;
    console.log(`📬  INBOX: ${total} total, ${unseen} não lidos\n`);

    if (total === 0) {
      console.log('Caixa vazia.');
      return;
    }

    const from = Math.max(1, total - MAX_EMAILS + 1);
    const range = `${from}:*`;
    console.log(`📥  Lendo sequência ${range} (até ${MAX_EMAILS} e-mails)...\n`);
    console.log('═'.repeat(72));

    let idx = 0;
    let vigiaProcessaria = 0;

    for await (const msg of client.fetch(range, { source: true, uid: true, flags: true })) {
      if (!msg.source) continue;
      idx++;

      const parsed = await simpleParser(msg.source as Buffer);
      const subject = parsed.subject ?? '(sem assunto)';
      const fromAddr = parsed.from?.text ?? '?';
      const html = typeof parsed.html === 'string' ? parsed.html : '';
      const text = parsed.text ?? '';
      const isUnseen = !msg.flags?.has('\\Seen');

      console.log(`\n[${idx}] ${isUnseen ? '🔵 NÃO LIDO' : '⚪ lido'}`);
      console.log(`    De      : ${fromAddr}`);
      console.log(`    Assunto : ${subject}`);

      // ── Início do HTML (para diagnóstico) ──
      const htmlTop = html.slice(0, 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      console.log(`    HTML↵   : "${htmlTop}"`);

      // ── CNPJ (primeiro conteúdo do HTML) ──
      const cnpj = extractCnpjFromHtml(html);
      if (cnpj) {
        console.log(`    CNPJ    : ✅ ${formatCnpj(cnpj)}  (${cnpj})`);
      } else {
        console.log(`    CNPJ    : ❌ não encontrado no início do corpo`);
      }

      // ── Links de documento ──
      const links = extractDocLinks(html);
      if (links.length > 0) {
        console.log(`    Docs    : ✅ ${links.length} link(s) do Acessórias:`);
        links.forEach((l, i) => console.log(`               [${i + 1}] ${l}`));
      } else {
        console.log(`    Docs    : ❌ nenhum link app.acessorias.com encontrado`);
      }

      // ── Veredicto: o vigia processaria este e-mail? ──
      const processaria = !!cnpj && links.length > 0;
      if (processaria) {
        vigiaProcessaria++;
        const mensagem = links.join('\n');
        console.log(`\n    📱 PROCESSARIA — mensagem que seria enviada:`);
        console.log('    ┌' + '─'.repeat(62));
        mensagem.split('\n').forEach((l) => console.log(`    │ ${l}`));
        console.log('    └' + '─'.repeat(62));
      } else {
        const motivo = !cnpj ? 'sem CNPJ no corpo' : 'sem links do Acessórias';
        console.log(`\n    ⏭  IGNORARIA — ${motivo}`);
      }

      console.log('─'.repeat(72));
    }

    console.log(`\n📊  Resumo: ${idx} e-mail(s) analisados | ${vigiaProcessaria} seriam processados\n`);
  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch((err) => {
  console.error('\n❌  Erro:', err?.message ?? err);
  process.exit(1);
});
