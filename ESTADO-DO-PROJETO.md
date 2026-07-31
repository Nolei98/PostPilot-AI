# PostPilot AI — Estado do Projeto

> **Leia este arquivo primeiro.** Ele é o mapa: o que o produto é, o que já
> está pronto, o que falta, e em que ordem fazer. Os outros documentos são
> aprofundamento — a lista deles está no fim (§8).
>
> Atualizado em **2026-07-30** (noite). Commit de referência: `676f6b3` (`main`,
> ainda não enviado pro origin).

---

## 1. O que é o produto, em uma frase

Um app que lê notícias de IA por RSS, escolhe as com cara de viral, escreve o
post no tom do cliente, desenha a arte com a identidade visual dele e entrega
numa **fila de aprovação**. A pessoa só aprova, baixa e posta.

**Formatos que ele entrega hoje:** post único, carrossel (7–10 cards) e vídeo
(Reels 9:16 / feed 4:5, a partir de upload manual).

**Quem usa:** um dono de conta pode ter vários **clientes** (marcas), cada um
com Brand Kit próprio (logo, cores, nicho, idioma, providers de IA).

---

## 2. Stack e como rodar

| Peça | O que é |
|---|---|
| Next.js 14 (App Router) + Tailwind | app e UI |
| Supabase (Postgres + Auth + Storage) | banco, login, arquivos das artes |
| Inngest | jobs em segundo plano e o cron de varredura (a cada 3h) |
| Stripe | assinatura (**hoje em modo de teste**) |
| Gemini / Claude / Pollinations | texto |
| Pexels + Unsplash (stock) / Gemini Image / Fal | imagem |
| ffmpeg + sharp + resvg | render de arte e vídeo |
| Vercel | deploy (`post-pilot-ai-seven.vercel.app`) |

```bash
npm run dev                                                     # app  → localhost:3000
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest  # jobs → localhost:8288
npm test          # 499 testes (unitários + RLS via pglite). Rodam sem chave, custo $0
npm run test:e2e  # 3 testes Playwright — LOCAL only, usa Supabase real
npx tsc --noEmit  # typecheck
```

⚠️ **Ordem importa:** suba o `dev` PRIMEIRO, o Inngest DEPOIS. O `predev`
libera as portas 3000 **e 8288** — reiniciar o dev mata o Inngest junto, e aí
vídeo/render fica "processando" pra sempre.

⚠️ Sem o Inngest rodando, nada que dispare job funciona ("Varrer agora", gerar
post/carrossel) → `ECONNREFUSED`.

---

## 3. Como o produto funciona por dentro (o caminho de um post)

```
cron 3h (ou "Varrer agora")
  └─ scan-news          lê RSS → tira duplicata → triagem por IA (score viral)
      └─ generate-post  escreve legenda + escolhe/gera imagem → fila
          (ou generate-carousel, para clientes em modo carrossel)
              └─ notify         avisa no Telegram
      (ou, por botão na fila: generate-video-post → roteiro + b-roll → attach-video)
                  └─ [pessoa APROVA na /fila]
                      └─ render-approved-post   desenha a arte definitiva
                          └─ /ready             copiar texto + baixar arte
                              └─ publish-scheduled-posts  (Instagram, ver §5.9)
```

Arquivos-chave:

| Área | Arquivo |
|---|---|
| Limites de plano (fonte da verdade) | `src/lib/plans.ts` |
| Guard de sessão / rotas públicas | `src/middleware.ts` |
| Todas as server actions | `src/app/actions.ts` |
| Varredura + fan-out por cliente | `src/inngest/functions/scan-news.ts` |
| Geração de post / carrossel | `src/inngest/functions/generate-post.ts`, `generate-carousel.ts` |
| Arte (SVG → PNG) | `src/lib/image.ts`, `src/lib/cover-svg.ts`, `src/lib/carousel-render.ts` |
| Vídeo | `src/lib/video-assembly.ts`, `src/lib/stock-videos.ts` |
| Cliente ativo (multi-tenant) | `src/lib/client-context.ts`, `src/lib/shell.ts` |
| Migrations (001–050, todas aplicadas) | `supabase/migrations/` |

---

## 4. O que está PRONTO e no ar

- **Multi-tenant + Brand Kit por cliente**, isolado por RLS. **RLS ativa em
  12 de 12 tabelas**, verificado com a chave anônima: tudo devolve `[]`.
- **Pipeline completo** rodando em produção: 114 posts em aprovação,
  32 aprovados, 38 publicados. Os 70 aprovados/publicados renderizaram sem
  nenhum erro.
- **Onboarding automático** de conta nova (trigger `handle_new_user`): cria
  cliente, Brand Kit, config e 2–4 fontes conforme o nicho do cadastro. A
  primeira varredura dispara na primeira visita à fila.
- **Motor de arte**: 5 layouts + fundo por post/card, cor do wordmark por
  post, rótulo do topo editável, contraste automático.
- **Carrossel completo**: estrutura por IA, render, galeria, editar card,
  baixar zip.
