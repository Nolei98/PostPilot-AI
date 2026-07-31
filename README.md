# 📱 PostPilot AI

> Seu perfil posta sozinho. Você só aprova.

Monitora notícias por RSS, pontua potencial viral, escreve o post no tom da
marca, desenha a arte com a identidade visual dela e entrega numa **fila de
aprovação**. Você aprova, baixa e posta.

Entrega **post único, carrossel (7–10 cards) e vídeo** (Reels 9:16 / feed 4:5),
por upload ou gerado do zero (roteiro por IA + b-roll de banco).
Um dono pode ter vários **clientes** (marcas), cada um com Brand Kit próprio.

> 📍 **Este README é só o setup.** Para saber o que está pronto, o que falta e
> qual o plano de lançamento, leia **[`ESTADO-DO-PROJETO.md`](./ESTADO-DO-PROJETO.md)**.

---

## Rodando localmente

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (free tier serve).
2. **SQL Editor → rode as migrations de `supabase/migrations/` em ordem
   numérica, da `001` até a última.** São ~49 arquivos; rode do começo ao fim,
   uma de cada vez ou coladas em blocos.
   - ⚠️ Existem **dois arquivos `016`** (`016_scan_runs.sql` e
     `016_unlimited_accounts.sql`). São independentes — rode os dois, a ordem
     entre eles não importa.
3. **Authentication → Users → Add user** (seu e-mail + senha).
4. **Settings → API** → copie a URL, a `anon key` e a `service_role key`.

Contas criadas pelo app são configuradas sozinhas: um trigger no Postgres
(`handle_new_user`) cria o cliente, o Brand Kit, a config de notificação e
2–4 fontes RSS conforme o nicho escolhido no cadastro. **`supabase/seed.sql`
só é necessário para popular um usuário criado à mão pelo painel** — nesse
caso, troque o UUID no topo do arquivo pelo seu.

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# preencha pelo menos as 3 do Supabase
```

**Modo mock (custo $0):** deixe as chaves de IA vazias. A triagem vira palavras-chave,
a geração vira texto fixo, a imagem vira um gradiente local, a notificação vira log e
o Instagram vira mock. **O pipeline inteiro roda de ponta a ponta sem gastar nada** —
é assim que a suíte de testes funciona.

**Modo real:** preencha as chaves (cada bloco do `.env.example` diz onde pegar).

### 3. Rodar

```bash
npm install
npm run dev                                                      # terminal 1 — app  → localhost:3000
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest  # terminal 2 — jobs → localhost:8288
```

⚠️ **Ordem importa: `dev` primeiro, Inngest depois.** O `predev`
(`scripts/free-ports.mjs`) libera as portas 3000 **e 8288** — reiniciar o dev
mata o Inngest dev server junto, e aí qualquer render/vídeo fica "processando"
pra sempre até você notar.

⚠️ **Sem o Inngest rodando, nada que dispare job funciona** ("Varrer agora",
gerar post, gerar carrossel, montar vídeo) → `ECONNREFUSED` e a mensagem "Não
foi possível iniciar a varredura".

### 4. Testar o pipeline

1. Login em `http://localhost:3000`.
2. Confira as fontes em **⚙️ Ajustes**.
3. **🔄 Varrer agora** na fila (ou espere o cron de 3h).
4. Acompanhe os jobs em `http://localhost:8288` (Runs).
5. Posts caem na **fila** → aprovar, editar ou descartar.
6. Aprovar dispara o render da arte definitiva; o post vai pra **✅ Prontos**:
   copiar texto, baixar arte, marcar postado.

### 5. Testes

```bash
npm test          # 487 testes: unitários + RLS/uniqueness (pglite) — mock, sem chave, $0
npm run test:e2e  # 3 e2e (Playwright) — LOCAL only: cria e apaga usuário no Supabase real
npx tsc --noEmit  # typecheck
npm run lint
```

Os testes de RLS usam **pglite** (Postgres em WASM, sem Docker) aplicando as
migrations reais. O **CI** (`.github/workflows/ci.yml`) roda `tsc` + `npm test`
em todo push, em modo mock. O e2e não roda no CI — precisa de Supabase real.

---

## Deploy na Vercel

```bash
npx vercel   # ou conecte o repo pelo dashboard
```

### Variáveis de ambiente

