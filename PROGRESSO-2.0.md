# PostPilot 2.0 — Progresso e Roadmap de Execução

> Documento vivo. Atualize os checkboxes conforme avança. Companheiro
> técnico do plano estratégico e do handoff v2. Ordem importa: as
> tarefas têm dependência.

**Branch de trabalho:** `main`. Desde 2026-07-27 a `feat/multi-tenant-brand-kit` está inteiramente mergeada na `main` e **produção Vercel roda a `main`** (o push dispara deploy automático — ver §0-A). A branch antiga não recebe mais commits.
**Última atualização:** 2026-07-28 — render-on-approval (migration 040): a arte deixa de ser montada na geração e passa a ser montada na aprovação, com preview ao vivo na Fila (ver §0-B; **migration 040 ainda não aplicada no Supabase**). Antes: 2026-07-27 — merge na `main` + Sprint C endurecido (renovação automática do token do Instagram, métricas com evento durável — ver §0-A); **bloqueio ativo:** geração de posts parada desde ~20/07 porque a Pollinations.ai (provider grátis do cliente, texto+imagem) passou a exigir pollen pago pra requests multi-mensagem (o que o app usa) — decisão pendente do usuário (pagar top-up, trocar provider, ou deixar parado). Nada quebrado no código; diagnóstico completo abaixo.

### Bloqueio ativo: Pollinations.ai exige pagamento pra requests multi-mensagem
Descoberto 2026-07-22 investigando por que a fila não recebia posts novos há dias
(246 acumulados, sem erro visível). `generate-carousel` falha em "generate-structure"
(`src/lib/ai/carousel.ts`) com `Pollinations respondeu 402`. Reproduzido fora do
Inngest com `curl` direto: requests de **1 mensagem** continuam grátis (200, tier
anônimo); requests de **2+ mensagens** (qualquer role, é o que o app sempre manda —
system+user) retornam 401/402 mesmo com uma API key nova + pollen grátis de quest
(0,25) na carteira. Precisa de pollen **pago** (mínimo $5.48 = 5 pollen em
`enter.pollinations.ai`, dá pra ~25 mil requests no preço unitário atual).
Criada uma API key (`postpilot`) na conta do usuário, sem saldo, não configurada
em lugar nenhum — só existe, sem efeito, até ele decidir. `GEMINI_API_KEY` existe
em produção mas está **vazia** (nome da env var criado, sem valor) — trocar de
provider agora exigiria gerar uma key de verdade primeiro.

> ⚠️ **Ponto de restauração:** ver seção 0 abaixo antes de mexer em qualquer
> coisa nova — tem o commit exato pra voltar se algo quebrar.

---

## 0-B. Sessão 2026-07-28 — a arte passa a ser montada na APROVAÇÃO (migration 040)

Mudança de modelo, não feature: até aqui a arte final era composta na
GERAÇÃO. Um carrossel de 10 páginas gastava 10 renders antes de alguém
olhar o post, e toda troca de cor/template/layout em Ajustes deixava a
fila dessincronizada — a saída era re-renderizar tudo em massa (resync,
migration 039). Pior, o vínculo era incoerente: as CORES viravam snapshot
em `tpl_*` na geração, mas o TEMPLATE era resolvido por referência em
render time — duas verdades sobre o mesmo post.

Modelo novo, em três tempos:
- **geração** resolve só a imagem BASE (`base_image_url`) e mede a
  luminância uma vez (`base_luminance` / `carousel_cards.bg_luminance`);
- **fila** desenha um preview AO VIVO no browser a partir da base + do
  Brand Kit atual — nenhum job, nenhuma arte gravada; mudou em Ajustes,
  aparece no próximo load;
- **aprovar/agendar** dispara o render, que CONGELA em `render_spec`
  tudo que decidiu a arte. Post aprovado nunca mais herda mudança de
  Ajustes.

Peças (todas nesta sessão, `main`):
- `supabase/migrations/040_render_on_approval.sql` — `render_status`
  (`none|pending|rendering|ready|error`), `render_error`, `render_spec`,
  `render_token`, `base_image_url`, `base_luminance`, `video_shape`,
  `carousel_cards.bg_luminance`. Marca tudo que já passou da fila como
  `ready` (senão o guard novo congelaria todo agendamento existente).
- `src/lib/render-spec.ts` — `resolveRenderSpec`, a fonte ÚNICA de "o que
  decide a arte". Chamada dos DOIS lados (preview e render final), que é
  o que garante que o preview não é decorativo. Também matou os quatro
  construtores de `CardBrand` que divergiam (dois esqueciam
  `singlePostStyle`).
