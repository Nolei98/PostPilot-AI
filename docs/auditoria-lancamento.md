# Auditoria de prontidão para lançamento público — 2026-07-30

> Critério desta auditoria: **a ferramenta vai ser liberada ao público**.
> Não é "funciona pra mim", é "aguenta gente desconhecida criando conta".
> Tudo abaixo foi VERIFICADO por execução (teste, requisição, consulta ao
> banco de produção) — o que não deu pra verificar está marcado como tal.
>
> Commit auditado: `bbaf25e`. Deploy em produção: `post-pilot-d2x9u6q5f`.

---

## 1. O que está funcionando bem

### 1.1 Qualidade de código e testes

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `next lint` | limpo |
| Testes unitários (`vitest`) | **465 passando**, 35 arquivos |
| Testes de RLS + unicidade (pglite) | 24 passando |
| E2E (`playwright`, Supabase real) | **3 passando** |
| Build de produção | limpo |

O e2e de carrossel estava quebrado por texto antigo ("Editar cards do
carrossel"); o drawer virou "Editar carrossel" em §0-C.4. Asserção
atualizada nesta auditoria — a feature nunca esteve quebrada.

### 1.2 Isolamento de dados (o item mais crítico de um lançamento)

**RLS ativa em 12 de 12 tabelas** expostas pela API: `brand_kits`,
`carousel_cards`, `clients`, `news_items`, `notification_configs`,
`post_metrics`, `posts`, `scan_runs`, `social_connections`,
`source_configs`, `subscriptions`, `templates`.

Testado empiricamente com a **chave anônima** (a que vai pro browser):
toda tabela devolve `[]`, inclusive `social_connections` (que tem 1 linha
real, com token do Instagram criptografado) e `post_metrics` (1 linha). A
única que devolve dados é `templates`, e só as linhas com
`client_id: null` — os modelos globais, que são públicos de propósito.

O isolamento multi-tenant tem cobertura de e2e: criar um cliente novo
isola fila e fontes.

### 1.3 Segredos e superfície de ataque

- Nenhum componente `"use client"` referencia `SERVICE_ROLE`,
  `STRIPE_SECRET`, `META_APP_SECRET`, `SECRETS_ENCRYPTION_KEY`,
  `GEMINI_API_KEY` ou `ANTHROPIC_API_KEY`.
- `createAdminClient` (service role) aparece só em Server Actions, rotas
  de API e jobs do Inngest — nunca em componente de cliente.
- O middleware valida a sessão com `getUser()`, que confere o token no
  servidor do Supabase em vez de confiar no cookie.

### 1.4 Endpoints em produção

| Rota | Esperado | Obtido |
|---|---|---|
| `/`, `/login` | 200 | 200 |
| `/privacidade`, `/termos`, `/exclusao-de-dados` | 200 | 200 |
| `/fila`, `/ready`, `/settings` | redireciona | 307 |
| `POST /api/stripe/webhook` sem assinatura | rejeita | **400** |
| `PUT /api/inngest` | 200 | 200 |

### 1.5 Motor de conteúdo

- **Render sem defeito em produção:** os 70 posts aprovados/publicados
  estão todos em `render_status='ready'`, nenhum em `error`.
- Onboarding de usuário novo é automático (trigger `handle_new_user`,
  migration 022): cria cliente, Brand Kit, config e 2–4 fontes conforme o
  nicho escolhido no signup. `FirstScanKickoff` dispara a primeira
  varredura na primeira visita à fila.
- **A cota é por USUÁRIO, não por cliente** (`getMonthlyQuota` filtra por
  `user_id`). Criar vários tenants não multiplica o plano grátis.

---

## 2. O que NÃO funciona / risco aberto

Ordenado por gravidade para um lançamento público.

### ✅ 2.1 O limite de fontes do plano nunca é aplicado — CORRIGIDO 30/07

`PLANS.free.maxSources = 2` existe em `src/lib/plans.ts` e é afirmado no
teste — mas **nenhum código lê esse valor**. `addSource`
(`src/app/actions.ts`) insere sem contar quantas já existem.

Um usuário do plano grátis pode cadastrar 200 fontes.

### ✅ 2.2 Não há limite de clientes (tenants) por usuário — CORRIGIDO 30/07

`createClientTenant` insere em `clients` sem checar plano nem contagem.
Combinado com 2.1: N clientes × N fontes, tudo no plano grátis.

### ✅ 2.3 A triagem custa IA por notícia, e nada a limita — CORRIGIDO 30/07

`scan-news` roda **a cada 3 horas** por cron, em fan-out para o cliente
ativo de **cada usuário**, e passa cada notícia por `triageNews`
(Claude Haiku por padrão, Gemini como alternativa).

O teto de posts (`postsPerMonth`) gate apenas a GERAÇÃO. A triagem
acontece antes e não é limitada por nada. Somado a 2.1 e 2.2, o custo de
um único usuário grátis é ilimitado — o oposto do que a política de custo
zero (§0-F.5 do PROGRESSO) assume.

> Os três acima são o mesmo buraco econômico visto de três ângulos. É o
> que eu trataria antes de qualquer divulgação.
>
> **Correção aplicada em 30/07 (commit da mesma sessão):** `addSource`
> passou a contar as fontes do cliente contra `PLANS[plano].maxSources`, e
> `createClientTenant` a contar os clientes do dono contra o novo
> `maxClients` (free 1, criador 3, pro sem teto). O teto de fontes também
> aparece na UI de Ajustes antes de a pessoa preencher o formulário. 2.3
> (custo de triagem) deixou de ser ilimitado no mesmo commit (2 fontes ×
> 1 cliente no plano grátis) e foi FECHADO na noite de 30/07 — ver o fim
> de §2.3.

> **Corrigido em 30/07 (noite), commit `97b4355`:** a triagem passou a
> pular quem está sem cota no mês. As notícias continuam gravadas como
> `new` e são triadas no ciclo seguinte — adiamento, não perda. O gasto
> de IA agora acompanha o teto do plano em vez de ignorá-lo.

### ✅ 2.4 Cota estourada é silenciosa na fila — CORRIGIDO 30/07

Quando `quota.remaining <= 0`, `generate-post` para e grava o motivo no
log do job. A tela `/fila` **não mostra nada** — não há menção a cota,
plano ou limite em `src/app/fila/page.tsx`.

Para o usuário do plano grátis, no 6º post do mês, a fila simplesmente
para de encher. É exatamente o modo de falha que custou dias em julho no
bloqueio da Pollinations, e que motivou o aviso de piloto pausado (047) —
só que agora embutido no plano grátis por desenho.

### ✅ 2.5 `feed_url` entra sem validação (SSRF) — CORRIGIDO 30/07

`addSource` grava a URL crua e `scan-news` faz
`parser.parseURL(source.feed_url)` no servidor. Não há allowlist de
esquema (`http/https`), nem bloqueio de IP interno/localhost/metadata.

Num app fechado isso é teórico. Aberto ao público, é uma requisição
server-side para qualquer endereço que o usuário quiser.

### ✅ 2.6 Exclusão de conta não é self-service — CORRIGIDO 30/07

A página `/exclusao-de-dados` explica o processo (exigência do App Review
do Meta), mas **não existe ação de excluir conta** no código — nenhuma
`deleteAccount` em `actions.ts`. Para lançamento público no Brasil, LGPD
pede caminho efetivo de exclusão.

### ✅ 2.7 `/pricing` exige login — CORRIGIDO 30/07

`GET /pricing` em produção responde **307** para o login. É a página de
conversão: quem chega pela landing não consegue ver preço sem criar
conta. A landing tem CTA ("Comece grátis"), então o item do
`LANCAMENTO.md` está formalmente cumprido — mas para lançamento é uma
perda de conversão evitável.

### ✅ 2.8 APIs respondem 307 em vez de 401 — CORRIGIDO 30/07

`POST /api/checkout`, `POST /api/portal` e `GET /api/instagram/connect`
sem sessão redirecionam para o login em vez de devolver 401. Não é falha
de segurança (nada vaza), mas cliente HTTP nenhum entende um redirect
como "não autenticado".

> **Corrigido em 30/07 (noite):** `deleteMyAccount` (commit `2e7e508`)
> apaga os arquivos dos dois buckets e depois o usuário — o resto do banco
> cai por cascata. `/pricing` abriu sem login e as rotas de API passaram a
> responder 401 (commit `cc9e555`). ⚠️ A exclusão ainda NÃO foi exercida no
> browser: só tipo, lint, testes e build.

### 🟡 2.9 Publicação no Instagram só funciona para contas de teste

App Review do Meta não submetido (decisão de 30/07: adiado para quando o
app estiver no ar). Enquanto isso, `publish-scheduled-posts` só publica
em contas cadastradas no painel de desenvolvedor. Para o público, o
produto entrega **até o download da arte**, não a publicação automática.

### 🟡 2.10 Stripe em modo de teste

Confirmado pelo usuário em 30/07. O checkout de produção não cobra de
verdade: ninguém consegue virar pagante, e todo mundo fica no plano
grátis — o que amplifica 2.1–2.3.

---

## 3. Estado dos documentos de projeção

### `LANCAMENTO.md` — desatualizado

Bloqueadores listados como pendentes que **já estão prontos**:

- ~~Onboarding de usuário novo~~ → trigger `handle_new_user` (022) +
  `FirstScanKickoff`.
- ~~Marca "feito com PostPilot" no plano free~~ → `cover-svg.ts:157`,
  aplicada via `getUserPlan(...) === "free"`.
- ~~Deploy em produção~~ → no ar, migrations 001–048 aplicadas.
- ~~Vercel Analytics~~ → ligado no painel em 30/07; script no `layout.tsx`
  e na landing (`public/index.html`).

Continuam válidos: Stripe live (2.10), caps de gasto (hoje substituídos
pela política de custo zero, mas 2.1–2.3 os tornam necessários de novo se
o app abrir), e "cota free testada em produção" — que a auditoria mostra
ser mais grave do que um teste: falta a UI de aviso (2.4).

### `PROGRESSO-2.0.md` — em dia

§0-F.5 registra as decisões de 30/07 (Stripe em teste, App Review adiado,
custo zero, presets de nicho em standby). Pendências abertas: rodar o
`repair-orphan-cards` (feito em 30/07), decidir os presets de nicho.

### `docs/meta-app-review.md` — pronto, não submetido

O primeiro item do checklist (§5) está cumprido: as três URLs legais
respondem 200 no domínio de produção. Falta Business Verification,
screencast, ícone/categoria e colar as justificativas.

---

## 4. Ordem sugerida

**Antes de qualquer divulgação:**

1. Aplicar `maxSources` em `addSource` (2.1).
2. Limitar tenants por plano em `createClientTenant` (2.2).
3. Validar `feed_url`: só `http/https`, bloquear host privado (2.5).
4. Avisar cota estourada na fila (2.4) — a mesma faixa que o piloto
   pausado já usa.

**Antes de cobrar:**

5. Stripe live (2.10).
6. Teto de triagem por plano, ou triagem só nas fontes do plano (2.3).

**Quando o produto abrir de fato:**

7. Exclusão de conta self-service (2.6).
8. `/pricing` público (2.7).
9. App Review do Meta (2.9).

---

## 5. O que esta auditoria NÃO cobriu

- **Carga/concorrência:** nenhum teste com muitos usuários simultâneos.
  O `concurrency: { limit: 3 }` do `generate-post` é por função do
  Inngest, não por usuário — não sei como se comporta com 100 contas.
- **Custo real por usuário:** estimado no comentário do `triage.ts`
  (~$1-2/mês em 300 notícias/dia), nunca medido em produção.
- **E-mail de confirmação do Supabase** (chega? cai em spam?) — precisa
  de caixa de entrada real.
- **Fluxo de pagamento ponta a ponta** — bloqueado por 2.10.
- **Acessibilidade** e **responsivo em celular real** — só verifiquei
  desktop.
