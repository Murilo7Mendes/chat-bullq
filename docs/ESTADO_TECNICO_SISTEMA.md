# Estado Técnico do Sistema — Chat BullQ

> Gerado em: 2026-08-28  
> Contexto: Documento de continuidade para não perder raciocínio entre sessões.

---

## 1. Visão Geral da Arquitetura

```
monorepo/
├── api/          NestJS — backend, fila BullMQ, agentes IA, integrações
├── web/          Next.js 16 — frontend React (App Router)
├── mcp/          MCP server (Claude Tool para uso externo)
└── docker-compose.yml
```

**Stack principal:**
- PostgreSQL 16 com extensão pgvector (imagem `pgvector/pgvector:pg16`)
- Redis 7 (BullMQ + Evolution proxy)
- MinIO (armazenamento de mídia)
- Evolution API v2 (WhatsApp)
- Anthropic Claude (LLM principal)
- Voyage AI `voyage-3` (embeddings RAG — parceiro oficial Anthropic)

**Docker Compose services:** `postgres`, `redis`, `minio`, `api`, `web`, `evolution`, `redis-proxy`, `mcp`

---

## 2. Módulo Vigia — Acessórias → WhatsApp

### O que é
Sistema que monitora uma caixa de e-mail IMAP (`lucronacessorias@gmail.com`) em busca de e-mails da Lucron Acessórias com guias/documentos tributários, extrai os links e dispara notificações via WhatsApp para os contatos cadastrados por CNPJ.

### Fluxo completo
```
IMAP polling (1 min cron, BullMQ)
  → lê e-mails novos (lookback: últimos 10min)
  → extrai CNPJ do assunto (regex)
  → busca contato no DB pelo CNPJ (tabela contact_cnpjs)
  → extrai DocEntry[] do corpo HTML (<li> elements)
  → aplica template de mensagem
  → envia WhatsApp via Evolution API
  → marca e-mail como lido
```

### Extração de documentos do e-mail (`vigia-link-extractor.ts`)

**Função chave:** `extractDocEntries(html: string): DocEntry[]`

- Itera sobre elementos `<li>` do HTML
- Extrai URL do `href` dentro do `<li>` (valida com regex DOC_LINK_RE)
- Remove elemento `<a>` inteiro do HTML da `<li>` para obter só o texto descritivo
- O texto resultante = competência + vencimento (ex: "DOCUMENTO TESTE: 07/2026 - Vencimento em: 29/08/2026")
- Remove trailing period com `.replace(/\s*\.\s*$/, '')`
- Evita URLs duplicadas com `Set<string>()`

**Interface:**
```typescript
export interface DocEntry {
  description: string;  // texto da <li> sem o link
  url: string;          // URL do documento
}
```

### Template de mensagem (`vigia-settings.service.ts`)

**Variável:** `{{documentos}}`

**Default template:**
```
Olá! Segue(m) o(s) documento(s) disponibilizado(s) pela sua contabilidade:

{{documentos}}
```

**Expansão de `{{documentos}}`** (um bloco por DocEntry):
```
{description}
«Clique aqui para acessar» → {url}
```
Separados por `\n\n`.

**Variáveis antigas removidas:** `{{assunto}}` e `{{links}}` foram substituídas por `{{documentos}}` (inclui competência + vencimento + link).

### Arquivos relevantes
```
api/src/modules/vigia/
  vigia-cron.service.ts       — BullMQ processor, orquestra o fluxo
  vigia-link-extractor.ts     — extractDocEntries(), DOC_LINK_RE
  vigia-settings.service.ts   — applyTemplate(), CRUD settings
  vigia.module.ts
web/src/app/(dashboard)/settings/vigia/page.tsx  — UI de settings
```

### Env vars Vigia
```
VIGIA_GMAIL_USER=lucronacessorias@gmail.com
VIGIA_GMAIL_APP_PASSWORD=bpjyswgwtmpgxiis
VIGIA_CHANNEL_ID=cmt1vv0ls0001s007ngdhfc71
VIGIA_POLL_PATTERN=*/1 * * * *
VIGIA_LOOKBACK_MINUTES=10
```

### Ajuste CNPJ Bruna (2026-08-28)
- CNPJ `62111705000133` estava ligado ao contato teste `cvigia_bruna_001`
- Corrigido via SQL direto: `UPDATE contact_cnpjs SET contact_id = 'cmt3363jf003olo07ipry3vs6' WHERE contact_id = 'cvigia_bruna_001' AND cnpj = '62111705000133'`