- `src/lib/post-render.ts` — render a partir de uma spec congelada, sem
  ler `brand_kits`/templates/`tpl_*`. Extraído do resync.
- `src/lib/post-preview.ts` + `src/components/PreviewFrame.tsx` — preview
  ao vivo na Fila.
- `src/inngest/functions/render-approved-post.ts` — o job da aprovação.
  Todo write é guardado por `render_token`: aprovar → desistir → aprovar
  de novo gera token novo, e o run antigo vira no-op em vez de gravar
  arte velha por cima da nova.
- `publish-scheduled-posts` só pega post com `render_status='ready'` —
  sem isso um agendado publicaria com `image_url` nulo na janela entre
  aprovar e a arte existir.
- Tela Prontos mostra "montando a arte" (com polling de 3s), trava
  baixar/postar nessa janela e oferece "tentar de novo" em `error`
  (`retryRender`).
- Voltar pra fila (`cancelSchedule`/`revertApproval`) zera
  `render_status`/`render_spec`/`render_token` — a arte descongela e o
  token nulo mata qualquer render ainda em voo.

**Estado:** `tsc`, `eslint` e build de produção limpos; **317 testes
verdes** (3 novos cobrindo o schema da 040).

### 0-B.1 Resync de layout aposentado (migration 041)

Consequência direta do modelo novo: `resync-layout-preset` re-renderizava
em massa a arte dos posts **pendentes**, e post pendente não tem mais arte
— quem desenha é o preview ao vivo. O job virou trabalho morto que ainda
gastava render e gravava `image_url` em post de fila. Removidos:

- o job `resync-layout-preset.ts` e os três disparos em Ajustes
  (`saveLayoutPreset`, `saveSinglePostStyle`, `saveTemplateSelection`);
- os três resyncs SÍNCRONOS que viviam dentro de `actions.ts` pelo mesmo
  motivo (`resyncChipOnPendingPosts`, `resyncCarouselOnPendingPosts`,
  `resyncIdentityOnUnmodifiedPendingPosts`) — salvar perfil, identidade
  visual ou marca não re-renderiza mais nada: o preview já mostra o
  Brand Kit atual no próximo load;
- o orbe "Aplicando layout" da Fila e o polling que dependia dele;
- `posts.rerender_status` (migration `041_drop_rerender_status.sql`) —
  sinal de UI transitório, sem conteúdo;
- `scripts/test-resync.ts`.

Efeito prático: trocar layout/cor/template em Ajustes passou de "job em
background de minutos, com spinner" pra instantâneo.

### 0-B.2 Pendências desta sessão
- [x] **Migration 040 aplicada no Supabase em 28/07** (conferido via
      PostgREST: colunas presentes e backfill correto — 0 posts fora da
      fila sem `render_status='ready'`).
- [x] **Inngest re-sincronizada** depois do deploy do commit `2d6a9f1`
      (`curl -X PUT .../api/inngest` → `Successfully registered`). Repetir
      a cada deploy que adicione/remova função enquanto não houver
      integração Vercel↔Inngest (ver §0-A.6) — o deploy da 041, que
      REMOVE o `resync-layout-preset`, precisa do mesmo PUT.
- [ ] **Aplicar a migration 041 no Supabase** — só dropa
      `posts.rerender_status`. Não é pré-requisito do deploy: o código já
      não lê nem escreve a coluna.
- [ ] Verificar em produção com a conta real: aprovar um post de cada
      formato (single, carrossel, Reels, vídeo feed) e conferir
      `render_status='ready'` + arte igual ao preview.

> **Correção de §0-A.7 (conferido em 28/07):** o cliente ativo
> (`9618ce4a…`, o do Instagram conectado) **não está mais em
> Pollinations** — hoje é `text_provider=claude` / `image_provider=stock`.
> O bloqueio do 402 vale só pra `GetKoda` (`191a7460…`) e `TesteVIVO`
> (`933d1644…`), que seguem em `pollinations` nos dois campos.

---

## 0-A. Sessão 2026-07-27 — merge na `main`, Sprint C endurecido, produção sincronizada

Sessão curta e cirúrgica: nenhuma feature nova de conteúdo, só fechar as
pontas soltas do Sprint C e alinhar `main`/produção. **247 testes verdes**,
`tsc` e `eslint` limpos, build de produção OK, tudo verificado com a conta
real em produção (não só em teste).

### 0-A.1 `main` virou a linha principal de verdade
- A `main` estava 21 commits ATRÁS da `feat/multi-tenant-brand-kit` (faltavam
  Sprint D D1/D2, Template Studio B14/B15, vídeo feed 4:5, migrations 035-037).
  Merge feito localmente, sem conflito, e empurrado: `4b49b43..da67c55`.
