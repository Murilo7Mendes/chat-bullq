# Estado Técnico do Sistema — Chat BullQ

> **Documento vivo** — atualizar sempre que houver mudança significativa na arquitetura, modelos, IDs, env vars ou fluxos.  
> Última atualização: 2026-08-28

---

## REGRA CRÍTICA: Backend ↔ Frontend em Sincronia

> **Toda alteração no backend DEVE ser verificada quanto à necessidade de atualização no frontend, sem exceções.**

| Tipo de alteração backend | O que verificar no frontend |
|---|---|
| Novo endpoint / rota | Criar/atualizar service client (`*.service.ts` em `web/src/features/`) |
| Response envelope (`{data, meta}`) | O frontend usa `.data.data ?? .data`, nunca só `.data` |
| Novo modelo de banco | Verificar se há UI para gerenciar (settings, dialogs) |
| Mudança de modelo LLM | Atualizar `CURATED_MODELS` e `DEFAULT_AGENT_MODEL` em `ai-agents.service.ts` |
| Nova guard/permissão | Verificar se UI respeita a mesma regra de acesso |
| Mudança de formato de resposta | Atualizar tipagem e parsing em todos os clients HTTP do web |
| Novo campo em entidade | Atualizar interfaces TypeScript no frontend |

**Padrão de resposta da API:** o `ResponseInterceptor` global envolve **todas** as respostas:
```json
{ "data": <payload>, "meta": { "timestamp": "..." } }
```
No frontend, sempre usar: `r.data.data ?? r.data` (nunca só `r.data`).

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
- Anthropic Claude (LLM principal — modelos claude-sonnet-5 / claude-haiku-4-5)
- Voyage AI `voyage-3` (embeddings RAG — parceiro oficial Anthropic)

**Docker Compose services:** `postgres`, `redis`, `minio`, `api`, `web`, `evolution`, `redis-proxy`, `mcp`

---

## 2. Módulo Vigia — Acessórias → WhatsApp

### O que é
Sistema que monitora caixa de e-mail IMAP (`lucronacessorias@gmail.com`) em busca de e-mails da Lucron Acessórias com guias/documentos tributários, extrai os links e dispara notificações via WhatsApp para os contatos cadastrados por CNPJ.

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
- Corrigido via SQL: `UPDATE contact_cnpjs SET contact_id = 'cmt3363jf003olo07ipry3vs6' WHERE contact_id = 'cvigia_bruna_001' AND cnpj = '62111705000133'`

---

## 3. Agentes de IA — Arquitetura

### Tipos de agente
- **ORCHESTRATOR**: recebe mensagens, classifica intenção, delega para workers
- **WORKER**: especialistas (ex: Lulu — primeiro atendimento ao cliente)

### Fluxo de uma mensagem
```
Mensagem WhatsApp
  → AiAgentRunnerService.run()
  → IntentClassifier (classifica intent, descarta SPAM)
  → AgentRouterService.selectAgent() — escolhe ORCHESTRATOR ou WORKER
  → augmentSystemPromptWithLayers()
      1. Security Layer (prepend, cacheable) — regras da org
      2. Knowledge Base retrieval (RAG docs, k=5, score≥0.72)
      3. History RAG retrieval (mensagens/fatos/memória, k=5, score≥0.7)
  → LLM call (Anthropic Claude)
  → Tool execution loop (máx 8 iterações)
  → replyToConversation → Evolution → WhatsApp
  → pós-run: memory-extractor + rag-indexer (async)
```

### Modelos LLM (Anthropic Claude)

```typescript
// api/src/modules/ai-agents/llm/llm.constants.ts
CLAUDE_SIMPLE_MODEL      = 'claude-haiku-4-5-20251001'  // tool calls — barato/rápido
CLAUDE_CONVERSATION_MODEL = 'claude-sonnet-5'            // síntese — qualidade

// Aliases mantidos por compatibilidade com ModelRouterService
SAKANA_SIMPLE_MODEL      = CLAUDE_SIMPLE_MODEL
SAKANA_CONVERSATION_MODEL = CLAUDE_CONVERSATION_MODEL
```

**Roteamento** (ModelRouterService):
- `phase = 'tool'` → sempre usa Haiku (barato)
- `phase = 'synthesis'` + WORKER → escala para Sonnet (qualidade para o cliente)
- `phase = 'synthesis'` + ORCHESTRATOR → fica no Haiku (triagem/small-talk)

**Frontend (ai-agents.service.ts):**
```typescript
DEFAULT_AGENT_MODEL = 'claude-sonnet-5'
SIMPLE_TASK_MODEL   = 'claude-haiku-4-5-20251001'
```

