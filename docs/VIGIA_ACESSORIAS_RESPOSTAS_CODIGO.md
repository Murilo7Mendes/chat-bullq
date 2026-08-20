# Vigia Acessórias → WhatsApp — Respostas do código (Chat BullQ)

> Resposta do Claude Code ao briefing [`VIGIA_ACESSORIAS_WHATSAPP.md`](./VIGIA_ACESSORIAS_WHATSAPP.md).
> **Fonte: leitura do código real da aplicação de WhatsApp (Chat BullQ), não suposição.**
> Objetivo: transformar as 5 perguntas em fatos para desenhar o vigia. Datado de 2026-08-17.

## A aplicação, em uma frase
**Chat BullQ** = plataforma omnichannel de atendimento (WhatsApp Oficial/Zappfy, Instagram, Gmail) com camada de agentes de IA. Monorepo: **api/** (NestJS 11 + Prisma/Postgres + BullMQ/Redis + Socket.io, porta 3001, prefixo `/api/v1`), **web/** (Next.js, porta 3000), **mcp/** (servidor MCP read-only, porta 3110). Roda em Docker (`docker-compose.yml`), sempre ligada.

---

## Pergunta 1 — Como a aplicação recebe uma ordem de envio?

**É uma API HTTP REST.** Não lê de fila/arquivo/planilha para envio, nem é acionada por linha de comando. Base: `http://localhost:3001/api/v1`.

Dois pontos de entrada relevantes para o vigia (ambos em `api/src/modules/messaging/messages/messages.service.ts`):

### a) Iniciar conversa com um número novo e já enviar a mensagem — **encaixe natural do vigia**
`POST /api/v1/conversations` (`conversations.controller.ts:37` → `messagesService.startConversation`):

```json
{
  "channelId": "<id do canal WhatsApp>",
  "contact": { "phone": "5511999999999", "name": "Cliente (opcional)" },
  "message": { "type": "TEXT", "content": { "text": "Suas guias chegaram: <link1> <link2>" } }
}
```

Resolve/cria o contato pelo telefone, cria/reusa a conversa e enfileira o envio (fila BullMQ `outbound-messages`). Instagram é bloqueado nesse fluxo (política Meta); **WhatsApp Zappfy e Oficial funcionam**.

### b) Enviar numa conversa já existente
`POST /api/v1/messages`:
```json
{ "conversationId": "<id>", "type": "TEXT", "content": { "text": "..." } }
```

### Formato do que espera receceber
- **Destinatário:** telefone (string, ex. `5511999999999`). Internamente vira JID `<phone>@s.whatsapp.net` no Zappfy (`contact-resolver.service.ts:248`).
- **Mensagem:** `type` (`TEXT`/`IMAGE`/`DOCUMENT`/...) + `content`. Para os links: **texto puro** em `content.text` (o WhatsApp gera o preview do link). Anexar o PDF em si exigiria `POST /messages/uploads/media` antes — desnecessário, já que o link baixa direto.

### ⚠️ Autenticação — ponto que exige decisão
Ambos os endpoints de envio exigem **JWT Bearer** (login de usuário) + guards de organização/canal. A **API pública por API key `pk_*`** (`modules/public-api/`) hoje é **somente leitura** (`/public/me`, `/public/dashboard`). **Não existe endpoint de envio autenticado por API key.**

Opções para o vigia:
1. Autenticar via `POST /api/v1/auth/login` (email+senha de um usuário de serviço) e usar o JWT retornado (com refresh).
2. Criarmos um endpoint de envio server-to-server sob API key `pk_*` (mais limpo para integração de máquina).

---

## Pergunta 2 — A aplicação resolve o contato a partir do CNPJ?

**Não. A aplicação é indexada por telefone (ou e-mail no Gmail), nunca por CNPJ.** Precisa receber o **número de telefone já pronto**.

Fatos:
- **Não existe conceito estruturado de CNPJ** no sistema. Busca por "CNPJ" no código inteiro só acha CNPJ como *fato de memória em texto livre* que a IA extrai de conversas (`ai-agents/memory/long-term/memory-extractor.service.ts`) — nada consultável, nenhum de-para.
- O modelo `Contact` tem `phone`, `email`, `metadata` (JSON livre) — **sem campo CNPJ, sem tabela CNPJ→telefone**.
- A resolução de contato (`resolveManual` em `contact-resolver.service.ts`) parte do telefone e monta o JID. Sem telefone, lança erro.

### Conclusão que destrava o escopo
A hipótese do briefing (item 25 — "a aplicação já começa pelo CNPJ e busca os contatos vinculados") **é falsa no código atual**. Portanto:

> **O vigia PRECISA do de-para CNPJ→telefone (Ponto 7 do briefing).** A planilha continua necessária — a menos que decidamos construir esse de-para como recurso novo. A aplicação não descobre o telefone a partir do CNPJ.

---

## Pergunta 3 — Onde e como a aplicação roda (para o vigia rodar ao lado)?

- **Linguagem/stack:** TypeScript + **NestJS 11** (Node). Prisma 6 (Postgres), BullMQ (Redis), Socket.io, MinIO/S3, LLM via Sakana (Fugu).
- **Hospedagem:** containers via `docker-compose.yml` — `postgres` (:5434), `redis` (:6379), `minio`, `api` (:3001), `web` (:3000), `mcp` (:3110). Todos `restart: unless-stopped` → projetada para ficar sempre ligada.
- **Agendador já existente que o vigia pode espelhar:** já há **cron BullMQ** no app. O caso mais próximo é o **poller do Gmail** (`channel-hub/adapters/gmail/gmail-polling.cron.ts`), que roda a cada 1 min (`GMAIL_POLL_PATTERN`) lendo caixas via API do Google — exatamente o padrão "observar caixa de e-mail" que o vigia precisa.

**Duas formas de rodar o vigia:**
- **(a) Módulo NestJS dentro desta API** — reusa BullMQ, Prisma, cron, e chama os services de envio direto (sem HTTP nem auth). Tende a ser mais barato e coerente, dado o poller de Gmail que já existe.
- **(b) Processo separado ao lado** — chama a API por HTTP (exige resolver a autenticação da Pergunta 1).

---

## Pergunta 4 — Múltiplos contatos, agrupar links e duplicidade

- **Vários contatos por cliente:** cada envio mira **um telefone → uma conversa**. Não há "enviar para todos os contatos de uma empresa" (não existe agrupamento por empresa/CNPJ). Se um CNPJ tiver N telefones, o vigia faz N chamadas — decisão do vigia sobre "todos" vs "principal".
- **Vários links numa mensagem só:** **suportado e recomendado.** Basta concatenar os links no `content.text`. Alinhado ao princípio "não picar em várias mensagens".
- **Controle de duplicidade:** existe idempotência **de mensagem no provider** (unique `(conversationId, externalId)`), mas **não** há dedup por "e-mail/conteúdo já enviado". O controle de "já processei este e-mail do Acessórias" é **responsabilidade do vigia** (ex.: persistir o messageId do Gmail já processado). O app não impede reenviar os mesmos links.

---

## Pergunta 5 — Restrições/condições de envio já embutidas

- **Rate limit (anti-ban):** o adapter Zappfy declara `maxPerSecond: 1, maxPerMinute: 30` (`zappfy.outbound-adapter.ts:89`), **mas `getRateLimits()` não é consumido por nenhum limiter hoje** — é declarativo. O que existe de fato: worker de saída com `concurrency: 5` + um delay de "digitando..." proporcional ao tamanho do texto. **Conclusão: a proteção de taxa é fraca; se o vigia disparar em lote, ele mesmo deve espaçar os envios.**
- **Auto-pause da IA:** quando um humano/sistema envia mensagem numa conversa, a IA daquela conversa é auto-desativada (`aiAutoDisableOnHuman`, default true). Como o vigia envia "como operador", isso **desligaria a IA** na conversa. ⚠️ Atenção: o briefing quer que o cliente responda e a conversa siga com IA — precisamos decidir se o envio do vigia deve preservar a IA ativa.
- **Guard de domínios de link:** a org tem `allowedUrlDomains` (bloqueia links fora da lista *gerados pela IA*). Não bloqueia envio manual/vigia, mas o conceito existe caso queiramos restringir.
- **Horário comercial / opt-out / blocklist:** business hours existe **só para a IA** (`agent-router.service.ts`), não para envio manual. **Não há opt-out nem blocklist de contatos** no código — se for requisito, é construção nova.

---

## Síntese para o desenho do vigia

| Item | Fato do código | Implicação para o vigia |
|---|---|---|
| Entrada de envio | `POST /conversations` (número novo) ou `POST /messages` (conversa existente) | Chamar HTTP **ou** virar módulo interno |
| Autenticação de envio | Só **JWT** hoje; API key `pk_*` é read-only | Login de serviço **ou** criar endpoint sob API key |
| CNPJ → telefone | App **não** resolve; keyed por telefone | Vigia **precisa** do de-para (planilha). Hipótese do item 25 é falsa |
| Vários links | Um `content.text` com todos os links | Agrupar num envio só ✅ |
| Dedup de e-mail | App **não** controla | Vigia guarda "e-mail já processado" |
| Anti-ban por taxa | Declarado, **não aplicado** | Vigia espaça os disparos |
| Auto-pause IA | Envio "humano" desliga a IA da conversa | Decidir se o envio deve manter a IA ativa |
| Opt-out/horário | Não existe p/ envio manual | Construir se for requisito |

## Decisões pendentes antes de virar OS
1. **Autenticação do vigia:** login JWT de um usuário de serviço **ou** novo endpoint de envio sob API key `pk_*`.
2. **Onde roda:** módulo NestJS interno (reusa infra + services, sem HTTP) **ou** processo separado ao lado (via HTTP).
3. **De-para CNPJ→telefone:** fica na planilha (vigia resolve) **ou** vira recurso do app.
4. **IA pós-envio:** manter a IA ativa na conversa após o disparo do vigia (hoje o envio a desligaria).

## Fluxo proposto (rascunho, para validar no chat)
```
cron (1 min, padrão do gmail-polling)
  → ler Gmail lucronacessorias@ (IMAP + senha de app, ou API Google já usada no app)
  → filtrar e-mails do Acessórias ainda não processados
  → extrair CNPJ (assunto) + links (botões/URLs diretas)
  → de-para CNPJ → telefone(s)  [planilha, enquanto não for recurso do app]
  → para cada telefone: POST /conversations (1 mensagem com todos os links agrupados)
  → marcar e-mail como processado (dedup)  [espaçar disparos p/ não arriscar ban]
```

> **Prioridade (lembrete do briefing):** a construção do vigia espera a cobrança de documentos (OS-07) fechar. Esta investigação/desenho pode andar em paralelo; a construção entra na vez.
