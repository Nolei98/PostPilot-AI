# PostPilot 2.0 — Progresso e Roadmap de Execução

> Documento vivo. Atualize os checkboxes conforme avança. Companheiro
> técnico do plano estratégico e do handoff v2. Ordem importa: as
> tarefas têm dependência.

**Branch de trabalho:** `main`. Desde 2026-07-27 a `feat/multi-tenant-brand-kit` está inteiramente mergeada na `main` e **produção Vercel roda a `main`** (o push dispara deploy automático — ver §0-A). A branch antiga não recebe mais commits.
**Última atualização:** 2026-07-30 — três presets de NICHO (confeitaria, saúde, advocacia), painel visual `docs/layouts.html` gerado pelos builders reais, folga wordmark→título unificada como razão, véu escolhido valendo no render final, trava de salvamento em Ajustes e conserto da conversão pra carrossel — ver §0-E. **Nenhuma migration nova.** Antes: 2026-07-29 (tarde) — verificação em produção do carrossel com vídeo (aprovou certo; dois defeitos no caminho de VOLTA, corrigidos), rótulo do topo editável por post (046), pausa da criação automática (047) e aprovar/descartar em lote na fila — ver §0-D. **Migrations 046 e 047 aplicadas.** Antes, no mesmo dia: controle por POST em cima do render-on-approval: fundo (042), fundo por card, cor do wordmark (043), troca de formato único⇄carrossel (044), vídeo dentro de carrossel + código curto do post (045), card da fila reorganizado, além das correções do motor de vídeo (upload direto pro Storage, encode `veryfast`, vídeo no lugar certo) — ver §0-C. **Migrations 041–045 aplicadas no Supabase em 29/07** (`setval` da 045 retornou 582 → ~581 posts numerados). Antes: 2026-07-28 — render-on-approval (migration 040): a arte deixa de ser montada na geração e passa a ser montada na aprovação, com preview ao vivo na Fila (ver §0-B). Antes: 2026-07-27 — merge na `main` + Sprint C endurecido (renovação automática do token do Instagram, métricas com evento durável — ver §0-A); **bloqueio ativo:** geração de posts parada desde ~20/07 porque a Pollinations.ai (provider grátis do cliente, texto+imagem) passou a exigir pollen pago pra requests multi-mensagem (o que o app usa) — decisão pendente do usuário (pagar top-up, trocar provider, ou deixar parado). Nada quebrado no código; diagnóstico completo abaixo.

### Bloqueio ENCERRADO em 29/07: Pollinations.ai exigia pagamento pra requests multi-mensagem
> ✅ Resolvido trocando os dois clientes afetados pra `gemini` (ver §0-C.6).
> Nenhum cliente em `pollinations` hoje; `GEMINI_API_KEY` responde 200. O
> diagnóstico fica registrado abaixo porque explica o custo do silêncio —
> foi ele que motivou o aviso de piloto pausado na Fila (047).

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

## 0-F. Sessão 2026-07-30 — validação de produção e medição

Sessão de conferência: nada de feature nova, só descobrir o que já é
verdade em produção antes de decidir o próximo passo do MVP.

### 0-F.1 Estado conferido no Postgres de produção (30/07)

- **`auto_generate=false` nos 6 clientes** — a pausa (047) já está ligada
  em todo mundo; a pendência de §0-D.5 está fechada.
- **Nenhum cliente em `pollinations`** — confirma §0-C.6.
- Posts: 114 `pending_approval`, 32 `approved`, 38 `published`, 400
  `discarded`.
- **Render sem defeito**: os 70 posts aprovados/publicados estão todos em
  `render_status='ready'`, nenhum em `error`. O render-on-approval (040)
  está de pé em produção.
- **14 cards órfãos apagados** (`#0087` e `#0028`) — ver §0-E.7.

### 0-F.2 Estado conferido no domínio de produção

`https://post-pilot-ai-seven.vercel.app`:

- `/`, `/login` → 200; `/fila`, `/ready`, `/settings` → 307 (protegidas).
- **`/privacidade`, `/termos` e `/exclusao-de-dados` → 200** — o primeiro
  item do checklist de App Review (§5 do dossiê) está cumprido.
