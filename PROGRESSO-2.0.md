# PostPilot 2.0 — Progresso e Roadmap de Execução

> Documento vivo. Atualize os checkboxes conforme avança. Companheiro
> técnico do plano estratégico e do handoff v2. Ordem importa: as
> tarefas têm dependência.

**Branch de trabalho:** `feat/multi-tenant-brand-kit` (não mexer na `main`).
**Última atualização:** 2026-07-18.

---

## 1. Onde estamos (pronto e no ar)

O **Sprint A (Multi-tenant + Brand Kit)** está concluído, testado e com as
migrations aplicadas no Supabase. Além dele, foi feita a base de testes.

- [x] **Multi-tenant**: conceito de `client` (tenant). Um dono tem N clientes,
  cada um com Brand Kit próprio. Isolamento por RLS (por `user_id`) + escopo
  por `client_id` dentro dos dados do próprio dono.
- [x] **Brand Kit por cliente**: logo, cores, perfil IG, nicho, providers de IA,
  idioma — tudo em `brand_kits`, editável por cliente ativo. Telegram continua
  per-usuário em `notification_configs`.
- [x] **Seletor de cliente** no app (sidebar + mobile): trocar e criar cliente.
- [x] **Reads/writes de marca** migrados de `notification_configs` → `brand_kits`
  do cliente ativo (settings, actions, `generate-post`, preview da fila).
- [x] **Fan-out "só cliente ativo"** (custo 1x): o cron gera só para o cliente
  ativo de cada dono (`notification_configs.active_client_id`); o scan manual
  ("Varrer agora") varre só o cliente ativo.
- [x] **Base de testes** (34 verdes): unit (mock) + integração RLS (pglite) +
  uniqueness. **e2e** (Playwright, 2 verdes) contra a stack real. **CI** em
  GitHub Actions (mock, sem secrets).

### Migrations aplicadas no Supabase
- [x] `020_multitenant_brand_kit.sql` — clients + brand_kits + client_id + backfill + RLS + trigger.
- [x] `021_active_client.sql` — `active_client_id` (fan-out).
- [x] `022_client_scoped_uniques.sql` — unique `(client_id, feed_url)` em fontes; `unique(client_id, news_item_id)` em posts (idempotência).
- [x] `023_caption_embedding.sql` — pgvector + `posts.caption_embedding` + RPC `find_duplicate_caption`.
- [x] `024_drop_migrated_brand_columns.sql` — remove de notification_configs as colunas migradas p/ brand_kit.
- [x] `025_carousel.sql` — `posts.format` + `carousel_cards` + RLS.

### Também já pronto (backend + testes)
- [x] **Anti-duplicata por embedding** (pgvector): generate-post embeda a legenda, acha post do mesmo cliente parecido demais e regenera 1x com "novo ângulo". Mock determinístico ($0).
- [x] **Limpeza**: notification_configs enxuto (só telegram + active_client_id).
- [x] **Carousel Engine (backend)**: geração da estrutura (7–10 cards, mock+real), render de card por SVG+Brand Kit → PNG (resvg), job `generate-carousel` registrado. **Falta a UI de aprovação** e decidir o gatilho (ver 4.2).

### Commits (branch feat/multi-tenant-brand-kit)
- `2a9cc35` multi-tenant + Brand Kit · `4842bc9` e2e · `ea7b124` docs
- `+` anti-duplicata (pgvector) · limpeza notification_configs · Carousel Engine backend
- **Testes: 66 verdes** (unit + integração pglite + e2e).

---

## 2. Como rodar e testar

```bash
npm run dev         # app em http://localhost:3000
npm test            # unit + integração RLS + uniqueness (mock, sem chaves)
npm run test:e2e    # Playwright (LOCAL only — cria/apaga usuário efêmero no Supabase real)
npx tsc --noEmit    # typecheck
```