| Variável | Obrigatória | Onde pegar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL do deploy |
| `INNGEST_EVENT_KEY` | ✅ produção | app.inngest.com → Manage → Event Keys |
| `INNGEST_SIGNING_KEY` | ✅ produção | app.inngest.com → Manage → Signing Key |
| `GEMINI_API_KEY` + `AI_PROVIDER=gemini` | texto | aistudio.google.com/apikey — **tem free tier** |
| `ANTHROPIC_API_KEY` | texto (pago) | console.anthropic.com |
| `PEXELS_API_KEY` | imagem (grátis) | pexels.com/api |
| `UNSPLASH_ACCESS_KEY` | imagem (fallback) | unsplash.com/developers |
| `FAL_KEY` | imagem por IA (pago) | fal.ai/dashboard |
| `POLLINATIONS_API_KEY` | texto/imagem | auth.pollinations.ai |
| `TELEGRAM_BOT_TOKEN` | notificação | @BotFather |
| `META_APP_ID`, `META_APP_SECRET` | Instagram | developers.facebook.com |
| `SECRETS_ENCRYPTION_KEY` | Instagram | `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | cobrança | dashboard.stripe.com |
| `STRIPE_PRICE_CRIADOR`, `STRIPE_PRICE_PRO` | cobrança | Price IDs dos produtos no Stripe |

> 🔒 `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `META_APP_SECRET` e
> `SECRETS_ENCRYPTION_KEY` são **backend puro**. Nunca use nenhuma delas em
> componente `"use client"` — elas ignoram RLS ou movem dinheiro.

### Inngest (cron + jobs)

O **cron de varredura (a cada 3h) roda dentro da Inngest**, não na Vercel — logo
o limite de crons do free tier da Vercel não se aplica.

1. Conta em [app.inngest.com](https://app.inngest.com) (free tier: 50k steps/mês).
2. Cole `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` na Vercel e faça redeploy.
3. Inngest → **Apps → Sync new app** → `https://seu-app.vercel.app/api/inngest`.
4. A integração oficial Inngest↔Vercel (Marketplace) sincroniza a cada deploy —
   recomendada.

### Stripe

Webhook apontando para `https://seu-app.vercel.app/api/stripe/webhook`.
⚠️ **Hoje o projeto está em modo de teste** — o checkout de produção não cobra
de verdade. Ver `ESTADO-DO-PROJETO.md` §7.2.

---

## Estrutura

```
supabase/migrations/       # 001–049 (a 049 ainda não aplicada em produção)
src/middleware.ts          # guard de sessão; define as rotas públicas
src/lib/plans.ts           # limites de plano — fonte única da verdade
src/lib/ai/                # triagem, geração, carrossel, roteiro de vídeo, embedding
src/lib/image.ts           # escolha da imagem + arte da capa
src/lib/cover-svg.ts       # SVG da capa (marca, wordmark, contraste)
src/lib/carousel-render.ts # cards do carrossel SVG → PNG
src/lib/video-assembly.ts  # montagem de vídeo (ffmpeg)
src/inngest/functions/     # scan, geração (post/carrossel/vídeo), render, publicação, métricas
src/app/fila/              # fila de aprovação
src/app/ready/             # prontos pra publicar
src/app/settings/          # Brand Kit, fontes, templates, conta
src/app/pricing/           # planos (pública)
scripts/                   # utilitários de operação e teste visual
```

Os jobs do Inngest usam service role e **ignoram RLS** — por isso herdam
`client_id` explicitamente pela cadeia `source_configs → news_items → posts`.

---

## Documentação

| Arquivo | Para quê |
|---|---|
| **[`ESTADO-DO-PROJETO.md`](./ESTADO-DO-PROJETO.md)** | **comece aqui** — pronto, pendente e plano de lançamento |
| `PROGRESSO-2.0.md` | diário técnico: o porquê de cada decisão |
| `docs/auditoria-lancamento.md` | auditoria de prontidão, verificada por execução |
| `LANCAMENTO.md` | playbook de divulgação (textos prontos) |
| `docs/layouts-spec.md` | especificação visual dos 5 layouts |
| `docs/meta-app-review.md` | dossiê do App Review do Meta |
| `HANDOFF-overlens-template.md` | motor de legibilidade + contrato de tokens de template |

Painel visual dos layouts: `npx tsx scripts/build-layouts-html.ts` gera
`docs/layouts.html` (não versionado — o código é a fonte).