- **Descoberta:** existe integração GitHub↔Vercel ativa — o `git push` na `main`
  disparou deploy de Production sozinho. A sessão anterior tinha concluído o
  contrário (deploy 24/07 parecia manual). Produção agora = `main`.
- Ponto de restauração: tag `restore-pre-merge-2026-07-27` (commit `4b49b43`).

### 0-A.2 Sprint C: o que estava dado como pendente já funcionava
A §4.3.1 dizia que o post agendado nunca publicou. Conferido no banco: **publica
sim**, com `ig_media_id` REAL (não mock) — `18048709571795360` (21/07),
`18109194898803364` (24/07), `17962575269962661` (25/07). O post das 23:48 UTC
que a doc dava como travado publicou depois. Loop do Sprint C fecha ponta a ponta.

⚠️ **Armadilha de diagnóstico (custou uma sessão inteira antes):** `GET
/api/inngest` devolver `{"message":"Unauthorized"}` **é o comportamento normal
em produção** — o SDK valida assinatura no GET e recusa requisição não assinada
(`node_modules/inngest/components/InngestCommHandler.js`, ~linha 985). Isso NÃO
indica falta de sync. O teste que realmente decide: mandar o evento da função
pra `https://inn.gs/e/$INNGEST_EVENT_KEY` e consultar
`https://api.inngest.com/v1/events/<id>/runs` com `Authorization: Bearer
$INNGEST_SIGNING_KEY` — zero runs = função não registrada.

### 0-A.3 Renovação automática do token do Instagram (migration 038)
Bomba-relógio com data marcada: o token de longa duração vale ~60 dias, era
gravado uma vez no OAuth e nunca renovado. O da conta real vence em
**2026-09-19** — depois disso a publicação falharia em silêncio pra sempre
(o job só grava `publish_error` e retenta a cada 5min, sem avisar ninguém).
- `src/lib/token-refresh.ts` — decisão pura: janela de 14 dias, regra das 24h
  de vida mínima exigida pela Meta, token vencido → reconectar. 9 testes.
- `src/inngest/functions/refresh-social-tokens.ts` — cron diário `0 6 * * *` +
  evento manual. Falha de renovação NÃO desconecta (o token atual segue válido);
  grava `last_error` e tenta amanhã, dentro da folga. Vencido → `status='error'`.
- `refreshLongLivedToken` em `instagram-graph.ts`, mock-first como o resto.
- Ajustes filtrava a conexão por `status='connected'`, então uma conexão em
  'error' sumia da tela e voltava ao estado "nunca conectou", sem motivo. Agora
  mostra o aviso com a razão + botão de reconectar.
- **Verificado em produção**: run `Completed`, output
  `{"checked":1,"failed":0,"needReconnect":0,"refreshed":0}` — examinou a conexão
  e decidiu não renovar (faltam 54 dias). Começa a agir por volta de 05/09.

### 0-A.4 Métricas: evento perdido + falha invisível
3 posts publicados com media ID real tinham só 1 linha em `post_metrics`, sem
erro nenhum registrado. Duas causas, ambas corrigidas:
- `publish-scheduled-posts` disparava `inngest.send("post/published")` **sem
  `await` e fora de `step`** — fire-and-forget. Em serverless o processo é
  congelado no `return`, então a promise podia nunca resolver e o
  `collect-insights` nunca rodava. Trocado por `step.sendEvent` (durável).
- `collect-insights` engolia a exceção no `console.error` — falha de coleta era
  invisível no banco, ao contrário de `publish_error`/`video_error`. Agora grava
  `posts.metrics_error` e limpa em coleta bem-sucedida.

### 0-A.5 Migrations — estado real conferido no Supabase
- `035` e `037`: já estavam aplicadas.
- `036`: aplicada (confirmado indiretamente — existem 2 posts com
  `format='video_feed'`, que o CHECK novo é quem permite).
- `038_token_refresh_and_metrics_error.sql`: **aplicada pelo usuário em 27/07**
  (`social_connections.last_refreshed_at/last_error`, `posts.metrics_error`).

### 0-A.6 Pendências que sobraram desta sessão
- [ ] **App Review do Meta** — gargalo pra vender: sem ele só contas cadastradas
      como "Testador do Instagram" conectam, ou seja, nenhum cliente pago. Falta
      construir Política de Privacidade, Termos e página de exclusão de dados
      (o site hoje não tem nenhuma das três), e os links `app.html`/`brand.html`
      do rodapé da landing apontam pra arquivos que não existem em `public/`.