- **Vídeo por upload**: Reels 9:16 e feed 4:5 com foto de fundo, véu
  escolhível, reenquadre, vídeo como carrossel.
- **Vídeo GERADO do zero** (Sprint D, migration 049): botão "gerar vídeo" na
  fila → roteiro por IA → b-roll do Pexels → legenda queimada → entra como
  fonte e ganha a marca na aprovação. Manual, nunca no cron.
- **Título sobre o vídeo é escolha do post** (migration 050): no Reels ele pode
  ficar fixo o vídeo inteiro ou sair aos 4s com fade — pra vídeo que já tem
  texto próprio e não quer dois textos competindo.
- **Fila**: card minimalista, aprovar/descartar em lote, pausa do piloto
  automático, conversão entre formatos.
- **Anti-duplicata por embedding** (pgvector), dentro do mesmo cliente.
- **Métricas do Instagram** + renovação automática do token.
- **Páginas legais** (`/privacidade`, `/termos`, `/exclusao-de-dados`) no ar,
  respondendo 200.
- **Vercel Analytics** ligado.
- **Qualidade**: `tsc` limpo, `lint` limpo, build limpo, 499 testes + 3 e2e
  passando. CI no GitHub Actions em todo push.

---

## 5. O que FALTA (por gravidade)

Numeração igual à de `docs/auditoria-lancamento.md`, pra dar pra cruzar.

### Já corrigido — todos os 8 itens de código da auditoria estão fechados

| # | Item | Commit |
|---|---|---|
| 2.1 | Teto de fontes por plano aplicado no `addSource` | `914c2cc` |
| 2.2 | Teto de clientes por plano (`maxClients`) | `914c2cc` |
| 2.4 | Aviso de cota estourada na fila | `914c2cc` |
| 2.5 | `feed_url` validada (só http/https, bloqueia host interno) | `914c2cc` |
| 2.3 | Triagem para de gastar IA de quem já estourou a cota do mês | `97b4355` |
| 2.6 | Exclusão de conta self-service (LGPD) | `2e7e508` |
| 2.7 | `/pricing` aberta sem login | `cc9e555` |
| 2.8 | Rotas de API devolvem 401 em vez de 307 | `cc9e555` |

⚠️ **Duas coisas antes de considerar isso encerrado:**

1. **A exclusão de conta nunca foi testada no browser** — só passou por
   `tsc`, lint, testes e build. A ação é irreversível: teste com uma conta
   descartável, não com a sua.
2. **Nada foi enviado pro `origin` ainda.** `git push` está pendente, e o push
   dispara deploy automático na Vercel.

### Ainda aberto

| # | Item | Impacto |
|---|---|---|
| 2.10 | **Stripe em modo de teste** — ninguém consegue pagar de verdade | trava a receita |
| 2.9 | **App Review do Meta não submetido** — publicação automática só em contas de teste. Para o público, o produto entrega até o download da arte | dossiê pronto em `docs/meta-app-review.md`; falta Business Verification, screencast, ícone/categoria |
| — | Presets de nicho (confeitaria, saúde, advocacia) prontos porém **em standby** | decisão de produto |
| — | **Free tier do Gemini: 20 requisições por DIA** (`gemini-2.5-flash`) — bateu 429 na primeira geração de roteiro | é o teto do provider de texto do produto inteiro, não só do vídeo. Contar antes de religar o piloto |
| — | O **botão** "gerar vídeo" nunca foi clicado por gente — o job foi disparado por evento direto no Inngest, e funcionou ponta a ponta | abrir a fila e clicar, pra ver o estado mudar na tela |
| — | **Post #47 virou vídeo em produção** (foi a cobaia do teste) | reverter se incomodar: apagar 2 arquivos do Storage e voltar `format='single'` |
| — | Publicação de Reels (Graph API) e TikTok | Sprint D segue aberto nesse ponto |
| — | Sprints E (Viral Radar) e F (ações de agente) | não começados |

### Nunca foi testado

Carga/concorrência (muitos usuários ao mesmo tempo) · custo real por usuário
em produção · e-mail de confirmação do Supabase chega/cai em spam ·
pagamento ponta a ponta (bloqueado pelo 2.10) · acessibilidade e celular real.

---

## 6. Planos e política de custo

| Plano | Preço | Posts/mês | Fontes por cliente | Clientes |
|---|---|---|---|---|
| Radar (free) | R$0 | 5 | 2 | 1 |
| Criador | R$79 | 30 | 5 | 3 |
| Pro | R$149 | 90 | ∞ | ∞ |

Free leva marca "feito com PostPilot" na arte — é o loop viral.

💸 **Política em vigor: não gastar nada.** O controle não é teto de fatura, é
escolha de provider:

- **Texto:** `gemini-2.5-flash` (tem free tier). ✅
- **Imagem:** `stock` (Pexels/Unsplash). ✅
- **Custa dinheiro, não usar por enquanto:** `gemini-2.5-flash-image`, Fal,
  Anthropic.

