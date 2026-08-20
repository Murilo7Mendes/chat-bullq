/**
 * Despeja o texto puro e o HTML do e-mail mais recente do Acessórias
 * para localizar onde o CNPJ aparece.
 *
 * Uso: npx ts-node -T scripts/vigia-dump-email.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const user = process.env.VIGIA_GMAIL_USER!;
  const pass = process.env.VIGIA_GMAIL_APP_PASSWORD!;

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const status = await client.status('INBOX', { messages: true });
    const total = status.messages ?? 0;

    // Pega os últimos 20 e encontra o mais recente do Acessórias
    const from = Math.max(1, total - 20 + 1);
    let found: { text: string; html: string; subject: string } | null = null;

    for await (const msg of client.fetch(`${from}:*`, { source: true, uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source as Buffer);
      const fromAddr = parsed.from?.text ?? '';
      if (!fromAddr.toLowerCase().includes('acessorias')) continue;

      found = {
        subject: parsed.subject ?? '',
        text: parsed.text ?? '',
        html: typeof parsed.html === 'string' ? parsed.html : '',
      };
      // Pega o mais recente — sobrescreve (fetch vai do mais antigo ao mais novo)
    }

    if (!found) {
      console.log('Nenhum e-mail do Acessórias encontrado nos últimos 20.');
      return;
    }

    console.log('\n══ ASSUNTO ══════════════════════════════════════════');
    console.log(found.subject);

    console.log('\n══ TEXTO PURO (primeiros 2000 chars) ════════════════');
    console.log(found.text.slice(0, 2000));

    console.log('\n══ HTML (primeiros 3000 chars) ══════════════════════');
    // Remove tags para facilitar leitura, mantendo estrutura
    console.log(found.html.slice(0, 3000));

  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch((err) => {
  console.error('Erro:', err?.message ?? err);
  process.exit(1);
});