- [ ] **Integração Vercel↔Inngest** (vercel.com/integrations) — sem ela, todo
      deploy que ADICIONE ou REMOVA função Inngest precisa de um `PUT` manual no
      endpoint (foi preciso hoje pra registrar o `refresh-social-tokens`).
      Mudança dentro de função já existente não precisa.
- [ ] **Provider de IA do cliente ativo** — ver §0-A.7.

### 0-A.7 O bloqueio da Pollinations é por cliente, não global
Conferido nos `brand_kits`: o cliente ativo (`9618ce4a…`, o que tem o Instagram
conectado) está com `text_provider=pollinations` e `image_provider=pollinations`
— o provider que passou a exigir pagamento. Outros clientes já estão em `gemini`.
A chave Gemini do `.env.local` foi testada e **funciona** (HTTP 200 em
`gemini-2.5-flash`). Em produção as env vars vêm redigidas como `[SENSITIVE]`
pelo Vercel, então não dá pra conferir por CLI se `GEMINI_API_KEY` tem valor lá.
Saída mais barata: trocar o provider desse cliente pra `gemini` em Ajustes e
garantir a chave em Production — sem isso a fila continua sem posts novos.

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
- [x] **Verificação extra (madrugada, pós-restore):** conferi por que o
  `Last-Modified` do vídeo não tinha mudado depois do resync — era falso
  alarme, o `curl -I` bateu numa cópia em cache do CDN por eu ter
  esquecido o `?v=` de cache-busting que a própria coluna `video_url` já
  carrega. Com o `?v=` certo, `Last-Modified` bate exatamente com o
  horário de conclusão do job — o resync funcionou.
- [x] **Fix pequeno feito na mesma madrugada** (commit `f57b302`): o
  bloco de resync de vídeo só logava falha no console, sem gravar nada
  no banco — diferente do `attach-video`, que sempre grava
  `video_status`/`video_error`. Agora, se o resync de um vídeo falhar,
  `video_error` é atualizado (vídeo antigo continua válido, só fica
  registrado que o último resync deu erro).
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
5. **Por que parei o trabalho autônomo aqui:** revisei o roadmap (seção 4)
   procurando mais itens seguros pra adiantar sozinho. Tudo que resta
   precisa de uma decisão sua ou de credencial externa antes de eu poder
   codar com segurança — não é falta de tarefa, é dependência real:
   - **B9/B13/B14** (overrides de card, seed de presets, editor visual):
     o próprio roadmap já marca como "pro teu retorno" — é trabalho de
     design visual, não dá pra adiantar sem seu olho.
   - **Sprint C** (Graph API): precisa você criar/autorizar o app IG
     Business e me passar client_id/secret — não posso gerar isso sozinho.
   - **Sprint D completo** (Remotion + b-roll + legendas): precisa decisão
     de licença comercial do Remotion + chave de provider de b-roll
     (Pexels/Pixabay) + acesso ao TikTok Content Posting API.
   - **Sprint E** (Viral Radar): precisa escolher/pagar um provider de
     coleta (Apify ou similar).
   - Por isso o trabalho autônomo desta madrugada ficou concentrado em
     **verificar e endurecer** o que já foi construído (ver item de
     `video_error` acima) em vez de começar sprint novo sem seu aval.

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

- **⚠️ Ordem importa:** suba o `npm run dev` PRIMEIRO e o Inngest DEPOIS. O
  `predev` (`scripts/free-ports.mjs`) libera as portas 3000 **e 8288**, então
  reiniciar o dev mata o Inngest dev server junto (ele morre com exit 1 e o
  vídeo/resync fica "processando" pra sempre até você notar).
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

