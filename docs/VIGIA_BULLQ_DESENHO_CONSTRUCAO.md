# Vigia Acessórias → WhatsApp — Desenho para construção (produto: Chat BullQ)

> Briefing consolidado para o Claude Code construir o vigia **dentro do Chat BullQ** (NÃO no Maestro).
> Baseado em: `VIGIA_ACESSORIAS_WHATSAPP.md` (levantamento) + `VIGIA_ACESSORIAS_RESPOSTAS_CODIGO.md` (respostas do código) + decisões do Murilo.
> **Decisão arquitetural de fundo:** o vigia é uma feature de **mensageria/atendimento** → mora no BullQ, não no Maestro. Razão: (a) não serve nenhum processo do Maestro; (b) manter os produtos **desacoplados** — o BullQ deve funcionar/ser vendável sem depender do Maestro. Produtos do ecossistema integram por API, não se absorvem.

## O que o vigia faz (resumo)
Observa a caixa `lucronacessorias@gmail.com` (que recebe cópia de toda guia/documento que o Acessórias envia aos clientes). A cada e-mail novo: identifica o cliente (CNPJ no assunto), extrai o(s) link(s) direto(s) do(s) documento(s), resolve o(s) telefone(s) do cliente, e dispara **uma notificação no WhatsApp** com os links — como um atendimento que abre, envia e fecha. É uma **ponte** Acessórias→WhatsApp (o Acessórias não tem WhatsApp). Não é atendimento: se o cliente responder, aí sim a IA do BullQ entra (ver Decisão 4).

## Fatos confirmados do código (do doc de respostas)
- BullQ = NestJS 11 + Prisma/Postgres + BullMQ/Redis, Docker, sempre ligado.
- Envio: `POST /api/v1/conversations` (número novo → cria contato/conversa e envia) ou `POST /api/v1/messages` (conversa existente). Vários links = concatenar em `content.text` (suportado e recomendado).
- Já existe um **poller de Gmail** (`channel-hub/adapters/gmail/gmail-polling.cron.ts`, cron BullMQ a cada 1 min) — o vigia espelha esse padrão.
- App **não** conhece CNPJ; é indexado por telefone. Modelo `Contact` tem phone/email/metadata.
- Rate limit declarado mas **não aplicado** → o vigia deve espaçar os disparos (anti-ban).
- Envio "como operador" **auto-desliga a IA** da conversa (`aiAutoDisableOnHuman`, default true).

---

## DECISÕES DO MURILO (para construir)

### Decisão 1 — Autenticação: login de usuário de serviço (inicialmente)
Criar/usar um **usuário de serviço** e autenticar via `POST /api/v1/auth/login` para obter o JWT.
- *Observação:* como o vigia será **módulo interno** (Decisão 2), na prática ele chama os services de envio direto, podendo dispensar o HTTP/JWT. Manter o login de serviço como opção/fallback. Não criar endpoint sob API key `pk_*` agora (fica para depois, se precisar).

### Decisão 2 — Onde roda: MÓDULO INTERNO do BullQ
O vigia é um **módulo NestJS dentro da própria API do BullQ**, espelhando o `gmail-polling.cron`.
- Reusa BullMQ (cron + fila), Prisma, e chama os services de envio **direto** (sem HTTP, sem auth).
- Mais simples e coerente que processo separado. Confirma a inclinação técnica do doc de respostas.

### Decisão 3 — De-para CNPJ→telefone: CADASTRO no contato (não planilha)
**Estender o modelo `Contact` do BullQ** com: campo **CNPJ** e flag **"recebe notificação automática" (opt-in, sim/não)**.
- *Porquê (argumento do Murilo):* ele **pode não querer** notificar automaticamente todos os clientes. Uma planilha só traduz CNPJ→telefone (de-para burro); o cadastro dá **controle por cliente** (liga/desliga sem apagar).
- O vigia, antes de disparar: busca o contato pelo CNPJ, confere se está **habilitado**; só envia para os opt-in.
- **Verificar no código:** quantos contatos já existem e se dá para **enriquecer** os existentes com o CNPJ (em vez de recadastrar). O `Contact` já tem `metadata` (JSON) — avaliar campo dedicado vs. metadata.
- ⚠️ Um pouco mais de trabalho que ler planilha, mas o opt-in por cliente é requisito real, não luxo.

### Decisão 4 — Notificação fechada; resposta = conversa nova com IA
O envio automático do vigia deve: **abrir atendimento → enviar o(s) link(s) → fechar o atendimento.** Ato completo e fechado, sem deixar conversa pendurada.
- Se o cliente **responder**, deve funcionar como **início de uma conversa nova**, onde o **agente de IA entra** normalmente (atendimento padrão).
- *Porquê é melhor que "manter IA ativa na mesma conversa":* separa **notificar** de **atender**. A notificação não é atendimento; não deve deixar a IA "ativa" num contexto de notificação nem poluir o histórico do atendimento real.

---

## ⚠️ PERGUNTA A CONFIRMAR NO CÓDIGO antes de fechar a Decisão 4
**Quando um contato responde a uma conversa FECHADA, o BullQ reabre a conversa antiga ou cria uma nova?** E **a IA entra** nessa conversa (reaberta ou nova)?
- Se **cria nova** → o desenho do Murilo funciona direto.
- Se **reabre a antiga** → a resposta cairia na conversa da notificação; decidir: (a) aceitar e garantir que a IA entre na reaberta, ou (b) marcar a conversa de notificação de um jeito que a resposta gere atendimento novo/limpo.
- Também confirmar: o **auto-desligar IA** (envio como operador) atrapalha a IA entrar quando o cliente responde? Como o atendimento fecha após o envio, a resposta deveria reativar a IA — **validar esse ciclo**.

---

## Fluxo proposto (rascunho para validar/implementar)
```
cron BullMQ (~1 min, padrão gmail-polling)
  → ler Gmail lucronacessorias@ (API Google já usada no app, ou IMAP + senha de app)
  → filtrar e-mails do Acessórias ainda NÃO processados
  → por e-mail: extrair CNPJ (assunto) + TODOS os links diretos (botões)
  → buscar Contact pelo CNPJ:
        • não achou / opt-in = não  → ignora (não notifica)
        • achou e habilitado        → segue
  → para cada telefone do contato (decidir: todos vs principal):
        abrir atendimento → enviar 1 mensagem com todos os links → fechar
        (ESPAÇAR disparos entre envios — anti-ban, já que o rate limit não é aplicado)
  → marcar messageId do Gmail como processado (dedup — responsabilidade do vigia)
```

## Pontos de construção a resolver junto
- **Dedup:** persistir os `messageId` do Gmail já processados (o app não faz isso).
- **Anti-ban:** espaçar envios (ex.: respeitar o `maxPerSecond:1 / maxPerMinute:30` que o adapter declara mas não aplica).
- **Vários contatos por CNPJ:** decidir enviar a todos ou a um "principal" (a decisão pode virar campo no contato).
- **Múltiplos documentos:** agrupar todos os links numa mensagem só (não picar).

## Nota de prioridade (do ecossistema)
A **construção** do vigia é uma frente do BullQ. Do lado do Maestro, a prioridade segue sendo **fechar a cobrança de documentos (OS-07)**. Este desenho está pronto para quando o Murilo optar por construir o vigia no BullQ — que é um contexto/projeto separado do Maestro. Evitar abrir as duas construções ao mesmo tempo.