- A landing tem CTA ("Comece grátis"), então o item "landing mínima com
  CTA" do `LANCAMENTO.md` está cumprido — `/pricing` continua atrás do
  login, o que a regra permite ("ou").
- `META_APP_ID` e `META_APP_SECRET` existem em Production.

### 0-F.3 Provider incoerente no kit "João Rodrigues"

O Brand Kit do usuário está em `text_provider='claude'` +
`image_provider='stock'`, mas **não existe `ANTHROPIC_API_KEY` nem
`FAL_KEY` em Production** (`stock` usa Unsplash/Pexels, essas duas keys
existem — o problema é só o texto). Não estourou ainda porque
`auto_generate` está desligado em todos os clientes. Antes de religar:
ou trocar o kit pra `gemini`, ou colocar a chave da Anthropic na Vercel.
É decisão de custo, não de código.

### 0-F.4 Vercel Analytics

Faltava a medição inteira — sem ela a "métrica dos primeiros 7 dias" do
`LANCAMENTO.md` não existe. O pacote `@vercel/analytics` não instala
neste projeto: ele declara peer OPCIONAL de `@sveltejs/kit`, que puxa
`vite@8`, e o `vitest@2` daqui fixa `vite@5` — `ERESOLVE`. Resolver com
`--legacy-peer-deps` mudaria a resolução do lockfile inteiro por causa de
uma tag `<script>`.

O que o pacote faz é injetar `/_vercel/insights/script.js`. Isso foi pro
`layout.tsx` como `<Script strategy="afterInteractive">`, atrás de
`VERCEL_ENV === 'production'` (fora da Vercel o caminho dá 404 e sujaria
o console do dev). **Só mede depois de ligar Analytics no painel do
projeto** — o script sozinho não habilita nada.

---

## 0-E. Sessão 2026-07-29/30 — presets de nicho, painel visual e o "salvei e não mudou nada"

Sessão sem migration nenhuma: tudo aqui é arte e percepção de
salvamento. Três frentes que nasceram juntas — os cinco presets eram
todos de "criador de conteúdo genérico", o painel de referência visual
era um documento em texto, e trocar layout em Ajustes parecia não
funcionar.

### 0-E.1 Três presets de NICHO (F, G, H)

Os cinco presets existentes se separam por ESTILO editorial (noir,
brutalista, luxo, suíço, pop). Nenhum se separa por RAMO — e o cliente
que vende bolo não se reconhece em nenhum deles. Os três novos partem do
que o público do ramo associa a confiança:

- **Doce Vitrine** (`doce-vitrine`, confeitaria/alimentação) — borda
  ondulada (a forminha/bandeja rendada), selo redondo, confeitos soltos.
  DM Serif Display no título + **Varela Round** nos rótulos: é o rótulo
  arredondado, não a fonte do título, que separa esta peça do Serif Luxe
  (mesma serifa, outra intenção).
- **Clínica Clara** (`clinica-clara`, saúde) — o oposto da vitrine:
  identidade pelo RESPIRO (margem larga, coluna única), mais três sinais
  discretos — cruz fina no topo, traço de batimento (ECG) entre marca e
  título, cápsula de contorno nos rótulos. **Sora**, a única fonte já
  embutida que nenhum preset usava; a mono do Swiss leria como aviso
  técnico, não como cuidado.
- **Tribuna** (`tribuna`, advocacia) — o que o público associa a direito
  é ORDEM, não ornamento: moldura fina por dentro da borda, **régua
  dupla** (papelaria jurídica), rótulo `ART. 01` em retângulo de cantos
  VIVOS (arredondar amoleceria o preset inteiro). Mesma serifa do Serif
  Luxe; o que muda é a estrutura — lá centralizado e contido, aqui à
  esquerda, emoldurado e numerado.