### 4.2b SPRINT B+ — Acabamento @0verlens + Template Studio — ✅ COMPLETO (2026-07-22/23)  📄 [HANDOFF-overlens-template.md](./HANDOFF-overlens-template.md)
Extensão do Carousel Engine: capas/cards com acabamento sofisticado (estilo @0verlens),
**legibilidade adaptativa** ao fundo e **Template Studio** (galeria de modelos + editor
visual). Brief completo + prompt mestre no arquivo linkado acima.
- [x] **B6** — Estender Brand Kit (migration 027): `keywords`, `wordmark`, `font_heading_url`, `brand_mark`, `template_defaults` (reusa `ig_handle` como handle) + tipos `BrandMark`/`TemplateDefaults` + seção "Identidade de rótulo" em Ajustes (`BrandLabelForm`) com **preview ao vivo** + `saveBrandLabel` + teste de schema (pglite). Decisões: **Geist** + editor **server-side**.
- [x] **B7** — Motor de legibilidade adaptativa (`src/lib/legibility.ts`): `contrastRatio` (WCAG), `measureBands` (sharp: L+desvio por faixa), `decideLegibility` (puro: cor/posição/scrim/auto-hide/override), `resolveLegibility`. 13 testes.
- [x] **B8** — Render @0verlens via **SVG+resvg**: `buildCoverSvg` (divisor `———— WORDMARK ————` + headline auto-fit + "DESLIZE PARA VER") + `brandLabelText`/label nos cards por `brand_mark`. **Verificado visualmente**.
- [x] **B9** (2026-07-23) — Overrides manuais por card na fila: `carousel_cards.layout` (migration 035, aplicada) — esconder rótulo de marca / forçar cor do texto só naquele card, controles em `CarouselEditor.tsx` (só aparecem pra superfícies com modelo do Template Studio escolhido). Corrigiu de quebra um bug real: `updateCarouselCard` sempre usava o motor antigo (revertia silenciosamente a escolha de modelo ao editar texto) — agora respeita `template_selection` igual ao gerador. Achado no teste ao vivo: upload usava client de sessão (RLS bloqueava) — trocado pro admin client. Testado ao vivo em produção.
- [x] **B10** — Integrado no `generate-carousel` (card 0 = capa via `isCover`); passa wordmark/handle/keywords/brand_mark; best-effort se 027 ausente.
- [x] **B11** — `templates` (presets sistema + custom por cliente) + `brand_kits.template_selection` (migration 028) + tipos `Template`/`Surface`/`TemplateSpec` + RLS (sistema público, custom por dono). 2 testes RLS.
- [x] **B12** — `renderFromSpec` (`src/lib/template-render.ts`): desenha a spec (anchor/offset/style/bind → SVG), resolve cor auto/accent + legibilidade, wrap, z-order, visible. `template-presets.ts` = cover+card como spec. **Verificado visualmente**: capa por spec == capa hardcode do B8. Testes.
- [x] **B13** (2026-07-22) — 16 presets do sistema semeados (4 por superfície: cover_image/video_cover/carousel_page/carousel_last), variando tratamento de marca (wordmark/@handle+kw/só @handle/sem marca) e posição. `scripts/seed-templates.ts` (idempotente, gera thumbnail real e sobe pro Storage). "Ícone" (logo raster) fica de fora — render ainda não compõe imagens de logo.
- [x] **B14 v1** (2026-07-23) — Editor visual em `/settings/templates/[id]`: "Duplicar e editar" (nunca edita preset do sistema in-place) + painel de campos por elemento (âncora, posição x/y, tamanho, cor, peso, alinhamento, visibilidade) + prévia renderizada no servidor (debounce 500ms, mesmo `renderFromSpec` do post real). **Sem drag-and-drop/canvas interativo ainda** — escopo combinado: versão simples primeiro, evolui depois com feedback de layout. Testado ao vivo: duplicar isola do preset do sistema, salvar persiste, prévia reflete a marca real do cliente.
- [x] **B15** (2026-07-22) — `generate-carousel.ts` usa a spec escolhida (`template_selection`) por superfície quando existe; sem escolha, motor antigo (zero mudança pra quem não optou). `renderTemplateCardPng` ganhou composição de foto de fundo + véu de legibilidade (mesmo motor de `contrast.ts`) — sem isso o Template Studio trocaria fotos por cor sólida. UI de seleção em Ajustes → Modelos.
- **Decisões travadas:** fonte = **Geist** (segue pendente o .ttf pra embutir — os presets atuais usam a fonte da marca via `post_font_family`, não Geist especificamente); editor = **preview server-side** (confirmado, sem divergência editor×render).
- **Migrations aplicadas:** 027, 028, 035 (`carousel_cards.layout`, B9).
- **Decisão de engenharia (autônoma):** o brief pedia Satori; usei o render **SVG+resvg** que já existe e funciona (evita dep nova + risco). Mantido em B12-B15.
- **Falta (não crítico):** drag-and-drop/canvas no editor (B14 v2), "ícone"/logo raster como brand mark, aplicar `template_selection` no post único e vídeo (hoje só carrossel usa B15).
- Depende de: Sprint D (Remotion) para a montagem de vídeo do `video_cover` (aqui só o branding/legenda).