⚠️ **Cinco dos seis Brand Kits ainda estão em `image_provider='gemini'`.** Hoje
não gastam porque `auto_generate=false` em todos os clientes — mas religar
qualquer um deles começa a consumir. Trocar o provider ANTES de religar.
Script: `scripts/set-client-provider.ts`.

---

## 7. Lançamento — plano organizado

### 7.1 O que já está cumprido do checklist

✅ Onboarding automático · ✅ marca no plano free · ✅ deploy em produção com
migrations 001–048 · ✅ landing com CTA · ✅ Vercel Analytics · ✅ `/pricing`
pública (pendente de commit).

### 7.2 Portões — o que precisa antes de cada passo

**Portão 1 — antes de o link circular:**
1. Commitar e verificar o lote pendente do §5 (2.3, 2.6, 2.7, 2.8).
2. Fluxo completo em aba anônima e no celular: cadastro → ajustes → varredura
   → aprovar → baixar.
3. Confirmar que o e-mail de confirmação do Supabase chega (checar spam).
4. Confirmar `image_provider` de todos os kits antes de religar
   `auto_generate` (§6).

**Portão 2 — antes de cobrar:**
5. Stripe em modo live: chaves `sk_live_`, produtos recriados, webhook
   apontando pro domínio real, novo `STRIPE_WEBHOOK_SECRET`.
6. Testar o pagamento ponta a ponta.

**Portão 3 — quando o produto abrir de fato:**
7. App Review do Meta (libera a publicação automática).
8. Teste de carga mínimo e medição do custo real por usuário.

### 7.3 A sequência de divulgação (dia do lançamento)

Roteiro completo, com textos prontos, está em `LANCAMENTO.md` §3.
Resumo: véspera 20h story-enquete · 08h Reel principal ("comenta PILOTO") ·
08h15 comentário fixado · 09h thread no X · 10h mensagem nos grupos ·
12h stories de bastidor · 15h LinkedIn · 18h social proof · 22h recap.

**Canais (todos grátis):** o perfil @joaorodrigues.ia (o produto vendendo o
produto), grupos de social media/IA no WhatsApp e Telegram, X/Twitter tech BR.

**Meta dos primeiros 10 usuários:** DM 1-a-1 para 30 alvos nomeados +
onboarding concierge de 15 min, com a pessoa aprovando o primeiro post ainda
na call.

### 7.4 A métrica que decide tudo

> **Aprovadores consistentes:** usuários que aprovaram ≥1 post em ≥4 dos
> primeiros 7 dias. **Meta: 5 de 10.**

```sql
select user_id, count(distinct date(approved_at)) as dias_ativos
from posts
where approved_at >= now() - interval '7 days'
group by user_id
having count(distinct date(approved_at)) >= 4;
```

| Resultado | Leitura | Ação |
|---|---|---|
| ≥5/10 | tração real | repetir o playbook, subir volume |
| 3–4/10 | ativa mas não retém | falar com quem parou ANTES de escalar |
| <3/10 | problema é produto | corrigir geração/fricção; divulgar agora queima audiência |

### 7.5 Regra da semana 1

Manhã = 1 melhoria por dia, no máximo. Tarde = growth (DMs, conteúdo, calls).
Nenhuma feature de mais de 1 dia. Bug na fila/geração/aprovação é P0 sempre —
é o core loop.

---

## 8. Os outros documentos

| Documento | Para quê | Estado |
|---|---|---|
| `ESTADO-DO-PROJETO.md` (este) | mapa geral, ponto de partida | em dia |
| `PROGRESSO-2.0.md` | diário técnico completo, sessão a sessão, com o porquê de cada decisão. 1290 linhas | em dia |
| `docs/auditoria-lancamento.md` | auditoria de prontidão pra público, tudo verificado por execução | em dia (30/07) |
| `LANCAMENTO.md` | playbook de divulgação, textos prontos, funil | textos válidos; o checklist do §1 está **desatualizado** — use o §7 daqui |
| `docs/meta-app-review.md` | dossiê do App Review do Meta | pronto, não submetido |
| `docs/layouts-spec.md` + `docs/layouts.html` | especificação e painel visual dos layouts (o HTML é gerado por `scripts/build-layouts-html.ts`) | em dia |
| `HANDOFF-overlens-template.md` | histórico do Template Studio | histórico |
| `README.md` | instruções de setup | **desatualizado** — descreve o MVP v1 (sem multi-tenant, carrossel ou vídeo) |

---

## 9. Se você acabou de pegar o projeto

1. `npm install`, copie `.env.example` → `.env.local`, preencha as 3 chaves do
   Supabase. Sem as outras chaves, tudo roda em **modo mock a custo $0**.
2. Suba `npm run dev`, depois o Inngest.
3. Rode `npm test` — se der verde, o ambiente está de pé.
4. Leia §5 daqui e commite o lote pendente. É o trabalho mais imediato.
5. Para entender o porquê de qualquer decisão estranha no código, procure a
   seção correspondente em `PROGRESSO-2.0.md` — está tudo registrado lá.