Todos entregam o mesmo contrato `{svg, blurBandTop}` dos demais, então
são drop-in: `LayoutPreset` ganhou os três valores, `PRESET_DISPLAY_FONT`
e `PRESET_VIDEO_IDENTITY` ganharam as entradas (eyebrow e swipe hint
próprios), e `BrandRowKind` ganhou `scallop` | `pulse` | `double-rule`.
**Não precisou de migration:** `brand_kits.layout_preset` é `text` sem
CHECK (030), e Ajustes lista os presets a partir de `PREVIEW_LAYOUTS` —
os três aparecem no seletor sozinhos.

### 0-E.2 `docs/layouts.html` — painel visual gerado pelo código

`docs/layouts-spec.md` descrevia a arte em prosa pra alimentar uma IA de
design. Descrição de geometria em texto envelhece calada: a spec dizia um
número, o código dizia outro. Agora `scripts/build-layouts-html.ts`
desenha os **8 presets × 6 formatos** com os MESMOS builders do render
(`layout-preview.ts`, `image.ts`, `cover-svg.ts`) e as fontes reais
embutidas. Não é mockup — é o render.

Regenerar com `npx tsx scripts/build-layouts-html.ts` sempre que a
geometria mudar (a spec agora diz isso explicitamente).

### 0-E.3 Folga wordmark → título: uma razão, não quatro números

Cada formato tinha o seu gap entre a assinatura da marca e a primeira
linha do título: Reels 50, feed 4:5 36, capa com vídeo 58, capa estática
130. O mesmo carrossel respirava diferente em cada peça.

`wordmarkToHeadlineGap()` (`render-shared.ts`) unifica em **1,56 × o
corpo do título** — 162px num título de 104, 134px num de 86, 109px num
de 70. A medida saiu do Reels (a que já estava visualmente certa) e foi
propagada como RAZÃO de propósito: copiar os pixels crus daria metade da
folga ótica numa capa, porque o texto é posicionado pela BASELINE e letra
grande "come" o vão. Vale onde existe assinatura acima do título
(Editorial Noir, Reels, vídeo no feed 4:5, capa com vídeo); os quatro
presets alternativos usam régua/barra/pílula e mantêm a folga antiga —
não há assinatura pra evitar.

Junto: o gap título → moldura do vídeo no card interior subiu de **40
para 72** (o vídeo parecia grudado embaixo da fonte). `card-video-layout.test.ts`
existe pra garantir que aumentar essa folga não empurre o corpo por cima
do rodapé no pior caso.

### 0-E.4 O véu escolhido (048) só valia na prévia

`composeFromSpec` compunha **sempre em `auto`**: quem escolhia véu `on`
ou `off` na fila via a prévia obedecer e a arte aprovada sair diferente —
duas verdades sobre a mesma arte, exatamente o que o §0-B tinha ido
consertar. `cover-veil.render.test.ts` confere por PIXEL, medindo a faixa
onde o texto senta, com render real (sharp + resvg).

Também nesta frente: `buildFeedVideoBlurBgOverlaySvg` passou a ter
overlay próprio (a fila desenhava o feed-blur com o overlay do 4:5
comum) e `buildCardVideoOverlayPhotoBg` compõe a capa com vídeo sobre
FOTO respeitando o piso de escurecimento (`VIDEO_SCRIM_FLOOR`).

### 0-E.5 "Preciso salvar duas ou três vezes"

Relato do usuário: trocar o layout em Ajustes e não ver a mudança na
fila. Eram **três** coisas somadas, nenhuma delas o write:

1. **`revalidatePath("/")` em ~20 actions** — `/` é a landing estática. A
   fila (`/fila`) nunca era invalidada, então o RSC servido depois do
   save era o cache velho. Todas passaram a revalidar `QUEUE_PATH`.
2. **Botão destravava antes da árvore nova chegar** — `SaveLockForm` só
   solta quando a action confirmou no banco **e** o `router.refresh()`
   terminou de trocar a árvore (a transição do React é quem diz quando).
   `TemplatePickButton` faz o mesmo na miniatura de modelo — dava pra
   clicar em três modelos seguidos sem saber qual venceu. `BrandPreloader`
   (portal pro `<body>`, porque `fixed` é ancorado por ancestral com
   transform e os cards entram com `animate-fade-up`) trava a TELA quando
   o que mudou é a fila inteira.