### 4.3 SPRINT C — Graph API (publicação auto + fecha o loop de métricas) — ✅ COMPLETO (2026-07-21)
Implementado em 5 passos (C1-C5), cada um commitado isolado — ver
`git log --oneline` a partir de `6e23b03`. **Mock-first** (mesmo padrão
dos providers de IA/imagem): sem `META_APP_ID`/`META_APP_SECRET` no
ambiente, tudo funciona em mock determinístico ($0, testável sem app do
Meta) — plugar a chave real depois não muda nenhum código.
- [x] **C1** — Schema (`social_connections`, `post_metrics`, `posts.publish_error`),
      cifragem AES-256-GCM (`src/lib/crypto-secrets.ts` — primeiro segredo por
      tenant do projeto), cliente Graph API mock-first (`src/lib/instagram-graph.ts`).
- [x] **C2** — OAuth conectar/desconectar: `/api/instagram/connect` + `/callback`
      (state assinado via HMAC, CSRF sem tabela de sessão nova), seção
      "Publicação automática" em Ajustes.
- [x] **C3** — Botão "🗓 Agendar" na Fila (ao lado de Aprovar), habilitado só com
      IG conectado, modal com datetime-local → `schedulePost` (status='scheduled').
- [x] **C4** — Job `publish-scheduled-posts` (cron 5min): publica single/carrossel/
      vídeo via Graph API, marca 'published' + `ig_media_id`; falha grava só
      `publish_error` (não derruba o status, tenta de novo).
- [x] **C5** — Job `collect-insights` (evento `post/published`, `step.sleep` 24h+72h)
      grava em `post_metrics`. **Gap achado testando:** post agendado sumia da UI
      até publicar — sem visibilidade nem cancelamento. Corrigido junto: aba
      "Agendados" em Prontos (data/hora + cancelar) + badge de alcance em Postados.
- **Tudo verificado AO VIVO** (Playwright, conta real `@joaorodrigues.ia`, modo
  mock): connect→callback→conectado, Agendar→apareceu em Agendados→cancelar
  voltou pra Fila, e um ciclo completo aprovar→agendar→job de publicação→
  status='published'+ig_media_id real (mock) confirmado direto no banco.
- **Pendência real (não é código):** só publica de verdade depois que você
  criar o app no Meta for Developers e me passar `META_APP_ID`/`META_APP_SECRET`
  (+ `SECRETS_ENCRYPTION_KEY`, já gerada localmente em `.env.local` — gere outra
  pra produção). Grátis, mas exige App Review do Meta pra ir além de "Tester".
- **Aceite:** aprovar/agendar → publica sozinho; métricas reais gravadas por post. ✅

#### 4.3.1 Setup real do app Meta — em andamento (2026-07-21, fim de tarde)

**Descobertas importantes durante o setup de verdade (não estavam óbvias na doc do Meta):**
- O Meta não deixa combinar caso de uso "Facebook" + "Instagram" no mesmo
  app — escolhemos **"Instagram com Login do Instagram"** (fluxo 2024+, não
  precisa de Página do Facebook). Isso mudou o código (commit `4a79846`):
  endpoints trocaram de `graph.facebook.com` pra `api.instagram.com`/
  `graph.instagram.com`, sem etapa de buscar Páginas — a conta IG Business
  já vem direto na troca do `code` pelo token.
- Pra conectar a própria conta em modo "Desenvolvimento" (antes do App
  Review), precisa: (1) adicionar a conta como **"Testador do Instagram"**
  em Funções do app → Adicionar pessoas (feito: `joaorodrigues.ia`,
  convite aceito no Instagram) e (2) configurar a **redirect URI** em
  "4. Configurar o login da empresa no Instagram" — **essa etapa exige
  HTTPS**, `http://localhost` não é aceito (diferente do produto antigo
  "Login do Facebook", que permite localhost puro).
- Testamos túnel HTTPS grátis (`localtunnel`/loca.lt) pro localhost —
  caiu sozinho repetidas vezes neste ambiente (rede do sandbox), mesmo
  como processo rastreado. Não é confiável aqui.
- **Solução adotada:** deploy no Vercel (projeto já linkado, `post-pilot-ai`).
  Confirmado com você que só você usa produção — promovido
  `feat/multi-tenant-brand-kit` direto pra produção (`vercel deploy --prod`).
  Alias estável: **`https://post-pilot-ai-seven.vercel.app`**.
  - ⚠️ Cada `vercel deploy` (preview) gera uma URL nova — não dá pra fixar
    redirect URI nela. Por isso fomos de produção (alias fixo).
  - `NEXT_PUBLIC_APP_URL` (Production e Preview) estava **vazio** no
    Vercel — corrigido pra `https://post-pilot-ai-seven.vercel.app`
    (Production) antes do build final, porque `NEXT_PUBLIC_*` é
    embutido em build-time, não dá pra trocar depois sem rebuildar.
  - Env vars adicionadas no Vercel (Production + Preview):
    `META_APP_ID`, `META_APP_SECRET`, `SECRETS_ENCRYPTION_KEY`.
  - Redirect URI final registrada no Meta (3 no total, pode limpar as
    2 primeiras depois):
    `http://localhost:3000/api/instagram/callback`,
    `https://wise-needles-work.loca.lt/api/instagram/callback` (túnel morto,
    pode remover), `https://post-pilot-ai-seven.vercel.app/api/instagram/callback`.

