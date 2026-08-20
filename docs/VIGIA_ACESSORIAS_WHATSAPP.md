# Vigia de e-mails do Acessórias → notificação no WhatsApp

> Documento de contexto e investigação. **Não é uma OS ainda** — é o levantamento necessário ANTES de desenhar a solução.
> Objetivo desta etapa: o Claude Code ler o código da **aplicação de WhatsApp existente** e responder as perguntas do fim, transformando suposições em fatos. Só depois disso o desenho do vigia é feito.

## A ideia (o "o quê")
Toda vez que o Acessórias dispara um e-mail de guia/documento para um cliente, uma **cópia** chega numa caixa interna. Um "vigia" deve: ler essa cópia, identificar o cliente e extrair o(s) link(s) do(s) documento(s), e acionar o envio de uma mensagem no **WhatsApp** para o cliente com o(s) link(s).

**Motivação:** o Acessórias entrega por e-mail e disponibiliza no app do cliente, mas **não tem integração com WhatsApp**. No Brasil, o cliente responde muito mais ao WhatsApp que ao e-mail. Esta é uma **ponte** (Acessórias → WhatsApp), não um atendimento — o atendimento/IA já existe em aplicação separada.

## O que já se sabe (fatos confirmados pelo Murilo)
1. **Gatilho = e-mail interno.** Toda guia/documento enviada a qualquer cliente gera uma cópia em `lucronacessorias@gmail.com`. O vigia observa essa caixa (em vez de consultar a API do Acessórias).
2. **Gmail "senhas de app".** O Gmail permite gerar uma "senha de app" para acesso programático por ferramentas de terceiros (útil para o vigia ler a caixa via IMAP sem OAuth completo).
3. **CNPJ no assunto.** Todo e-mail recebido começa o assunto com o **CNPJ do cliente** — é como se identifica de qual empresa é o documento.
4. **Link = botão/link direto que baixa o documento.** Não é link de portal com login. O vigia extrai a URL direta do botão.
5. **Link não expira** (tempo indeterminado) — sem corrida contra expiração.
6. **Pode haver vários documentos num mesmo e-mail** (vários botões/links). Coerente com o princípio "não picar em várias mensagens" — agrupar num envio só (a decidir no desenho).
7. **De-para CNPJ → telefone:** o Murilo tem uma **planilha** CNPJ → telefone. (Mas ver a Pergunta 2 abaixo — a aplicação de WhatsApp pode já resolver isso.)
8. **Envio:** número **principal** de atendimento da LUCRON, via **API não-oficial** de WhatsApp. *(Murilo conhece o risco de ban de API não-oficial em número principal, já opera assim há anos e assumiu a decisão conscientemente. Registrado; não rediscutir.)*
9. **A aplicação de WhatsApp já existe** (com API não-oficial + integração com IA). O vigia NÃO reconstrói WhatsApp nem IA — ele apenas **aciona** essa aplicação. O cliente pode responder, e a conversa continua na aplicação existente (fora do escopo do vigia).

## O ponto que TRAVA o desenho (o que falta descobrir)
O vigia se conecta à aplicação de WhatsApp existente no último passo (entregar "envie isto para tal cliente"). **Como essa entrega funciona depende de como a aplicação recebe ordens de envio — e isso hoje é suposição, não fato.** O código da aplicação existe e tem a resposta. Este é o bloqueio: sem saber a forma de integração, não dá para desenhar o vigia (o vigia é construído para encaixar nessa forma).

Além disso, o Murilo levantou a hipótese de que **a aplicação já começa pelo CNPJ e busca os contatos vinculados** — se isso for verdade, o vigia não precisa da planilha (Ponto 7) nem resolve o contato; só entrega CNPJ + links, e a aplicação faz o resto. Isso **reduziria o escopo do vigia**. Precisa ser confirmado no código.

---

## PERGUNTAS PARA O CLAUDE CODE responder (lendo o código da aplicação de WhatsApp)

### Pergunta 1 — Como a aplicação recebe uma ordem de envio?
Qual é o **ponto de entrada** para "enviar esta mensagem para este destinatário"? Especificar:
- Ela expõe uma **API/endpoint HTTP**? (qual método, rota, formato do corpo?)
- Ou lê de um **arquivo / fila / banco / planilha** que alguém popula?
- Ou é acionada por **linha de comando / função** que se chama diretamente?
- Qual é exatamente o **formato** do que ela espera receber (número? CNPJ? texto da mensagem? lista de links?)?

### Pergunta 2 — A aplicação já resolve o contato a partir do CNPJ?
- Ela recebe um **CNPJ** e sozinha descobre **quais contatos/telefones** enviar? Ou ela precisa receber o **número de telefone já pronto**?
- Se ela resolve pelo CNPJ: **de onde** ela tira os contatos (banco próprio? planilha? API do Acessórias?)?
- Isso decide se o vigia precisa da planilha CNPJ→telefone (Ponto 7) ou se só repassa o CNPJ.

### Pergunta 3 — Onde e como a aplicação roda (para o vigia rodar ao lado)?
- **Linguagem** e principais dependências.
- Como está **hospedada/executada** (servidor? máquina local? container? sempre ligada?).
- Há algum **agendador/loop** já rodando que o vigia poderia aproveitar, ou o vigia seria um processo novo ao lado?

### Pergunta 4 — Como a aplicação lida com múltiplos contatos e mensagens?
- Se um cliente (CNPJ) tem **vários contatos**, ela envia para todos? Para um principal?
- Ela aceita **uma mensagem com vários links** (agrupar documentos), ou espera uma mensagem por vez?
- Há algum controle de **duplicidade** (não enviar a mesma coisa duas vezes)?

### Pergunta 5 — Há algo no código que restrinja ou condicione o envio?
- Limites de taxa (para não disparar rápido demais e arriscar ban)?
- Horário de envio? Lista de bloqueio? Opt-out de clientes?
- Qualquer regra de negócio já embutida que o vigia precise respeitar.

---

## Depois que o Claude Code responder
Com as respostas vindas do **código real** (não de suposição), voltar ao chat para **desenhar o vigia** encaixado na aplicação existente:
- fluxo: ler Gmail (IMAP + senha de app) → filtrar e-mails do Acessórias → extrair CNPJ (assunto) + links (botões) → [resolver contato: planilha OU deixar p/ a aplicação] → acionar a aplicação de WhatsApp na forma que a Pergunta 1 revelar.
- decidir: agrupar links num envio; controle de "já enviei este e-mail"; onde rodar o vigia.
- só então virar uma OS de construção.

## Onde este projeto se encaixa no todo (lembrete de prioridade)
Este é um projeto do **ecossistema** (ponte Acessórias→WhatsApp). Pela matriz de prioridade (Proximidade × Valor de fechar), a **cobrança de documentos (OS-07)** e o fechamento das frentes abertas vêm ANTES. Este vigia é uma frente nova — vale investigar (custo baixo: só perguntas ao Claude Code), mas **não abrir a construção** enquanto a cobrança não fechar. A investigação pode andar em paralelo; a construção espera a vez.