3. **A aba voltava pro início** — `SectionTabs` guardava a aba ativa só
   em estado local; o `router.refresh()` remontava a árvore pelo
   `loading.tsx` e quem estava em "Layouts" era jogado pra "Perfil" logo
   depois de salvar, o que parecia recarregamento da página. Agora a aba
   vive em `sessionStorage` (lida no `useEffect`, não no primeiro render —
   ler antes daria hydration mismatch).

Os textos de ajuda em Ajustes também estavam mentindo desde o §0-B:
prometiam "salvar re-renderiza na hora os posts já na fila". Não
re-renderiza mais nada — a arte é montada na aprovação.

### 0-E.6 Conversão pra carrossel batendo na unique

`#0028` quebrava com `duplicate key value violates unique constraint
"carousel_cards_post_id_idx_key"`. Causa: post que NÃO é carrossel com
linhas sobrando em `carousel_cards` — resto de conversão anterior, de
geração que virou post único, ou de job morto no meio. `convert-post-format`
ganhou o step **`clear-old-cards`** antes do insert, o que também torna o
job idempotente em retry (o step pode rodar duas vezes depois de falha no
meio).

`scripts/repair-orphan-cards.ts` limpa o que JÁ está no banco e serve de
diagnóstico:

```
npx tsx scripts/repair-orphan-cards.ts            # só lista
npx tsx scripts/repair-orphan-cards.ts --clean    # apaga os órfãos
npx tsx scripts/repair-orphan-cards.ts --discard 28
```

**Estado:** `tsc`, `eslint` e build limpos; **415 testes verdes** (+68
desde §0-D).

### 0-E.7 Pendências

> ⏸ **Os três presets de nicho estão em STANDBY (decisão do usuário,
> 2026-07-30).** O código está pronto e commitado; o que falta é decidir
> COMO tratá-los — preset de Brand Kit como os outros 5, pacote por ramo,
> nicho no onboarding, ou catálogo separado. Os 5 originais se separam por
> estilo editorial; estes se separam por RAMO, que é outro eixo e talvez
> não caiba no mesmo seletor. **Nada de trabalho novo neles até isso ser
> decidido.** Hoje eles APARECEM no seletor de Ajustes, porque a lista sai
> de `PREVIEW_LAYOUTS` (`src/lib/layout-preview.ts`) — se o standby tiver
> que ser invisível pro cliente, é ali que se filtra (uma linha).

- [x] **`repair-orphan-cards.ts --clean` rodado em produção (30/07)** —
      14 cards órfãos apagados, dos posts `#0087` e `#0028` (ambos
      `video_feed`, ambos ainda na fila). Reconferido: nenhum órfão
      restante.
- [ ] **Decidir o destino dos presets de nicho** (ver nota acima) — e só
      então conferir em arte final: aprovar um carrossel em cada, com foto
      de fundo e sem.
- [ ] Regenerar `docs/layouts.html` na próxima mudança de geometria — a
      spec depende dele pra não voltar a envelhecer calada.

---

## 0-D. Sessão 2026-07-29 (tarde) — verificação em produção, rótulo editável, pausa do piloto e ações em lote

Sessão nascida da verificação de §0-C.6: aprovar um carrossel COM vídeo
funcionou (a arte saiu certa), e os dois defeitos que apareceram no
caminho de volta viraram o trabalho abaixo. Migrations **046** e **047**,
já aplicadas pelo usuário.

### 0-D.1 Vídeo composto voltava pra fila e era desenhado duas vezes

Post aprovado que volta pra fila (`revertApproval`/`cancelSchedule`)
zerava `render_status`/`render_spec`/`render_token` — mas não o VÍDEO. O
composto (`carousel_cards.video_url` / `posts.video_url`) já traz a
página inteira queimada: fundo, texto e moldura. A Fila então encaixava
essa página dentro da moldura 16:9 que o preview desenha ao vivo — a
página inteira aparecia espremida dentro do buraco do vídeo.

Corrigido nas duas pontas:
- `post-preview.ts` passa a usar **sempre o arquivo BRUTO**
  (`{postId}-video-source.mp4` / `{postId}-card-{idx}-video-source.mp4`).
  O preview desenha o overlay ao vivo, então usar o composto era dupla
  composição por definição, não um caso de borda. Isso também cura
  sozinho os posts que já estavam nesse estado na fila.