> ✅ **Fechado em 2026-07-27 (ver §0-A.2):** publica de verdade, com
> `ig_media_id` real gravado em 3 posts. O relato abaixo ficou como
> histórico do diagnóstico — a conclusão dele sobre o 401 estava errada.

**Update 2026-07-21/22 (madrugada) — Conectou, mas não publicou:** você
logou em produção e conectou o Instagram de verdade (confirmado no banco:
`social_connections` com `ig_username=joaorodrigues.ia`, `ig_business_account_id`
real, `status=connected`). Agendou um post — não publicou. Investigado sem
mexer em código:
- `posts` do agendamento: `status='scheduled'` ainda, `publish_error=null`,
  `scheduled_for` já **passou** (23:48 UTC, checado ~00:01 UTC) → o job
  `publish-scheduled-posts` **nunca tentou rodar** (se tivesse tentado e
  falhado, `publish_error` teria mensagem; se tivesse publicado, status
  mudaria). Não é bug de credencial/token — é o cron não disparando.
- `GET https://post-pilot-ai-seven.vercel.app/api/inngest` devolve
  `{"message":"Unauthorized"}` — consistente com o app **nunca ter sido
  sincronizado no Inngest Cloud** para esta URL de produção. Isso porque
  o deploy foi promovido manualmente via `vercel deploy --prod` (fora do
  fluxo normal git push → integração Vercel↔Inngest que dispara o sync
  automático).
  > ❌ **Esta leitura estava ERRADA** (corrigido em 2026-07-27, ver §0-A.2):
  > o 401 no GET é o comportamento normal do SDK em produção (exige
  > assinatura), não sinal de falta de sync. Não repita este diagnóstico.
- Env vars conferidas: `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` presentes
  em Production no Vercel, código lê do env padrão (sem hardcode/mock) —
  configuração de código está correta, é puramente falta de sync no
  dashboard.

**Pra continuar quando voltar:**
1. Abrir o dashboard da Inngest (app "postpilot", ambiente Production) →
   conferir se `https://post-pilot-ai-seven.vercel.app/api/inngest` está
   registrado como app. Se não estiver ou estiver com erro: usar
   "Sync new app" / re-sync apontando pra essa URL.
2. Depois do sync, conferir se a function `publish-scheduled-posts`
   aparece com o cron `*/5 * * * *` ativo.
3. Reagendar (ou esperar o próximo tick de 5min num post já agendado)
   e confirmar `posts.status` vira `published` + `ig_media_id` real.
4. Se continuar sem disparar: checar se existe integração Vercel↔Inngest
   instalada (vercel.com/integrations) — se não tiver, considerar
   instalar pra deploys futuros sincronizarem sozinhos (evita repetir
   esse passo manual toda vez que promover via CLI).
5. Se der erro "Invalid redirect_uri" de novo no OAuth: conferir se a
   env var `NEXT_PUBLIC_APP_URL` de Production no Vercel ainda bate
   exatamente com `https://post-pilot-ai-seven.vercel.app`.
6. Depois de confirmar que publica de verdade, considerar: (a) remover
   as redirect URIs de teste (localhost/túnel morto) do Meta, (b) decidir
   se `feat/multi-tenant-brand-kit` promovido em produção fica assim ou
   se quer voltar a produção pro que tinha antes até merge oficial na
   `main` — hoje produção Vercel = esta branch, não a `main`.

Ponto de restauração local criado: git tag
`restore-2026-07-21-inngest-sync-issue` (HEAD limpo, nenhuma mudança de
código nesta investigação).

#### 4.3.2 Resolvido (2026-07-22): sync manual + bug real de publicação
Sync feito via `curl -X PUT .../api/inngest` (registra o app sem precisar do
dashboard). Cron voltou a disparar — mas revelou um bug real, não só falta de
sync: `publishMedia falhou: Media ID is not available`. Causa: a Graph API cria
o container e devolve o id na hora, mas processa a mídia (download/transcode)
de forma assíncrona — publicar antes de `status_code=FINISHED` falha. Corrigido
em `src/lib/instagram-graph.ts` (`getContainerStatus`) +
`publish-scheduled-posts.ts` (`waitForContainerReady`, polling antes de
publicar — single/vídeo/carrossel, incluindo cada item do carrossel).
**Confirmado em produção**: post real publicado, `ig_media_id` gravado. A cada
deploy novo (hash do endpoint muda) é preciso re-sincronizar com o mesmo `curl
-X PUT`.

