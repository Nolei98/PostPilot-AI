# 📱 PostPilot AI

> Seu perfil de IA posta sozinho. Você só aprova.

Monitora notícias de IA via RSS, classifica potencial viral (Claude Haiku), gera post pronto — legenda no tom viral (Claude Sonnet) + arte com template de marca (foto real de banco — Pexels/Unsplash — ou Flux/Gemini/Pollinations como fallback + sharp) — e entrega para aprovação e publicação manual no Instagram (Plano B, sem Graph API).

## Rodando localmente

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (free tier)
2. SQL Editor → cole e rode `supabase/migrations/001_schema.sql`
3. Authentication → Users → **Add user** (seu e-mail + senha)
4. Copie o UUID do usuário, substitua em `supabase/seed.sql` e rode no SQL Editor (fontes RSS iniciais)
5. Settings → API → copie URL, `anon key` e `service_role key`

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# preencha pelo menos as 3 do Supabase
```

**Modo grátis (mocks):** deixe `ANTHROPIC_API_KEY`, `FAL_KEY` e `TELEGRAM_BOT_TOKEN` vazios — triagem usa palavras-chave, geração usa texto fixo, imagem é um gradiente local e notificação vira log. O pipeline inteiro funciona com $0.

**Modo real:** preencha as chaves (instruções dentro do `.env.example`).

### 3. Rodar

```bash
npm install
npm run dev          # terminal 1 — app em http://localhost:3000
npx inngest-cli dev  # terminal 2 — Inngest Dev Server em http://localhost:8288
```

### 4. Testar o pipeline

1. Login em `http://localhost:3000` (usuário criado no passo 1.3)
2. Confira as fontes em **⚙️ Ajustes**
3. Clique **🔄 Varrer agora** no dashboard (ou espere o cron de 3h)
4. Acompanhe os jobs em `http://localhost:8288` (Runs)
5. Posts aparecem na fila → aprovar/editar/descartar
6. Aprovados vão para **✅ Prontos**: copiar texto + baixar arte + marcar postado

## Deploy na Vercel (grátis)

### 1. App

```bash
npx vercel        # ou conecte o repo no dashboard da Vercel
```

Em **Settings → Environment Variables**, adicione:

| Variável | Obrigatória | Onde pegar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | p/ IA real | console.anthropic.com |
| `PEXELS_API_KEY` | p/ fotos reais (default) | pexels.com/api |
| `UNSPLASH_ACCESS_KEY` | fallback das fotos reais | unsplash.com/developers |
| `FAL_KEY` | p/ imagem gerada por IA | fal.ai/dashboard |
| `TELEGRAM_BOT_TOKEN` | p/ notificação | @BotFather no Telegram |
| `INNGEST_EVENT_KEY` | ✅ produção | app.inngest.com → Manage → Event Keys |
| `INNGEST_SIGNING_KEY` | ✅ produção | app.inngest.com → Manage → Signing Key |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL do deploy (https://seu-app.vercel.app) |

### 2. Inngest (cron + jobs)

O **cron de varredura (a cada 3h) roda dentro da Inngest** — não usa Vercel Cron, então não há limite do free tier da Vercel para crons.

1. Crie conta em [app.inngest.com](https://app.inngest.com) (free tier: 50k steps/mês — sobra)
2. Copie `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` para a Vercel (tabela acima) e redeploy
3. Inngest → **Apps → Sync new app** → cole `https://seu-app.vercel.app/api/inngest`
4. As 3 funções aparecem: `scan-news` (cron 0 */3 * * *), `generate-post`, `notify-post-ready`

> A Inngest tem integração oficial com a Vercel (Marketplace) que faz o sync automático a cada deploy — recomendado.

### 3. Custo mensal

| Serviço | Plano | $/mês |
|---|---|---|
| Vercel Hobby | free | $0 |
| Supabase | free | $0 |
| Inngest | free | $0 |
| Telegram | — | $0 |
| Anthropic (Haiku + Sonnet) | pay-as-you-go | ~$3–6 |
| Fal.ai (Flux schnell) | pay-as-you-go | ~$2 |
| **Total** | | **~$5–8** |

## Estrutura

```
supabase/migrations/001_schema.sql  # schema + RLS + bucket de imagens
supabase/seed.sql                   # fontes RSS iniciais
src/middleware.ts                   # auth guard (Supabase SSR)
src/lib/ai/triage.ts                # Haiku: score viral (+ mock)
src/lib/ai/generate.ts              # Sonnet: pacote do post (+ mock)
src/lib/stock-photos.ts             # fotos reais (Pexels/Unsplash) — provider default
src/lib/image.ts                    # foto real/Flux/Gemini/Pollinations + template de marca + upload
src/lib/telegram.ts                 # notificações
src/inngest/functions/scan-news.ts  # cron: RSS → dedupe → triagem
src/inngest/functions/generate-post.ts # texto → arte → pending_approval
src/inngest/functions/notify.ts     # aviso no Telegram
src/app/page.tsx                    # fila de aprovação (dashboard)
src/app/ready/page.tsx              # posts prontos p/ publicar
src/app/settings/page.tsx           # fontes + Telegram
```

## Fase 2 (fora deste MVP)

Instagram Graph API (o schema já tem `scheduled`/`published`, `scheduled_for` e `ig_media_id` prontos), vídeo/Reels, multi-perfil, billing, analytics.