- `thawRenderedVideo` (actions.ts) descongela o vídeo junto com a arte ao
  voltar pra fila: `video_url` a nulo e, no post de vídeo, o
  `video_poster_url` de volta pro pôster CRU. Seguro porque o arquivo
  fonte fica no Storage — a próxima aprovação recompõe do zero com a spec
  nova.

### 0-D.2 Rótulo do topo editável por post (migration 046)

A meta-linha do topo da capa ("Nº01 · ENSAIO", "01 / ENSAIO", "Nº 01",
conforme o preset) era CONSTANTE do layout: os builders já aceitavam
`opts.eyebrow`, mas nenhum caminho do app passava valor. Era a única
linha de texto da arte que o cliente não conseguia mexer — justamente
onde vai edição/seção ("EDIÇÃO 12", "GUIA RÁPIDO").

`posts.eyebrow` (NULL = padrão do preset) entra no `CardBrand` via
`applyEyebrow`, no MESMO ponto de fundo (042) e cor da marca (043), então
vale no preview ao vivo e no render final pelo mesmo caminho. Consumido
pelos quatro layouts alternativos (capa do carrossel e página 1 do post
único) e pela capa com vídeo (`cardVideoLayoutParts`, onde sobe em caixa
alta como o do preset). Campo no painel "Ajustes avançados", salvando no
blur/Enter — não a cada tecla, senão cada letra redesenharia o preview.

### 0-D.3 Pausa da criação automática (migration 047)

`brand_kits.auto_generate` (default **true**). Desligado, o `scan-news`
continua varrendo, inserindo e triando — só não dispara
`generate-post`/`generate-carousel` pras candidatas daquele cliente. A
pausa vive no Brand Kit e não no `enabled` das fontes de propósito:
desligar fonte mataria a coleta junto e perderia o radar.

O contador de `candidates` da rodada continua contando as pausadas (são
notícias que PASSARAM na triagem; o que mudou foi o disparo). Controle em
Ajustes → "Criar posts automaticamente", e a Fila mostra um aviso quando
está pausado — fila parada sem explicação já custou dias no bloqueio de
provider de julho.

### 0-D.4 Aprovar e descartar em lote

A fila era limpa um card por vez, com animação de saída a cada um —
inviável depois de alguns dias de varredura. `QueueSelection` (contexto
client) envolve a grade, o `PostCard` desenha a caixinha quando está
dentro dele, e a barra sticky do topo aparece só com algo selecionado:
selecionar todos, aprovar N, descartar N (com segundo clique de
confirmação) e cancelar.

- `discardPosts` — um UPDATE só com `in`: descarte não tem efeito
  colateral.
- `approvePosts` — status num UPDATE só (com `eq('status','pending_approval')`,
  então só aprova o que estava na fila) e `requestRender` post a post,
  porque cada um precisa do próprio `render_token` e do próprio job.
- Teto de **50 posts por lote**: aprovar enfileira um render por post, e
  um "selecionar todos" numa fila de centenas dispararia tudo de uma vez.

**Estado:** `tsc`, `eslint` e build de produção limpos; **347 testes
verdes** (+11 nesta sessão: rótulo, preview sempre bruto, e os que já
existiam).

### 0-D.5 Pendências

- [x] **Deploy de produção no ar** (push `870f45f..777b3d3`, build Ready)
      e **`PUT` em `/api/inngest` feito em 29/07** →
      `{"message":"Successfully registered","modified":true}` — o
      `modified:true` confirma que a remoção do `resync-layout-preset`
      (041) entrou na definição do app.
- [x] **Migrations 041–047 conferidas no Postgres de produção** via
      PostgREST: `bg_mode/bg_color/mark_mode/mark_color/ref/eyebrow` em
      `posts`, `auto_generate` em `brand_kits`, e `posts.rerender_status`
      já respondendo `42703 column does not exist`.
