# PostPilot 2.0 — Progresso e Roadmap de Execução

> Documento vivo. Atualize os checkboxes conforme avança. Companheiro
> técnico do plano estratégico e do handoff v2. Ordem importa: as
> tarefas têm dependência.

**Branch de trabalho:** `feat/multi-tenant-brand-kit` (não mexer na `main`).
**Última atualização:** 2026-07-21.

> ⚠️ **Ponto de restauração:** ver seção 0 abaixo antes de mexer em qualquer
> coisa nova — tem o commit exato pra voltar se algo quebrar.

---

## 0. Sessão 2026-07-21 — kit v2 (5 layouts + vídeo Reels MVP)

Sessão longa, fora da ordem do roadmap original (o usuário trouxe um "kit de
design" próprio — `AGENT_PROMPT.md` + `postpilot-layouts.html` — com um
pedido específico: sistema de identidades de layout ortogonais à cor da
marca, contraste automático, e depois vídeo). Tratei como uma extensão do
que já existia (B6-B12), não como reescrita. Tudo abaixo está **testado
(193 testes verdes), `tsc`/`eslint` limpos, e verificado ao vivo** (não só
em teste automatizado) — sempre com dados reais da conta do usuário
(`@joaorodrigues.ia`) antes de considerar pronto.

**Ponto de restauração:** commit `0a94a0e` ("feat(kit-v2): contraste
automático + 5 layouts + página 1 unificada + Reels MVP") na branch
`feat/multi-tenant-brand-kit`. Pra voltar pra ANTES desta sessão toda:
`git reset --hard e2617c3` (o commit imediatamente anterior) — CUIDADO,
é destrutivo; prefira `git revert 0a94a0e` ou uma branch nova se tiver
dúvida. Qualquer commit DEPOIS de `0a94a0e` (ver `git log --oneline`) foi
trabalho autônomo feito enquanto você dormia — cada um reverte isolado
com `git revert <hash>`.

### 0.1 Contraste automático (Fase 1 do kit v2)
- [x] `src/lib/contrast.ts`: luminância real medida na foto (não estimada),
  limiar 0.55 → tema claro/escuro, razão WCAG mínima 4.5:1, overlay
  calibrado (nunca fixo/às cegas). 13 testes (casos de borda 0/0.54/0.55/1).
- [x] Aplicado em TODO lugar que desenha texto sobre foto: capa/interior/
  fechamento do carrossel, página 1 do post único, quadro Reels, overlay
  de vídeo (luminância medida do **frame de pôster**, não do vídeo inteiro).

### 0.2 Página 1 do post único unificada com o motor de layouts
- Antes: página 1 (foto+hook) usava um compositor genérico separado
  (`composeTemplate`, removido), sem contraste automático, com chip fixo
  no topo, sem wordmark. Só a contra-capa usava o motor novo.
- [x] Unificado: página 1 agora usa o MESMO motor de 5 layouts que a capa
  do carrossel (`buildPageOneCoverSvg` em `image.ts`) — decisão do usuário:
  **sem chip** (Instagram já mostra o perfil por cima do post) e **com
  wordmark**, igual à capa.
- [x] **2 variações de post único** (kit v2 §3): `brand_kits.single_post_style`
  (`cover` default | `centered`) — "estilo capa" (wordmark+título) vs
  "fonte no meio" (frase centralizada minimalista, sem marca nenhuma,
  usando a MESMA fonte de destaque do layout escolhido). Seletor em
  Ajustes ("Estilo do post único"), migration 031 (aplicada).
- [x] Bug real achado e corrigido: os 4 layouts alternativos confundiam
  "página 1" com "contra-capa" (mesma heurística `overlay presente + sem
  swipe hint`) e desenhavam os ícones de ação indevidamente — corrigido
  com `showActionIcons` explícito nos 4 arquivos `layout-*.ts` + teste
  de regressão.

### 0.3 5 identidades de layout completas (Fase 3 do kit v2)
Preset ortogonal à cor da marca — `brand_kits.layout_preset` (migration
030, aplicada): `editorial-noir` (padrão) | `brutalism` | `serif-luxe` |
`swiss-mono` | `pop-creator`. Cada um em `src/lib/layout-{nome}.ts`
(exceto editorial-noir, que é o `carousel-render.ts` original).
- [x] Título do card INTERIOR nível-capa (auto-fit por comprimento, mesma
  lógica da capa) nos 5 — não era assim antes; título era menor no miolo.
  Corpo escala proporcional ao título.
- [x] Corpo/título maiores, tipografia por preset (Anton/DM Serif Display/
  Inter 800/Varela Round + IBM Plex Mono), bugs de colisão de linha
  corrigidos ao vivo (Anton precisa de `line-height` maior que o normal).
- [x] **20 previews** em Ajustes (`LayoutPreview.tsx` + `layout-preview.ts`):
  5 layouts × 4 formatos (capa/carrossel/vídeo/híbrido), SVG puro (sem
  rasterizar), reaproveita os MESMOS builders do render real — nunca
  desalinha do que sai de verdade. Vídeo/híbrido são aproximação estática
  (motor de vídeo real só compõe foto/vídeo real, não gera preview
  animado).
- [ ] Layout ainda **não finalizado visualmente** — usuário disse que vai
  trazer ajustes de layout depois. Não mexer em tipografia/estrutura dos
  5 presets sem pedido explícito dele.

### 0.4 Reels 9:16 — motor de vídeo real (Fase 4 do kit v2 — NÃO é o SPRINT D completo)
⚠️ **Isto é um MVP simplificado, não o Video Engine do §4.4 abaixo**
(aquele pede Remotion + b-roll automático + legendas queimadas + TikTok).
O que foi construído agora:
- [x] **Upload manual** do usuário (sem geração por IA de vídeo) — botão
  "Anexar vídeo" em qualquer post pendente (single). Server Action
  `uploadPostVideo` sobe o arquivo bruto (máx 50MB) e dispara o
  processamento em BACKGROUND (Inngest) — nunca síncrono (ffmpeg pode
  levar dezenas de segundos).
- [x] **Motor ffmpeg** (`src/lib/video.ts`, via `ffmpeg-static` +
  `fluent-ffmpeg`): extrai frame de pôster, mede contraste nele, encaixa
  o vídeo enviado pela LARGURA (nunca corta lateral — regra crítica do
  kit), completa topo/base com extensão desfocada do próprio vídeo,
  sobrepõe overlay de texto (wordmark/título, motor de 5 layouts).
  Testado com vídeo 16:9 sintético → saída 1080×1920 exata, sem cortar.
- [x] **Achado de infra real (só apareceu rodando, não em teoria):**
  `ffmpeg-static` precisa entrar em `experimental.serverComponentsExternalPackages`
  no `next.config.mjs` — sem isso o Next tenta "bundlar" o binário e
  quebra (`spawn .../vendor-chunks/ffmpeg.exe ENOENT`). Já corrigido.
  Também adicionado `outputFileTracingIncludes` pra Vercel empacotar o
  binário na função serverless (250MB de limite, ffmpeg-static tem ~80MB
  — cabe folgado).
- [x] Job `attach-video` (Inngest): nunca deixa exceção escapar — sempre
  grava `video_status` ('processing'|'ready'|'error') no post, mesmo se
  o encode falhar.
- [x] UI na fila (`PostCard.tsx`) e em Prontos (`ReadyPostCard.tsx`):
  player nativo quando pronto, estado "processando", botão de baixar
  vídeo.
- [x] **Testado ponta a ponta com dados reais** (não só sintético): post
  real do usuário, upload real, ffmpeg real, resultado real com
  wordmark/@handle/layout da conta de verdade.
- [x] Migration 032 (aplicada): `posts.video_url`, `video_poster_url`,
  `video_status`, `video_error`.

**Pendências conhecidas do vídeo:**
- [x] **Resolvido (trabalho autônomo pós-restore point, ver commit
  seguinte):** `resync-layout-preset` agora TAMBÉM reprocessa posts de
  vídeo já prontos (`format='video'`, `video_status='ready'`) quando o
  layout muda — reusa o `-video-source.mp4` já guardado no Storage, não
  precisa o usuário reenviar o arquivo. Testado disparando o job de
  verdade (Inngest dev server) contra o post real com vídeo — sem erro.
- [ ] Vídeo no FEED (bloco contido 1:1/16:9 com play+badge+barra de
  progresso) e vídeo no INTERIOR do carrossel — só o Reels 9:16 foi feito.
- [ ] Geração de vídeo por IA — explicitamente fora de escopo (usuário
  escolheu só upload manual).
- **Dependência de ambiente:** `npx inngest-cli dev` PRECISA estar rodando
  local pra vídeo processar (upload sem isso fica "processando" pra
  sempre, sem erro — não é bug, é falta do dev server; em produção com
  Inngest Cloud configurado isso não acontece).

### Migrations desta sessão (todas aplicadas no Supabase pelo usuário)
- [x] `030_layout_preset.sql` — `brand_kits.layout_preset`.
- [x] `031_single_post_style.sql` — `brand_kits.single_post_style`.
- [x] `032_video_posts.sql` — `posts.video_url/video_poster_url/video_status/video_error`.

### Arquivos novos desta sessão
`src/lib/render-shared.ts` (tipos/constantes compartilhados), `layout-brutalism.ts`,
`layout-serif-luxe.ts`, `layout-swiss-mono.ts`, `layout-pop-creator.ts`,
`layout-centered.ts` (fonte no meio), `layout-preview.ts` + `LayoutPreview.tsx`
(previews), `contrast.ts`, `profile-chip.ts`, `video.ts` (motor ffmpeg),
`inngest/functions/resync-layout-preset.ts`, `inngest/functions/attach-video.ts`,
`docs/layouts-spec.md` (spec pra IA de design externa).

### Pra continuar amanhã
1. `npm run dev` + `npx inngest-cli dev -u http://localhost:3000/api/inngest`
   (os dois — vídeo e resync de layout dependem do Inngest).
2. Se algo quebrou: `git log --oneline` e ache o commit desta sessão
   (mensagem começando com `feat(kit-v2)` ou similar — ver o commit mais
   recente antes de mexer). `git diff <hash-do-commit-de-hoje>` mostra
   exatamente o que mudou hoje.
3. Trabalho autônomo que rodei DEPOIS do ponto de restauração (se houver):
   ver commits subsequentes — cada um é um passo seguro pra reverter
   isoladamente com `git revert <hash>` sem perder o resto.
4. Você disse que vai trazer ajustes de LAYOUT (tipografia/estrutura dos
   5 presets) — não mexi em nada disso além do que já estava aprovado.

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
- [x] **Base de testes** (67 verdes): unit (mock) + integração RLS/uniqueness/pgvector
  (pglite). **e2e** (Playwright, 3 verdes: multi-tenant + carrossel) contra a stack real.
  **CI** em GitHub Actions (mock, sem secrets).

### Migrations aplicadas no Supabase
- [x] `020_multitenant_brand_kit.sql` — clients + brand_kits + client_id + backfill + RLS + trigger.
- [x] `021_active_client.sql` — `active_client_id` (fan-out).
- [x] `022_client_scoped_uniques.sql` — unique `(client_id, feed_url)` em fontes; `unique(client_id, news_item_id)` em posts (idempotência).
- [x] `023_caption_embedding.sql` — pgvector + `posts.caption_embedding` + RPC `find_duplicate_caption`.
- [x] `024_drop_migrated_brand_columns.sql` — remove de notification_configs as colunas migradas p/ brand_kit.
- [x] `025_carousel.sql` — `posts.format` + `carousel_cards` + RLS.
- [x] `026_default_format.sql` — `brand_kits.default_format` (gatilho single/carousel por cliente).

**Todas as migrations (020–026) aplicadas no Supabase.**

### Também já pronto (backend + UI + testes)
- [x] **Anti-duplicata por embedding** (pgvector): generate-post embeda a legenda, acha post do mesmo cliente parecido demais e regenera 1x com "novo ângulo". Mock determinístico ($0). **Runtime confirmado** (RPC casta text→vector no Supabase real).
- [x] **Limpeza**: notification_configs enxuto (só telegram + active_client_id).
- [x] **Carousel Engine COMPLETO**: estrutura (7–10 cards, mock+real) + render SVG+Brand Kit → PNG (resvg) + job `generate-carousel` + **UI na fila (galeria, editar card, baixar zip)** + gatilho por cliente. **Rodou ponta a ponta em runtime**: scan → generate-carousel → notify (COMPLETED); cards renderizam com a marca (verificado visualmente).

### Commits (branch feat/multi-tenant-brand-kit, no origin)
- `2a9cc35` multi-tenant + Brand Kit · `4842bc9` e2e · `ea7b124` docs · pgvector · limpeza · carousel backend · carousel UI · carousel e2e · gatilho · carousel v2 (editar/zip).
- **Testes: 67 (unit+pglite) + 3 e2e**, todos verdes.

---

## 2. Como rodar e testar

```bash
npm run dev              # app em http://localhost:3000
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest   # jobs (OBRIGATÓRIO no dev)
npm test                 # unit + integração RLS/uniqueness/pgvector (mock, sem chaves)
npm run test:e2e         # Playwright (LOCAL only — cria/apaga usuário efêmero no Supabase real)
npx tsc --noEmit         # typecheck
```

- **⚠️ Inngest local:** qualquer coisa que dispare job (Varrer agora, gerar post/carrossel)
  precisa do **Inngest Dev Server** rodando junto (`npx inngest-cli dev`). Sem ele:
  `ECONNREFUSED` → "Não foi possível iniciar a varredura". Dashboard: `localhost:8288`.
  Em produção (Vercel) é o contrário: setar `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`.
- **CI** (`.github/workflows/ci.yml`): roda `tsc` + `npm test` em todo push/PR, em modo mock.
- **e2e não roda no CI** (precisa Supabase real; o CI é mock). É local-only.
- Testes de RLS/pgvector usam **pglite** (Postgres em WASM, sem Docker) aplicando as migrations reais.

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
| Anti-duplicata (embedding + RPC) | `src/lib/ai/embedding.ts` |
| Carrossel: estrutura IA | `src/lib/ai/carousel.ts` |
| Carrossel: render SVG→PNG | `src/lib/carousel-render.ts` |
| Carrossel: job Inngest | `src/inngest/functions/generate-carousel.ts` |
| Carrossel: UI (galeria/editar/baixar) | `src/components/PostCard.tsx`, `CarouselEditor.tsx`, `CarouselDownload.tsx` |
| Harness de teste (pglite + migrations reais) | `src/test/pg.ts` |
| Testes (RLS, uniqueness, pgvector, carousel) | `src/test/*.test.ts` |
| e2e | `e2e/*.ts`, `playwright.config.ts` |

---

## 4. O que falta (em ordem)

### 4.0 Verificação — ✅ FEITA
- [x] Multi-tenant testado no app (troca/cria cliente, isolamento). Migrations aplicadas.
- [x] Pipeline rodou em runtime (scan → carrossel → notify) e renderizou com a marca.
- Nota: erro de hidratação + "carrossel sem imagem" que apareceram no browser do dono
  eram **extensão do browser** (não reproduz em aba anônima / Chromium limpo). App correta.
- [ ] (Opcional) Abrir o PR: https://github.com/Nolei98/PostPilot-AI/pull/new/feat/multi-tenant-brand-kit
- [ ] (Opcional) Merge de `feat/multi-tenant-brand-kit` na `main` quando quiser.

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
- [x] **UI de aprovação (v1)** na fila: post `format='carousel'` mostra a galeria dos
      cards (reusa `CarouselPreview`); controles single-only (prompt de imagem,
      contra-capa) escondidos. `image_url` do post = card do gancho → aparece como
      thumbnail em Prontos/Telegram sem mudar nada lá. Guardado por `format` → posts
      single intactos.
- [x] **UI de aprovação (v2)**: download zip dos PNGs (`CarouselDownload`, jszip) +
      editar o texto de 1 card e re-renderizar só ele (`CarouselEditor` +
      `updateCarouselCard`). e2e cobre galeria + download + editor.
- [x] **Gatilho (v1)**: preferência por cliente `brand_kits.default_format`
      (single|carousel, default single). O `scan-news` despacha `generate-post` ou
      `generate-carousel` conforme o cliente. Ajustes tem o seletor "Formato dos posts".
      Migration 026 aplicada.
- [ ] *(opcional)* galeria/edição de carrossel também na tela Prontos (hoje mostra o
      card do gancho como thumbnail — funcional).
- **SPRINT B COMPLETO** ✅ — gera, mostra, edita, baixa, aprova; gatilho por cliente.
- Runtime confirmado: RPC `find_duplicate_caption` casta `text→vector` no Supabase real.

### 4.2b SPRINT B+ — Acabamento @0verlens + Template Studio  📄 [HANDOFF-overlens-template.md](./HANDOFF-overlens-template.md)
Extensão do Carousel Engine: capas/cards com acabamento sofisticado (estilo @0verlens),
**legibilidade adaptativa** ao fundo e **Template Studio** (galeria de modelos + editor
visual). Brief completo + prompt mestre no arquivo linkado acima. **Ainda não iniciado.**
- [x] **B6** — Estender Brand Kit (migration 027): `keywords`, `wordmark`, `font_heading_url`, `brand_mark`, `template_defaults` (reusa `ig_handle` como handle) + tipos `BrandMark`/`TemplateDefaults` + seção "Identidade de rótulo" em Ajustes (`BrandLabelForm`) com **preview ao vivo** + `saveBrandLabel` + teste de schema (pglite). *Fonte Geist (`font_heading_url` upload) fica no B8 quando embutir no Satori.* Decisões: **Geist** + editor **server-side**.
- [x] **B7** — Motor de legibilidade adaptativa (`src/lib/legibility.ts`): `contrastRatio` (WCAG), `measureBands` (sharp: L+desvio por faixa), `decideLegibility` (puro: cor/posição/scrim/auto-hide/override), `resolveLegibility`. 13 testes.
- [x] **B8** — Render @0verlens via **SVG+resvg** (decisão: NÃO introduzi Satori às cegas — reuso o pipeline que já renderiza): `buildCoverSvg` (divisor `———— WORDMARK ————` + headline auto-fit + "DESLIZE PARA VER") + `brandLabelText`/label nos cards por `brand_mark`. **Verificado visualmente** (capa sai bonita). Fonte: usa a família atual (Geist entra quando o .ttf for fornecido).
- [ ] **B9** — Overrides manuais na fila por card (`layout` → `carousel_cards`), re-render só do card. *(UI — pro teu retorno; precisa migration de `carousel_cards.layout`.)*
- [x] **B10** — Integrado no `generate-carousel` (card 0 = capa via `isCover`); passa wordmark/handle/keywords/brand_mark; best-effort se 027 ausente.
- [x] **B11** — `templates` (presets sistema + custom por cliente) + `brand_kits.template_selection` (migration 028) + tipos `Template`/`Surface`/`TemplateSpec` + RLS (sistema público, custom por dono). 2 testes RLS.
- [x] **B12** — `renderFromSpec` (`src/lib/template-render.ts`): desenha a spec (anchor/offset/style/bind → SVG), resolve cor auto/accent + legibilidade, wrap, z-order, visible. `template-presets.ts` = cover+card como spec. **Verificado visualmente**: capa por spec == capa hardcode do B8. Testes.
- [ ] **B13** — Seed ≥4 presets/superfície no banco (os 2 base já existem como spec em `template-presets.ts`; falta variar marca×cor×fundo e inserir em `templates`). *(design visual — pro teu retorno.)*
- [ ] **B14** — Editor visual interativo (drag+resize, snapping, camadas, undo/redo, live preview server-side). *(UI grande, precisa iteração visual — pro teu retorno.)*
- [ ] **B15** — Pipeline usa `template_selection` por superfície. *(depende de B12/B13.)*
- **Decisões travadas:** fonte = **Geist** (falta o arquivo .ttf p/ embutir no resvg); editor = **preview server-side**.
- **Migrations a aplicar quando voltar:** `027_brand_label_identity.sql` (✅ já aplicou), `028_templates.sql` (pendente — aditiva, código não depende dela em runtime ainda).
- **Decisão de engenharia (autônoma):** o brief pedia Satori; usei o render **SVG+resvg** que já existe e funciona (evita dep nova + risco). O contrato `spec` (B12) pode ser desenhado sobre esse mesmo render. Reverter pra Satori é possível se você preferir.
- Depende de: Sprint D (Remotion) para a montagem de vídeo do `video_cover` (aqui só o branding/legenda).

### 4.3 SPRINT C — Graph API (publicação auto + fecha o loop de métricas)
- [ ] OAuth de conta IG Business/Creator por cliente (token por `client_id`).
- [ ] Publicação automática (single + carrossel) + agendamento via `scheduled_for`
      (campos `scheduled`/`published`/`ig_media_id` já existem no schema).
- [ ] `collect-insights` (Inngest, 24h/72h): alcance/salvamentos/compartilhamentos →
      tabela `post_metrics`; comparar com o score previsto do Haiku.
- **Aceite:** aprovar → agenda → publica; métricas reais gravadas por post.

### 4.4 SPRINT D — Video Engine (clipes reais, não slideshow)
> ⚠️ **Update 2026-07-21 (ver seção 0.4):** um MVP mais simples já foi
> construído fora de ordem (pedido pontual do usuário) — upload manual +
> ffmpeg overlay (wordmark/título, motor de contraste) em quadro Reels
> 9:16. NÃO tem b-roll automático, NÃO tem legendas queimadas, NÃO usa
> Remotion, NÃO publica (fica na fila pra aprovação manual, igual
> foto/carrossel). O que falta abaixo continua de pé.
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

**Status:** ✅ implementado (intra-cliente, stub no mock, runtime confirmado). Migration 023.
Extensão futura possível: guardrail *cross-cliente* — deferido (cada cliente deve poder
falar do mesmo fato à sua voz).

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