#### 4.3.3 App Review do Meta — NÃO INICIADO (gargalo comercial, 2026-07-27)

Enquanto o app do Meta estiver em modo Desenvolvimento, **só contas adicionadas
como "Testador do Instagram" conseguem conectar** — ou seja, nenhum cliente
pagante consegue ligar o Instagram dele. O fluxo manual (gerar post + baixar
arte + copiar legenda) funciona pra qualquer um e não depende disto.

Escopos pedidos hoje (`src/app/api/instagram/connect/route.ts`), todos exigindo
Advanced Access via App Review: `instagram_business_basic`,
`instagram_business_content_publish`, `instagram_business_manage_insights`.

O que falta, separado por quem consegue fazer:

**Depende de código (dá pra construir aqui):**
- [ ] Página de **Política de Privacidade** pública — o Meta não aceita a
      submissão sem URL válida. Hoje o site não tem: `src/app/` só tem
      `fila/`, `login/`, `pricing/`, `ready/`, `settings/`, e a raiz é servida
      de `public/index.html`.
- [ ] Página de **Termos de Uso** — exigida pra app comercial.
- [ ] **Exclusão de dados do usuário** — o Meta pede uma das duas: URL de
      instruções ou callback de deleção. Não existe nenhuma.
- [ ] Consertar os links quebrados do rodapé da landing: `app.html` e
      `brand.html` não existem em `public/` (o revisor do Meta navega o site).

**Depende do usuário (conta Meta, não dá pra automatizar):**
- [ ] Preencher ícone, categoria e descrição do app no painel.
- [ ] **Verificação de negócio** (Business Verification) — costuma exigir
      documento/CNPJ; é o passo mais lento.
- [ ] **Screencast** demonstrando cada uma das 3 permissões em uso, do login
      até publicar, com conta de teste.
- [ ] Justificativa escrita por permissão (por que o app precisa de cada uma).

### 4.4 SPRINT D — Video Engine (clipes reais, não slideshow)
> ⚠️ **Update 2026-07-21 (ver seção 0.4):** um MVP mais simples já foi
> construído fora de ordem (pedido pontual do usuário) — upload manual +
> ffmpeg overlay (wordmark/título, motor de contraste) em quadro Reels
> 9:16. NÃO tem b-roll automático, NÃO tem legendas queimadas, NÃO usa
> Remotion, NÃO publica (fica na fila pra aprovação manual, igual
> foto/carrossel). O que falta abaixo continua de pé.
- [x] **D1** (2026-07-23) — Roteiro (`src/lib/ai/video-script.ts`, `generateVideoScript`): mesmo padrão multi-provider de carousel.ts (claude/gemini/pollinations, mock em $0). Contrato: hook (0-3s) + 2-4 beats com duração + CTA, validado contra a janela de duração da rede (Reels 7-15s, TikTok 15-34s). 14 testes.
- [x] **D2** (2026-07-23) — Montagem (`src/lib/video-assembly.ts` + `src/lib/stock-videos.ts`): **decisão — sem Remotion** (usuário pediu só ferramentas grátis; licença comercial do Remotion era a pendência travada aqui). B-roll real via **Pexels Video** (mesma key de stock-photos.ts, testado contra a API real) + montagem via **ffmpeg** (já no projeto): `buildScriptTimeline` deriva hook/beats/cta em janelas de tempo, `assembleScriptVideo` normaliza+concatena 1 clipe por segmento e queima a legenda de cada um só na sua janela (`overlay` + `enable=between(t,start,end)`; legenda = PNG via SVG+resvg, não ffmpeg drawtext — evita depender de .ttf). Testado ponta a ponta com ffmpeg real (clipes sintéticos): mp4 válido, transições corretas, acentos PT-BR ok, conferido visualmente. Logo/chip de marca fica pra depois (escopo desta v1 é b-roll+legenda). 9 testes.
- [ ] **Falta pra fechar D1+D2**: decidir onde persistir o roteiro/vídeo montado e quando disparar (job Inngest + campo novo ou reuso de `posts.video_url`?) — D1/D2 hoje são módulos isolados testados, ainda não ligados a nenhum pipeline/fila.
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