- [ ] Verificar VISUALMENTE em produção o resto de §0-C.6 (fundo custom
      por post e por card, wordmark em `title`, conversão
      único⇄carrossel) — o carrossel com vídeo já foi conferido. Estado
      do banco em 29/07: 148 pendentes, 49 carrosséis, e as features
      novas ainda sem uso real (1 post com fundo != marca, 0 com wordmark
      fora de `accent`, 0 com rótulo próprio).
- [ ] **Ligar a pausa (047) de fato**: os 6 clientes estão
      `auto_generate=true` (o default da migration). Desmarcar em Ajustes
      → "Criar posts automaticamente" no cliente ativo.
- [ ] Se a pausa (047) ficar ligada por muito tempo, decidir o que fazer
      com as candidatas acumuladas: hoje elas ficam marcadas e NÃO são
      geradas retroativamente ao religar.

---

## 0-C. Sessão 2026-07-28/29 — o post ganha decisões próprias (migrations 042–045)

O render-on-approval (§0-B) tirou a arte da geração. Isso abriu espaço
pro passo seguinte: se nada foi renderizado ainda, o cliente pode decidir
**por post** o que antes era decidido uma vez só, pro cliente inteiro, em
Ajustes. Cinco decisões novas, todas valendo no preview ao vivo E no
render final pelo MESMO caminho — nunca duas verdades sobre a mesma arte.

### 0-C.1 Fundo por post e por card (migrations 042 + `layout` jsonb)

`posts.bg_mode` (`brand | light | dark | custom`) + `posts.bg_color`,
aplicados em `resolveBackground` — por isso valem de uma vez pros cinco
presets e todos os formatos (carrossel, post único, vídeo feed, card de
vídeo). A cor do TEXTO **não** é gravada: sai da luminância do fundo
escolhido (`pickTheme`/`textColorForTheme`). Guardar as duas deixaria
montar arte ilegível (texto branco em fundo branco), e o sistema já sabe
decidir sozinho.

Fundo por CARD sobrepõe o do post, dentro do jsonb `layout` do card
(junto de `showLabel`/`textColor`/`imagePosition`) — **sem coluna nova**.
Uma página escura no meio de um carrossel claro é decisão de ritmo, não
de identidade. "Do post" (padrão) herda; claro, escuro e cor livre
sobrepõem. Mesma função (`applyBackground`) nos dois lados, inclusive no
card com vídeo.

Junto veio uma correção que vale pro app inteiro: o `<select>` nativo
abria com popup CLARO do sistema enquanto as `<option>` herdavam o texto
quase branco da página — ilegível. Faltava `color-scheme: dark` no
`:root` (mais regra explícita de background/cor nas `<option>` pro
Firefox). Corrige TODOS os selects, não só o de "Posição da imagem".

### 0-C.2 Cor do wordmark por post (migration 043 + `boostAccent`)

O wordmark (`——— MARCA® ———` da capa e a assinatura de marca dos
overlays de vídeo) sempre saía na cor de REALCE do Brand Kit. Em fundo
claro, ou com realce muito saturado, ele briga com o título em vez de
acompanhá-lo. Agora: `posts.mark_mode` (`accent | title | custom`) +
`posts.mark_color`, entrando no `CardBrand` como `markColor`.

`title` é resolvido **depois** do fundo, de propósito: se o fundo do post
(042) virou claro, o título ficou escuro, e a marca precisa ir junto —
resolver antes deixaria a marca na cor do título anterior.

E o "Realce" passou a realçar de verdade: a cor de realce é escolhida
contra o fundo padrão do kit, então com fundo trocado ela some (magenta
dá 6.6:1 no escuro do kit, mas 2.97:1 sobre branco — e o wordmark tem
26px em 1080, entre dois filetes). `boostAccent` empurra a cor até bater
**4.5:1** contra o fundo resolvido, de 10% em 10% rumo ao branco/preto,
mantendo o matiz — verde continua verde — e devolve intacta a cor que já
contrasta, então marca bem escolhida não é alterada. Meta de texto
(4.5:1), não de texto grande (3:1): a 3:1 o wordmark ainda saía apagado
no tamanho em que é desenhado. Os 3 testes que afirmavam "`accent` não
mexe em nada" foram reescritos — esse contrato mudou de propósito.