### Configuração IA por conversa/canal/org
- `conv.aiEnabled = true` → força IA ligada
- `conv.aiEnabled = false` → IA pausada
- `conv.aiEnabled = null` → herda canal → org

**Estado atual (2026-08-28):**
- `org.aiEnabled = false` (IA pausada globalmente)
- Exceção: conversa Lucron (554831921590) com `conv.aiEnabled = true`

---

## 4. OS-01 — Base de Conhecimento + Feriados

### Status de cada etapa

| Etapa | Descrição | Status |
|-------|-----------|--------|
| 1 | CRUD backend de documentos knowledge | ✅ Concluída |
| 2 | Chunking + Embeddings (Voyage AI) | ✅ Concluída |
| 3 | Retrieval no prompt do agente | ✅ Concluída |
| 4 | Frontend UI (tab Base de Conhecimento) | ✅ Concluída |
| 5 | Feriados + tool `calcular_dia_util` | ⏳ Não iniciada |

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

**Tabela criada manualmente** via `psql` (migration Prisma gerou SQL vazio por usar imagem antiga antes do rebuild).

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
- `CHUNK_SIZE = 800` chars, `OVERLAP = 100` chars
- Split por `\n\n` (parágrafos), depois por sentenças se parágrafo > 800 chars

**Voyage AI** (`api/src/modules/ai-agents/rag/embeddings.service.ts`):
- Modelo: `voyage-3` (1024 dims), custo: $0.06/1M tokens
- Endpoint: `https://api.voyageai.com/v1/embeddings`, `input_type: 'document'`
- Env var: `VOYAGE_API_KEY`

**Indexer Processor** (`api/src/modules/ai-agents/rag/indexer.processor.ts`):
- Queue: `rag-indexer`, case `index_document`:
  1. Update doc → status `'indexing'`
  2. Delete chunks antigos (`deleteByOwnerPrefix('document', '{docId}:chunk:')`)
  3. `embedBatch(chunks)` — 1 chamada Voyage AI
  4. Upsert cada chunk: `id = 'document:{docId}:chunk:{i}'`
  5. Update doc → status `'ready'`, chunkCount = N

**Teste confirmado:**
```
embedding_batch count=3 tokens=95 costUsd=0.000006 ms=571
rag_indexed_document docId=test_knowledge_001 chunks=3
```

---

### Etapa 3 — Retrieval no Prompt (✅)

**Arquivo:** `api/src/modules/ai-agents/runner/agent-runner.service.ts`

**Método:** `augmentSystemPromptWithLayers()` — 3 injeções no system prompt:

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
     → "═══ Trechos relevantes do histórico (RAG) ═══\n{chunks}"