- **CI** (`.github/workflows/ci.yml`): roda `tsc` + `npm test` em todo push/PR, em modo mock.
- **e2e não roda no CI** (precisa Supabase real; o CI é mock). É local-only.
- Testes de RLS usam **pglite** (Postgres em WASM, sem Docker) aplicando as migrations reais.

---

## 3. Mapa de arquivos (multi-tenant)

| Área | Arquivo |
| --- | --- |
| Tipos (`Client`, `BrandKit`) | `src/lib/types.ts` |
| Cliente ativo (cookie + resolução) | `src/lib/client-context.ts` |
| Dados da casca (clients, brand, contadores) | `src/lib/shell.ts` |
| Seletor de cliente (UI) | `src/components/ClientSwitcher.tsx` |
| Server actions (marca, troca de cliente, fontes) | `src/app/actions.ts` |
| Geração (lê brand_kit do cliente da notícia) | `src/inngest/functions/generate-post.ts` |
| Scan + fan-out por cliente ativo | `src/inngest/functions/scan-news.ts` |
| Harness de teste (pglite + migrations reais) | `src/test/pg.ts` |
| Testes RLS / uniqueness | `src/test/rls.test.ts`, `src/test/uniqueness.test.ts` |
| e2e | `e2e/*.ts`, `playwright.config.ts` |

---

## 4. O que falta (em ordem)

### 4.0 Verificação em produção (rápido, você)
- [ ] Trocar de cliente no app não dá erro; **Varrer agora** só traz notícia do cliente ativo.
- [ ] Editar marca (logo/cor/nicho) num cliente e conferir que **não vaza** para outro.
- [ ] (Opcional) Abrir o PR: https://github.com/Nolei98/PostPilot-AI/pull/new/feat/multi-tenant-brand-kit

### 4.1 Limpeza pós-verificação — ✅ FEITO
- [x] Dropar de `notification_configs` as colunas migradas (migration 024, aplicada).
      Type `NotificationConfig` enxuto; teste de guard de schema no pglite.

### 4.2 SPRINT B — Carousel Engine
Backend pronto e testado; falta a camada de UI e o gatilho.
- [x] `posts.format` + `carousel_cards` (migration 025, aplicada) + RLS.
- [x] Estrutura via IA (`src/lib/ai/carousel.ts`): 7–10 cards, card 0 = gancho,
      último = CTA, mock + real (claude/gemini/pollinations), validação + retry.
- [x] Render do card (`src/lib/carousel-render.ts`): SVG 1080×1350 com Brand Kit →
      PNG via resvg (`rasterizeSvg`), upload no bucket `post-images`. `buildCardSvg`
      é puro/testado; smoke test rasteriza PNG real.
- [x] Job `generate-carousel` (Inngest) registrado em `api/inngest/route.ts`; roda mock.
- [ ] **UI de aprovação** na fila/Prontos: renderizar o carrossel como galeria (swipe),
      editar texto de 1 card → re-render só dele, download zip dos PNGs. *(mexe na
      fila existente — deixado para fazer com a UI aberta)*
- [ ] **Gatilho**: decidir quando gerar carrossel vs single. Hoje `generate-carousel`
      é disparável só por evento (`post/generate-carousel.requested`); não está no cron.
      Opções: botão manual "gerar como carrossel" na notícia/fila, ou uma regra no
      pipeline. *(decisão de produto)*
- **Aceite (restante):** aprovar/editar/baixar um carrossel pela UI; gatilho definido.

### 4.3 SPRINT C — Graph API (publicação auto + fecha o loop de métricas)
- [ ] OAuth de conta IG Business/Creator por cliente (token por `client_id`).
- [ ] Publicação automática (single + carrossel) + agendamento via `scheduled_for`
      (campos `scheduled`/`published`/`ig_media_id` já existem no schema).
- [ ] `collect-insights` (Inngest, 24h/72h): alcance/salvamentos/compartilhamentos →
      tabela `post_metrics`; comparar com o score previsto do Haiku.
- **Aceite:** aprovar → agenda → publica; métricas reais gravadas por post.