### 0-C.3 Troca de formato na fila (migration 044)

O formato vem do `default_format` do Brand Kit, escolhido ANTES de o
cliente ver qualquer coisa. Agora ele corrige na fila:
- **único → carrossel** gera a estrutura dos cards com a MESMA função do
  `generate-carousel` (não uma versão pobre) e a capa herda a imagem base
  que ele já aprovou visualmente;
- **carrossel → único** não gasta IA nenhuma — promove a capa a imagem
  base.

Barato justamente porque nada foi renderizado ainda (040). `convert_status`
trava os botões enquanto roda.

### 0-C.4 Card da fila minimalista, vídeo em carrossel e código do post (migration 045)

A fila é onde o cliente OLHA e DECIDE — mas o card tinha 8 controles
empilhados antes da prévia (prompt, upload, 4 chips de fundo, 3 de
wordmark, 3 botões de vídeo em texto corrido), e a plataforma vai ser
usada por gente que não é de tecnologia. Agora a fila mostra só decisão:
três ícones de enquadramento de vídeo (Reels 9:16, feed 4:5, feed com
fundo borrado, com o atual marcado e nome em `title`/`aria`), troca de
formato, e **"Ajustes avançados"** — painel com prompt, imagem manual,
fundo e cor da marca. Em post de vídeo o painel deixa de mostrar "prompt
de imagem" (não descreve nada do que se vê num Reels) e explica o que
gravar.

**Vídeo dentro de carrossel:** não havia motivo pra bloquear. O vídeo
vira o vídeo de UM card, e quem escolhe onde é o cliente — na capa é
gancho, no miolo explica um ponto. O job copia o arquivo fonte pro
caminho do card escolhido, marca o card como pronto e LIMPA os campos de
vídeo do POST (senão Prontos trataria o carrossel como post de vídeo).
Card com vídeo fica sem foto de fundo: o fundo dele é a cor sólida da
marca com a moldura 16:9 no meio.

**Código curto (migration 045):** o `id` é UUID — serve pro sistema, não
pra pessoa. Quem usa precisa dizer "o post 128 saiu errado" num print ou
no suporte, sem colar um UUID. `posts.ref bigint` com sequência GLOBAL
(dois clientes nunca repetem número, então o código identifica o post
sozinho) + índice único, exibido como `#0128`. O painel avançado ganhou a
seção "Este post" no topo: código, formato atual em português e
contra-capa.

### 0-C.5 Motor de vídeo — correções de produção

Fora das migrations, quatro consertos no caminho de vídeo:
- **vídeo grande voltou a subir** — envio direto pro Storage, sem passar
  pela função serverless (o corpo estourava o teto da função);
- **encode compartilhado em preset `veryfast`**, pra vídeo grande caber
  no tempo/limite da função;
- **vídeo aparece no lugar certo**, no preview e na arte final;
- **preview da fila não toca sozinho** — vídeo fica parado, toca só no
  hover;
- `scripts/` ganhou seeds cobrindo o caso que quebrava o vídeo.

### 0-C.6 Estado e pendências

**Estado:** `tsc`, `eslint` e build de produção limpos; **336 testes
verdes**. Working tree limpa em `870f45f`.

- [x] **Migrations 041, 042, 043, 044 e 045 aplicadas no Supabase em
      29/07.** O `setval` final da 045 retornou **582**, ou seja, ~581
      posts existentes receberam `ref` e a sequência segue a partir daí.
- [ ] **`PUT` manual em `/api/inngest`** depois do deploy da 041 — ela
      REMOVE o `resync-layout-preset`, e sem a integração Vercel↔Inngest
      (§0-A.6) todo deploy que adiciona/remove função exige o registro à
      mão (`curl -X PUT https://<app>/api/inngest`).
- [ ] **Verificar em produção com a conta real** (herdado de §0-B.2, agora
      com mais superfície): aprovar um post de cada formato (single,
      carrossel, Reels, vídeo feed) e conferir `render_status='ready'` +
      arte igual ao preview. Cobrir também o que entrou nesta sessão:
      fundo custom por post e por card, wordmark em `title`, conversão
      único⇄carrossel, e carrossel com vídeo em card do miolo.