---

## 3. Agentes de IA — Arquitetura

### Tipos de agente
- **ORCHESTRATOR**: recebe mensagens, classifica intenção, delega para workers
- **WORKER**: especialistas (ex: Lucron Contabilidade)

### Fluxo de uma mensagem
```
Mensagem WhatsApp
  → AiAgentRunnerService.run()
  → IntentClassifier (classifica intent, descarta SPAM)
  → AgentRouterService.selectAgent() — escolhe ORCHESTRATOR ou WORKER
  → augmentSystemPromptWithLayers()
      1. Security Layer (cacheable) — regras da org
      2. Knowledge Base retrieval (RAG docs, k=5, score≥0.72)
      3. History RAG retrieval (mensagens/fatos/memória, k=5, score≥0.7)
  → LLM call (Anthropic Claude)
  → Tool execution loop (máx 8 iterações)
  → replyToConversation → Evolution → WhatsApp
  → pós-run: memory-extractor + rag-indexer (async)
```

### Configuração IA por conversa/canal/org
- `conv.aiEnabled = true` → força IA ligada
- `conv.aiEnabled = false` → IA pausada
- `conv.aiEnabled = null` → herda canal → org

**Estado atual (2026-08-28):**
- `org.aiEnabled = false` (IA pausada globalmente)
- Exceção: conversa Lucron (554831921590) com `conv.aiEnabled = true`

### Modelos LLM
- Configurados em `llm.constants.ts` e `model-router.service.ts`
- Agente Lucron usa Anthropic Claude (`ANTHROPIC_API_KEY` no `.env`)

---

## 4. OS-01 — Base de Conhecimento + Feriados (em progresso)

### Status de cada etapa

| Etapa | Descrição | Status |
|-------|-----------|--------|
| 1 | CRUD backend de documentos knowledge | ✅ Concluída |
| 2 | Chunking + Embeddings (Voyage AI) | ✅ Concluída |
| 3 | Retrieval no prompt do agente | ✅ Concluída |
| 4 | Frontend UI (tab Base de Conhecimento) | ✅ Concluída* |
| 5 | Feriados + tool `calcular_dia_util` | ⏳ Não iniciada |

*Etapa 4 implementada mas com bug de carregamento na página `/ai-agents?tab=agents` — investigar.

---

### Etapa 1 — CRUD de Documentos (✅)

**Modelo Prisma:** `AiKnowledgeDocument`
```prisma
model AiKnowledgeDocument {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  agentId        String   @map("agent_id")
  title          String
  content        String   @db.Text
  chunkCount     Int      @default(0) @map("chunk_count")
  status         String   @default("pending")  // pending|indexing|ready|error
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  organization   Organization @relation(fields: [organizationId], references: [id])
  agent          AiAgent      @relation(fields: [agentId], references: [id], onDelete: Cascade)
  @@index([agentId], name: "idx_knowledge_agent")
  @@map("ai_knowledge_documents")
}
```

**Tabela criada manualmente** via `psql` (a migration Prisma gerou SQL vazio por usar imagem antiga antes de rebuild).

**Endpoints REST:**
```
GET    /api/v1/ai/agents/:agentId/knowledge
POST   /api/v1/ai/agents/:agentId/knowledge
PATCH  /api/v1/ai/agents/:agentId/knowledge/:id
DELETE /api/v1/ai/agents/:agentId/knowledge/:id
```

**Arquivos:**
```
api/src/modules/ai-agents/knowledge/
  knowledge.service.ts    — CRUD + enqueue indexing
  knowledge.controller.ts — REST endpoints
  knowledge.module.ts     — NestJS module
  dto/create-knowledge.dto.ts
  dto/update-knowledge.dto.ts
```

---

### Etapa 2 — Chunking + Embeddings (✅)

**Chunker** (`api/src/modules/ai-agents/rag/chunker.ts`):
- `CHUNK_SIZE = 800` caracteres
- `OVERLAP = 100` caracteres
- Split por `\n\n` (parágrafos), depois por sentenças se parágrafo > 800 chars
- Retorna `TextChunk[]` com `{ content, index }`

**Voyage AI Embeddings** (`api/src/modules/ai-agents/rag/embeddings.service.ts`):
- Modelo: `voyage-3` (1024 dims)
- Custo: $0.06/1M tokens
- Endpoint: `https://api.voyageai.com/v1/embeddings`
- `input_type: 'document'`
- Env var: `VOYAGE_API_KEY=pa-VAZEOirVKQ91ewOr8sDuTlxwFAO9kgiv3Q230CeqD1B`
- **Substituiu OpenAI** (chave era placeholder)

