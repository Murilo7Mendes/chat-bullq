# Chat BullQ — Instruções do Projeto

## Session Summary

**Ao final de cada sessão de trabalho, ou sempre que solicitado, gerar um resumo completo** com as seguintes seções:

### Estrutura obrigatória do resumo

1. **Implementações da sessão** — o que foi construído/alterado, arquivos modificados, comportamento novo introduzido
2. **Estado atual do sistema** — features ativas, integrações em produção, configurações relevantes
3. **Pendências e próximos passos** — bugs conhecidos, features planejadas, débitos técnicos identificados
4. **Memória do projeto** — resumo das memórias persistentes relevantes ao contexto
5. **Contexto de ambiente** — branch atual, últimos commits, serviços relevantes

O resumo deve ser detalhado o suficiente para que uma nova sessão possa retomar o trabalho sem perda de contexto.

---

## Stack

- **Monorepo:** `api/` (NestJS + BullMQ + Prisma + pgvector), `web/` (React + Vite + TanStack Query), `mcp/` (MCP server)
- **Infra:** Docker Compose, PostgreSQL, Redis, Evolution API (WhatsApp/Instagram)
- **IA:** OpenAI (embeddings + LLM), RAG com pgvector