- [x] **Bloqueio da Pollinations encerrado em 29/07:** `GetKoda`
      (`191a7460…`) e `TesteVIVO` (`933d1644…`) foram pra `gemini` nos
      DOIS campos, via `scripts/set-client-provider.ts` (Ajustes só edita
      o cliente ATIVO, e trocar vários exigiria alternar de cliente na
      interface um por um). Conferido depois: **nenhum cliente em
      `pollinations`**. `GEMINI_API_KEY` existe em Production na Vercel e
      a chave do `.env.local` responde 200 em `gemini-2.5-flash`.

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
- [x] **Migration 041 aplicada no Supabase em 29/07** (junto de 042–045 —
      ver §0-C.5). Só dropa `posts.rerender_status`; não era pré-requisito
      do deploy, o código já não lia nem escrevia a coluna.
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
      como "Testador do Instagram" conectam, ou seja, nenhum cliente pago.
      **Correção 29/07:** a parte de CÓDIGO já está feita, ao contrário do que
      esta linha dizia — `/privacidade` (165 linhas), `/termos` (122) e
      `/exclusao-de-dados` (74) existem em `src/app/`, e o rodapé da landing
      aponta pras três (não há mais `app.html`/`brand.html` em `public/index.html`).
      O que falta é tudo do lado da conta Meta — ver a lista de §4.3.
- [x] **Integração Vercel↔Inngest — DECIDIDO NÃO FAZER (29/07).** Tentada e
      desfeita de propósito: `vercel integration add inngest/account`
      provisiona uma conta Inngest **nova e vazia** (saiu
      `account-yellow-school`), e conectá-la ao projeto falhou justamente
      porque `INNGEST_SIGNING_KEY` já existe —
      `Failed to connect: This project already has an existing environment
      variable with name INNGEST_SIGNING_KEY (400)`. Pra seguir seria preciso
      APAGAR `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` de Production (as de
      26d atrás, que apontam pra conta que roda hoje) e deixar a integração
      escrever as dela — ou seja, migrar os três crons (`scan-news`,
      `publish-scheduled-posts`, `refresh-social-tokens`) pra outra conta e
      perder o histórico de runs. Não vale o preço pra economizar um `curl`
      por deploy. O recurso foi removido (`vercel integration-resource remove`)
      e as env vars ficaram intactas.
      **Consequência aceita:** todo deploy que ADICIONE ou REMOVA função
      Inngest continua exigindo
      `curl -X PUT https://post-pilot-ai-seven.vercel.app/api/inngest`
      (resposta boa: `{"message":"Successfully registered","modified":true}`).
      Mudança dentro de função já existente não precisa.
      Se um dia valer a pena, o caminho honesto é migrar de conta com
      intenção — não como efeito colateral de instalar uma integração.
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

**Depende de código — FEITO (conferido em 29/07):**
- [x] **Política de Privacidade** — `src/app/privacidade/page.tsx` (165 linhas),
      renderizada por `src/components/LegalPage.tsx`.
- [x] **Termos de Uso** — `src/app/termos/page.tsx` (122 linhas).
- [x] **Exclusão de dados** — `src/app/exclusao-de-dados/page.tsx` (74 linhas);
      é a URL de instruções, a opção mais simples das duas que o Meta aceita.
- [x] **Rodapé da landing** aponta pras três (`/privacidade`, `/termos`,
      `/exclusao-de-dados`); `app.html`/`brand.html` não existem mais em
      `public/index.html`.
- [ ] Conferir as três URLs no domínio de produção antes de submeter — o
      revisor navega o site, e link quebrado reprova sozinho.

> **Dossiê pronto (29/07): `docs/meta-app-review.md`.** Traz a descrição do
> app, a categoria sugerida, as TRÊS justificativas de permissão já
> escritas pra colar no painel, o roteiro do screencast passo a passo (com
> os pontos que costumam reprovar), o que esperar da verificação de
> negócio e o checklist de antes do "Submit". A lista abaixo continua
> valendo — o dossiê é o material pra executá-la.

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