**Tabela pgvector** `ai_vector_entries`:
```sql
-- Criada manualmente (pgvector requer pgvector/pgvector:pg16 image)
-- vector(1024) — 1024 dims do voyage-3
-- owner_type: 'message' | 'fact' | 'memory_summary' | 'document'
-- Para documentos: agent_id preenchido, contact_id e conversation_id NULL
```

**Indexer Processor** (`api/src/modules/ai-agents/rag/indexer.processor.ts`):
- Queue: `rag-indexer`, concurrency: 4
- Case `index_document`:
  1. Update doc → status `'indexing'`
  2. Delete chunks antigos (`deleteByOwnerPrefix('document', '{docId}:chunk:')`)
  3. `embedBatch(chunks)` — 1 chamada Voyage AI
  4. Upsert cada chunk: `id = 'document:{docId}:chunk:{i}'`
  5. Update doc → status `'ready'`, chunkCount = N

**VectorStoreService** — adição: `deleteByOwnerPrefix(ownerType, ownerIdPrefix)` para limpeza de re-indexação.

**Teste confirmado:**
```
embedding_batch count=3 tokens=95 costUsd=0.000006 ms=571
rag_indexed_document docId=test_knowledge_001 chunks=3 tokens=96 costUsd=0.000006
```

---

### Etapa 3 — Retrieval no Prompt (✅)

**Arquivo:** `api/src/modules/ai-agents/runner/agent-runner.service.ts`

**Método:** `augmentSystemPromptWithLayers()` — agora faz 3 injeções no system prompt:

```
[1] Security Layer (prepend, cacheable)
     → regras imutáveis da org (cache Anthropic)

[2] Base de conhecimento (append, NÃO cacheable)
     scope: { agentId, ownerType: 'document' }
     k=5, minScore=0.72
     → "═══ Base de conhecimento ═══\n{chunks}\nUse essas informações..."

[3] Histórico RAG (append, NÃO cacheable)
     scope: { agentId, contactId, conversationId, ownerType: 'any' }
     k=5, minScore=0.7
     → "═══ Trechos relevantes do histórico (RAG) ═══\n{chunks}\nUse esses trechos..."
```

**Importante:** documentos têm `contact_id = NULL` na tabela, por isso precisam de retrieval separada sem filtro de contactId.

---

### Etapa 4 — Frontend (✅ com bug)

**Serviço:** `web/src/features/ai-agents/services/knowledge.service.ts`
```typescript
knowledgeService.list(agentId)   // GET
knowledgeService.create(agentId, dto)  // POST
knowledgeService.update(agentId, id, dto)  // PATCH
knowledgeService.remove(agentId, id)  // DELETE
```

**Componente:** `AgentKnowledgeBase` em `edit-agent-dialog.tsx`
- Lista documentos com badge de status (Pendente / Indexando… / Pronto / Erro)
- Polling automático a cada 3s quando há docs pendentes/indexando (`useState polling`)
- Formulário create/edit com título + textarea
- Botão excluir por documento

**Bug em aberto:** a página `/ai-agents?tab=agents` mostra "This page couldn't load" no browser do usuário. Possível causa: cache do Docker (rebuild com `--no-cache` foi feito), ou cache do browser (Ctrl+Shift+R), ou SSR error em algum chunk. Investigar.

---

### Etapa 5 — Feriados + `calcular_dia_util` (⏳ Próxima)

**O que precisa ser feito:**

#### Backend
1. **`api/prisma/schema.prisma`** — modelo `Holiday`:
   ```prisma
   model Holiday {
     id             String   @id @default(cuid())
     organizationId String   @map("organization_id")
     date           DateTime @db.Date
     description    String
     city           String?
     state          String?
     scope          String   @default("national") // national|state|city
     createdAt      DateTime @default(now()) @map("created_at")
     organization   Organization @relation(...)
     @@index([organizationId, date])
     @@map("holidays")
   }
   ```

2. **`api/src/modules/settings/holidays/holidays.service.ts`**:
   - `list(orgId, year?, state?, city?)`
   - `create/update/remove`
   - `seedNationalHolidays(orgId, year)` — feriados nacionais + datas móveis (Carnaval, Corpus Christi, Sexta-feira Santa via algoritmo Gauss/Meeus)
   - `getNthBusinessDay(orgId, month, year, n, state?, city?)` — n-ésimo dia útil
   - `isBusinessDay(orgId, date, state?, city?)`