### 4.4 SPRINT D — Video Engine (clipes reais, não slideshow)
- [ ] Roteiro (Sonnet): gancho 0–3s + beats + CTA; 9:16; duração por rede.
- [ ] Montagem com **b-roll real** (Pexels/Pixabay Video ou upload) + legendas
      queimadas + logo/chip via **Remotion** (⚠️ checar licença comercial do Remotion).
- [ ] Publicação Reels (Graph API) + TikTok (**Content Posting API** — pedir acesso cedo).
- **Aceite:** Reel 9:16 com b-roll real + legendas + marca, aprovável na mesma fila.

### 4.5 SPRINT E — Viral Radar + Remix
- [ ] `content_sources` (rss | ig_handle | tiktok_handle | keyword | trend); colar @.
- [ ] Coleta pay-per-use (Apify/similar) + **cache no Supabase por X dias**; custo por cliente.
- [ ] Viral Score normalizado por tamanho do perfil; extrair fórmula (gancho/estrutura)
      → alimenta `generate-*` para gerar **original** no nicho do cliente.
- **Aceite:** dado um @, retorna top referências com score + brief de remix.

### 4.6 SPRINT F — Expor como ações do agente
- [ ] Cada função Inngest vira ação chamável: `minerar_referencias`, `gerar_brief`,
      `gerar_conteudo`, `aplicar_marca`, `agendar_publicar`, `coletar_metricas`.
- **Aceite:** dado `client_id` + tema, o agente produz um carrossel de marca pronto para aprovação.

---

## 5. Decisões pendentes

### pgvector / anti-duplicata — ✅ IMPLEMENTADO (intra-cliente)
Feito conforme descrito abaixo, mas **só intra-cliente** e com **stub no mock**
(mantém a suíte a $0). Ver `src/lib/ai/embedding.ts` + migration 023 +
`find_duplicate_caption`. Explicação mantida abaixo para referência.

### pgvector / anti-duplicata por embedding — **o que é**
`pgvector` é uma extensão do Postgres que guarda **vetores** (listas de números) e
calcula **similaridade** entre eles. Um "embedding" é a representação numérica de um
texto: legendas parecidas geram vetores próximos. A ideia do handoff v2 era, ao gerar
uma legenda, salvar seu embedding em `posts.caption_embedding vector(1536)` e, antes de
publicar, comparar com legendas anteriores (distância de cosseno); se estiver perto
demais de outra, **regenerar com "novo ângulo"** — evitando conteúdo repetido.

**Por que está deferido:**
1. Gerar embedding exige um **provider de IA** (OpenAI/Gemini) → custa API e **quebra o
   modo mock** dos testes (a suíte hoje roda a $0 sem chave). Precisaria de stub.
2. No nosso modelo, cada cliente já posta na **própria voz/nicho** (Brand Kit condiciona
   o prompt), então dedup **entre** clientes é discutível — cada um *deve* falar do mesmo
   fato à sua maneira. O ganho real seria evitar repetição **dentro** do mesmo cliente.

**Decisão a tomar:** implementar o guardrail de similaridade (só intra-cliente, com stub
no mock) — **sim / não / depois**. Se sim, entra provavelmente junto do Sprint E.

---

## 6. Notas de arquitetura (para não tropeçar)

- **RLS não mudou** para as tabelas antigas: continua por `user_id` (isola donos).
  `client_id` é filtro de aplicação **dentro** dos dados do próprio dono.
- **Jobs (Inngest)** usam service role → ignoram RLS; por isso herdam `client_id` pela
  cadeia `source_configs → news_items → posts` explicitamente no código.
- **`news_items` já é o "source_item" per-cliente** (dedup por `(source_id, url)`), então
  o "bug crítico" do handoff (mesmo RSS → mesmo post) não existe aqui; a 022 só reforçou
  as uniques corretas.
- **Subscriptions** continuam per-usuário (o dono paga o plano, que cobre os clientes dele).