```

**Atenção:** documentos têm `contact_id = NULL` na tabela, por isso precisam de retrieval separada sem filtro de contactId.

---

### Etapa 4 — Frontend Base de Conhecimento (✅)

**Serviço:** `web/src/features/ai-agents/services/knowledge.service.ts`
```typescript
// ATENÇÃO: usa r.data.data ?? r.data por causa do ResponseInterceptor envelope
knowledgeService.list(agentId)           // GET → KnowledgeDocument[]
knowledgeService.create(agentId, dto)    // POST → KnowledgeDocument
knowledgeService.update(agentId, id, dto) // PATCH → KnowledgeDocument
knowledgeService.remove(agentId, id)     // DELETE → void
```

**Componente:** `AgentKnowledgeBase` em `edit-agent-dialog.tsx`
- Lista documentos com badge de status (Pendente / Indexando… / Pronto / Erro)
- Polling automático a cada 3s quando há docs pendentes/indexando
- Formulário create/edit com título + textarea
- Botão excluir por documento
- **Protegido por `KnowledgeBoundary`** (React Error Boundary) — erros de render mostram mensagem amigável

**Bugs corrigidos:**
- `(p ?? []).map is not a function` — causa: `knowledgeService` usava `r.data` que retorna o envelope `{data, meta}`. Fix: mudado para `r.data.data ?? r.data`
- Dialog "This page couldn't load" — causa: erro de render sem Error Boundary caindo na página. Fix: adicionado `KnowledgeBoundary` em volta do componente

---

### Etapa 5 — Feriados + `calcular_dia_util` (⏳ Próxima)

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
   - `seedNationalHolidays(orgId, year)` — fixos + datas móveis (Carnaval, Corpus Christi, Sexta-feira Santa via algoritmo Gauss/Meeus)
   - `getNthBusinessDay(orgId, month, year, n, state?, city?)`
   - `isBusinessDay(orgId, date, state?, city?)`

3. **`api/src/modules/settings/holidays/holidays.controller.ts`** — REST + `/seed`

4. **`api/src/modules/ai-agents/tools/builtin/calcular-dia-util.tool.ts`**:
   - Parâmetros: `{ mes: number, ano: number, n: number, estado?: string, cidade?: string }`
   - Delega para `HolidaysService.getNthBusinessDay()`
   - Registrar para ORCHESTRATOR + WORKER no `ToolRegistry`

#### Frontend
5. **`web/src/app/(dashboard)/settings/holidays/page.tsx`** — tabela de feriados com filtros ano/UF, botões CRUD, botão "Gerar feriados nacionais"
6. **Link "Feriados"** no menu de settings
7. **`web/src/features/settings/services/holidays.service.ts`** — client HTTP (lembrar do `r.data.data ?? r.data`!)

**Teste final esperado:**
- Usuário: "quando vence a folha de setembro?"
- Agente chama `calcular_dia_util(mes=10, ano=2026, n=5)`
- Agente responde: "07/10/2026 (quarta-feira)"

---

## 5. Infraestrutura — Fixes Importantes

### Evolution Redis Proxy
- Evolution v2.3.7 hardcoda `localhost:6379`
- Fix: serviço `redis-proxy` com `alpine/socat` usando `network_mode: "container:chat-evolution"`
- Redireciona `127.0.0.1:6379` → `redis:6379`

### pgvector
- **OBRIGATÓRIO**: imagem `pgvector/pgvector:pg16` (não `postgres:16-alpine`)
- `CREATE EXTENSION IF NOT EXISTS vector;`
- Tabela `ai_vector_entries` usa `vector(1024)` (Voyage AI voyage-3)

### Evolution sendMedia
- **NÃO aceita**: URL interna Docker (`http://api:3001/...`)
- **NÃO aceita**: data URI (`data:image/png;base64,...`)
- **ACEITA**: base64 puro (string sem prefixo) no campo `media`

### Docker rebuild
- `docker compose up -d --build web` **reutiliza cache** — não garante novo código
- Para garantir novo código: `docker compose build --no-cache web` + `docker compose up -d web`

---

## 6. Variáveis de Ambiente Críticas (api/.env)

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...   # LLM principal (Claude Sonnet 5 / Haiku 4.5)
VOYAGE_API_KEY=pa-VAZEOirVKQ...      # Embeddings RAG (voyage-3, 1024 dims)
OPENAI_API_KEY=sk-proj-your-key-here # NÃO USADO — placeholder legado

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
Agente Lulu (WORKER):  cmt3dlj6p00kdmv07q5us20qi
Conversa Lucron:       contato 554831921590, aiEnabled=true
Contato Bruna:         cmt3363jf003olo07ipry3vs6
CNPJ Bruna:            62111705000133
```

---

## 8. Checklist para Novos Recursos

Ao implementar um novo recurso que envolve backend + frontend, seguir esta sequência:

1. **Backend:** modelo Prisma → migration → service → controller → module
2. **Verificar formato de resposta:** o `ResponseInterceptor` envolve em `{data, meta}` — documentar se o endpoint tem comportamento diferente (ex: DELETE sem body)
3. **Frontend service:** criar `*.service.ts` usando `r.data.data ?? r.data` para todos os endpoints que retornam dados
4. **Frontend UI:** componente ou página para gerenciar o recurso
5. **Tipos TypeScript:** interfaces sincronizadas entre backend DTOs e frontend types
6. **Rebuild Docker:** `docker compose build --no-cache web` (nunca apenas `--build`)
7. **Testar no browser:** navegar na página, verificar console do browser (F12) para erros JavaScript

---

## 9. Padrões de Código

### API service client no frontend
```typescript
// CORRETO — acessa o payload dentro do envelope
export const meuService = {
  list(): Promise<MeuItem[]> {
    return api.get('/meu-endpoint').then((r) => r.data.data ?? r.data);
  },
  create(dto: CreateDto): Promise<MeuItem> {
    return api.post('/meu-endpoint', dto).then((r) => r.data.data ?? r.data);
  },
};

// ERRADO — retorna o envelope {data, meta} que não é o array
export const meuServiceErrado = {
  list(): Promise<MeuItem[]> {
    return api.get('/meu-endpoint').then((r) => r.data); // BUG!
  },
};
```

### React Error Boundary em componentes críticos
```tsx
// Usar KnowledgeBoundary como padrão para seções que fazem fetch em dialogs
{agent && (
  <KnowledgeBoundary>
    <MeuComponenteComFetch agentId={agent.id} />
  </KnowledgeBoundary>
)}
```