3. **`api/src/modules/settings/holidays/holidays.controller.ts`** — REST + `/seed`

4. **`api/src/modules/ai-agents/tools/builtin/calcular-dia-util.tool.ts`**:
   - Tool que o LLM chama
   - Parâmetros: `{ mes: number, ano: number, n: number, estado?: string, cidade?: string }`
   - Delega para `HolidaysService.getNthBusinessDay()`
   - Registrada para ORCHESTRATOR + WORKER no `ToolRegistry`

#### Frontend
5. **`web/src/app/(dashboard)/settings/holidays/page.tsx`** — tabela de feriados com filtros ano/UF, botões CRUD, botão "Gerar feriados nacionais"
6. **Link "Feriados" no menu de settings**

**Teste final esperado:**
- Usuário envia: "quando vence a folha de setembro?"
- Agente chama `calcular_dia_util(mes=10, ano=2026, n=5)`
- Agente responde: "07/10/2026 (quarta-feira)"

---

## 5. Infraestrutura — Fixes Importantes

### Evolution Redis Proxy
- Evolution v2.3.7 hardcoda `localhost:6379`
- Fix: serviço `redis-proxy` com `alpine/socat` usando `network_mode: "container:chat-evolution"`
- Redireciona `127.0.0.1:6379` → `redis:6379`

### pgvector
- **OBRIGATÓRIO**: usar imagem `pgvector/pgvector:pg16` (não `postgres:16-alpine`)
- A extensão `vector` precisa ser criada: `CREATE EXTENSION IF NOT EXISTS vector;`
- Tabela `ai_vector_entries` usa `vector(1024)` (Voyage AI voyage-3)

### Evolution sendMedia
- **NÃO aceita**: URL interna Docker (`http://api:3001/...`)
- **NÃO aceita**: data URI (`data:image/png;base64,...`)
- **ACEITA**: base64 puro (string sem prefixo) no campo `media`

---

## 6. Variáveis de Ambiente Críticas (api/.env)

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...   # LLM principal
VOYAGE_API_KEY=pa-VAZEOirVKQ...      # Embeddings RAG
OPENAI_API_KEY=sk-proj-your-key-here # NÃO USADO — placeholder

EVOLUTION_API_KEY=bullq-evolution-secret
EVOLUTION_BASE_URL=http://evolution:8080

VIGIA_GMAIL_USER=lucronacessorias@gmail.com
VIGIA_GMAIL_APP_PASSWORD=bpjyswgwtmpgxiis
VIGIA_CHANNEL_ID=cmt1vv0ls0001s007ngdhfc71
```

---

## 7. IDs Importantes no Banco

```
Organização principal: cmsf2yqxt0001vt3gtt3nftu9
Agente Lucron:         cmt3dlj6p00kdmv07q5us20qi
Conversa Lucron:       (conversa com contato 554831921590, aiEnabled=true)
Contato Bruna:         cmt3363jf003olo07ipry3vs6
CNPJ Bruna:            62111705000133
```

---

## 8. Problema Aberto — Edit Agent Dialog

**Sintoma:** `http://localhost:3000/ai-agents?tab=agents` mostra "This page couldn't load" no browser do usuário.

**O que já foi feito:**
- Rebuild completo do web com `--no-cache` (sem erros de compilação)
- TypeScript compila sem erros (`tsc --noEmit`)
- Container retorna HTTP 200 internamente
- Container está `healthy`
- O problema PODE ser cache do Docker (layers cacheados) — rebuild --no-cache foi feito

**Hipóteses restantes:**
1. Cache do browser — tentar Ctrl+Shift+R
2. Chunk JS cacheado com versão antiga — hard refresh
3. SSR error em alguma rota que o health check não detecta
4. Problema de porta no Docker Desktop (Windows)

**Próximo passo:** verificar nos logs do container se há erro ao renderizar a página específica; verificar se a rota SSR tem algum problema; considerar adicionar tratamento de erro no componente `AgentKnowledgeBase`.

---

## 9. Plano Arquivo Original (OS-01)

Localização: `docs/ordem de servico/os_01.md`

Etapas conforme o plano em `C:\Users\Usuario\.claude\plans\crispy-soaring-book.md` — 5 etapas onde as 4 primeiras estão concluídas no código (backend + frontend) e apenas a Etapa 5 (Feriados) não foi iniciada.
