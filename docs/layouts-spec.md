# PostPilot — Especificação visual dos layouts (Fase 3)

Documento de referência do estado ATUAL dos 5 presets de layout do PostPilot, pra alimentar uma IA de design/organização visual. A ideia: essa IA usa isso pra montar mockups/variações visuais; as alterações aprovadas voltam pra cá e são reimplementadas no código (SVG server-side, sem Figma/Canva no meio).

## Como o sistema funciona (contexto técnico, resumido)

- Cada carrossel/post é uma sequência de **cards 1080×1350px** (proporção 4:5, Instagram).
- Todo card tem 3 papéis possíveis: **capa** (1º), **interior** (miolo), **fechamento** (último — mesmo tratamento visual da capa, sem "deslize").
- O texto é desenhado como SVG puro (sem HTML/CSS) e rasterizado em PNG no servidor — qualquer alteração precisa ser descritível como: fonte, tamanho, posição (x/y), cor, alinhamento.
- **Cores** (fundo, destaque/acento, texto) vêm do Brand Kit de cada cliente — não são fixas do layout. O que É fixo por layout: tipografia, estrutura, alinhamento, decoração.
- **Contraste automático**: se o card tem foto de fundo, o sistema mede a luminância real da área onde o texto vai (não a fonte inteira) e escolhe tema claro/escuro + um overlay (véu escuro ou claro) na intensidade mínima pra o texto ficar legível. Isso é igual em todos os layouts — não faz parte do que precisa ser redesenhado.
- **Elementos que TODOS os layouts compartilham** (não fazem parte da identidade de cada layout, são "peças de sistema"):
  - Chip de perfil (avatar circular + @handle) no canto inferior esquerdo da capa/fechamento.
  - Trilha de 4 ícones (curtir, repostar, compartilhar, salvar) empilhados no canto inferior direito da capa/fechamento.
  - Margem dessas duas peças: 60px da borda.
- **Título do card INTERIOR agora é "nível capa"** (mudança recente, 2026-07-20): antes o headline do miolo tinha um tamanho fixo, bem menor que o da capa. Hoje ele usa o MESMO auto-fit por comprimento que a capa já usava — 3 faixas de tamanho (curto/médio/longo → grande/médio/pequeno), pega o tamanho automaticamente pelo nº de caracteres do texto. O corpo (texto de apoio abaixo do título) escala JUNTO: título grande → corpo grande; título pequeno → corpo mais discreto. Isso vale pros 5 presets. Os números de fonte listados abaixo em "Interior" são as 3 faixas (grande/médio/pequeno), não mais um valor fixo único.

- **Afastamento wordmark → título** (regra única desde 2026-07-29): onde a assinatura da marca (o divisor `——— WORDMARK® ———`, ou a linha de marca de um preset) fica logo ACIMA do título, a distância entre a baseline dela e a da 1ª linha do título é **1,56 × o corpo do título** — ou seja 162px num título de 104, 134px num de 86, 109px num de 70. A medida foi calibrada no Reels e propagada como RAZÃO, não como número fixo: copiar os pixels crus daria metade da folga ótica numa capa, porque o texto é posicionado pela baseline e letra grande "come" o vão. Vale em: capa/fechamento do Editorial Noir, Reels, vídeo no feed 4:5 e capa com vídeo. Onde não há wordmark (os 4 presets alternativos usam régua/barra/pílula na capa), a folga antiga continua valendo — não há assinatura pra evitar. No código: `wordmarkToHeadlineGap()` em `src/lib/render-shared.ts`.
- **Painel visual sincronizado**: `docs/layouts.html` mostra os 5 presets × 6 formatos desenhados pelos MESMOS construtores de SVG do render, com as fontes reais embutidas. Regenerar com `npx tsx scripts/build-layouts-html.ts` sempre que a geometria mudar — é a referência visual desta spec.

## Os 5 presets

1. **Editorial Noir** — padrão, o mais neutro. Fonte da própria marca (a que o usuário escolhe em Ajustes: Inter/Sora/Space Grotesk).
2. **Brutalismo Editorial** — Anton (condensada, pesada) + IBM Plex Mono.
3. **Serif Luxe** — DM Serif Display + IBM Plex Mono. Centralizado, contido.
4. **Swiss Mono** — Inter 800 + IBM Plex Mono. Grid internacional, régua fina.
5. **Pop Creator** — Varela Round (arredondada) + IBM Plex Mono. Pílulas, blob decorativo.

Cada um tem 3 "modos" de card: **capa**, **interior**, **fechamento**. Abaixo, spec por preset.

---

## 1. Editorial Noir (padrão)

**Fontes:** a fonte que o cliente escolheu em Ajustes (Inter, Sora ou Space Grotesk) — é o único preset em que a tipografia NÃO é fixa.

### Capa / Fechamento
- Bloco ancorado no RODAPÉ, alinhamento central.
- Divisor: `——— WORDMARK® ———` (linhas finas dos dois lados do wordmark da marca).
  - **O que centraliza é o conjunto `wordmark + ®`, não só o wordmark**
    (2026-07-31). O `®` é vetor desenhado à parte (`registeredMarkGlyph`),
    e enquanto o texto era ancorado no eixo com o símbolo pendurado à
    direita, sobravam 54px de respiro à esquerda contra 17px à direita.
    Agora o texto desloca meia largura do símbolo pra esquerda e os dois
    vãos ficam em **24px**. Travado por `src/lib/wordmark-divider.test.ts`,
    que mede os vãos no SVG.
- Headline grande abaixo do divisor.
- Corpo de apoio (opcional) abaixo da headline.
- Capa: "Deslize para ver mais" pequeno embaixo.
- **Fechamento** (revisado 2026-07-31): sem a linha de deslize — ela vinha
  de um texto embutido no fallback do `content.cta` e convidava a deslizar
  pra uma página que não existe. O chip de perfil aparece **sempre**, em
  qualquer preset, **centralizado e ancorado logo abaixo do texto** (não
  mais no canto): a altura vem da medida real do bloco
  (`lowestTextBottomFrac`), e cai pro rodapé quando o título é longo demais
  pra caber um chip abaixo dele.

### Fundo dos cards (2026-07-31)
- **Capa:** foto da notícia — a única imagem do carrossel com significado.
- **Demais cards:** fundo GERADO em gradiente nas cores do Brand Kit
  (`card-bg-generated.ts`), semente `postId:idx`, 5 variantes. Antes todos
  buscavam foto de banco com a MESMA consulta do nicho, sem usar o texto do
  card — nove fotos aleatórias sem relação entre si.
- Regra que vale pra todas as variantes: **o terço inferior fica limpo**, é
  onde o texto e o chip sentam.

### Interior
- Rótulo (`@handle · palavras-chave`) no topo OU no rodapé, alternando por paridade do índice do card (ritmo editorial — card par mostra embaixo, ímpar em cima).
- Padding lateral: 96px.
- Headline (mesmo auto-fit da capa, peso 700): **104px** (título ≤36 car.) / **86px** (≤64 car.) / **70px** (mais longo). `line-height` 114/96/80px.
- Corpo (escala com o título): **52px** / **44px** / **38px**, peso 400, opacidade 82%.
- Card `role="cta"`: chip de destaque (retângulo arredondado, cor de acento a 16% opacidade) atrás da headline.
- Número da página: 30px, canto inferior direito, opacidade 50%.

---

## 2. Brutalismo Editorial

**Fontes:** Anton (display, só peso 400 disponível) + IBM Plex Mono (mono, mensagens curtas/legendas).

### Capa / Fechamento
- Meta-linha no TOPO: rótulo esquerda (`Nº01 — ENSAIO`) + `@handle` (ou "OBRIGADO" no fechamento) à direita — ambos mono 26px, régua fina dividindo do resto.
- Bloco ancorado no RODAPÉ, alinhado à ESQUERDA:
  - Régua GROSSA de destaque (120×16px, cor de acento) acima da headline.
  - Headline Anton gigante (tamanho automático: 130px se curta, até 76px se longa), alinhado à esquerda.
  - Subtítulo mono ("Deslize para conhecer" ou corpo do fechamento).

### Interior
- Índice grande no topo-esquerda: **150px** Anton, cor de acento (ex: "03").
- Headline (mesmo auto-fit da capa, Anton): **130px** (título ≤30 car.) / **100px** (≤60 car.) / **76px** (mais longo). `line-height` generoso — 160/123/94px (~1.23× o tamanho da fonte; os acentos do Anton em maiúsculas — ã, ç — são altos e colidem com a linha de cima em folgas normais, então esse layout precisa de mais espaço entre linhas que os outros 4).
- Corpo (escala com o título): **56px** / **46px** / **38px**, fonte da MARCA (não Anton — corpo sempre usa a fonte que o cliente escolheu em Ajustes), opacidade 85%.
- Rodapé: assinatura (`@handle · palavras-chave`) esquerda + paginação (`03/07`) direita, ambos mono 24px.

---

## 3. Serif Luxe

**Fontes:** DM Serif Display (display serifado, só peso 400) + IBM Plex Mono (legendas).

### Capa / Fechamento
- Meta-linha no topo, CENTRALIZADA visualmente (rótulo esquerda + @handle direita, mono 22px), régua fina horizontal abaixo.
- Bloco CENTRALIZADO (texto e régua), ancorado perto do rodapé:
  - Headline serifada grande (96px se curta, até 58px se longa), centralizada.
  - Régua fina curta (92px de largura) ABAIXO da headline (não acima, ao contrário do Brutalismo).
  - Subtítulo mono centralizado.

### Interior
- Numeral do card centralizado no topo: **44px** serif, cor de acento.
- Régua fina curta abaixo do numeral.
- Headline (mesmo auto-fit da capa, serif): **96px** (título ≤30 car.) / **74px** (≤60 car.) / **58px** (mais longo). `line-height` 104/82/66px, centralizada.
- Corpo (escala com o título): **46px** / **40px** / **34px**, fonte da marca, centralizado.
- Rodapé: assinatura esquerda + paginação direita, mono 22px.

---

## 4. Swiss Mono

**Fontes:** Inter peso 800 (headline, grotesco bem grosso) + IBM Plex Mono (legendas/corpo estrutural).

### Capa / Fechamento
- Marcador quadrado (14×14px, cor de acento) + rótulo mono no topo-esquerda (`01 / ENSAIO`), @handle no topo-direita, régua fina horizontal logo abaixo — grid bem demarcado.
- Bloco ancorado no rodapé, alinhado à ESQUERDA:
  - Headline Inter 800 (104px se curta, até 60px se longa), `letter-spacing` levemente negativo (mais denso).
  - Régua fina horizontal ABAIXO da headline.
  - Subtítulo mono.

### Interior
- Marcador quadrado + paginação mono (`03 / 07`) no topo, régua fina abaixo — mesmo grid da capa.
- Headline (mesmo auto-fit da capa, Inter 800): **104px** (título ≤30 car.) / **78px** (≤60 car.) / **60px** (mais longo). `line-height` 100/78/60px, `letter-spacing` -1, alinhada à esquerda.
- Corpo (escala com o título): **50px** / **42px** / **36px**, fonte da marca, opacidade 85%.
- Rodapé: assinatura + paginação, mono 22px.

---

## 5. Pop Creator

**Fontes:** Varela Round (arredondada, só peso 400) + IBM Plex Mono (só pra números/pílulas pequenas).

### Capa / Fechamento
- Pílula de rótulo no topo-esquerda: fundo sólido cor de acento, cantos 100% arredondados, texto mono BOLD escuro dentro (`#0A0A0A`) — contraste sobre a cor viva da pílula. @handle no topo-direita (fora da pílula).
- Blob decorativo: círculo grande (raio 230px) da cor de acento a 16% opacidade, posicionado atrás/ao lado do bloco de texto — único elemento gráfico "extra" entre os 5 layouts.
- Bloco ancorado no rodapé, alinhado à ESQUERDA:
  - Headline Varela Round grande (100px se curta, até 58px se longa).
  - Subtítulo na MESMA fonte redonda (não mono, diferente dos outros 4 layouts), cor de acento, com seta (`Deslize para ver mais →`).

### Interior
- Pílula de índice no topo-esquerda (mesmo estilo da capa: fundo de acento, texto mono bold escuro).
- Headline (mesmo auto-fit da capa, Varela Round): **100px** (título ≤30 car.) / **76px** (≤60 car.) / **58px** (mais longo). `line-height` 98/76/60px (fonte arredondada tem descendentes generosos — já ajustado pra não colidir com o corpo abaixo).
- Corpo (escala com o título): **46px** / **38px** / **32px**, fonte da marca, opacidade 85%.
- Rodapé: assinatura + paginação, mono 22px.

---

## O que É customizável por layout (pra IA de design pensar variações)

- Tamanho/proporção da headline e do corpo (dentro de limites de legibilidade — cards têm até 1350px de altura).
- Alinhamento (esquerda / centro).
- Forma dos elementos decorativos (régua, pílula, blob, marcador) — cor sempre vem do Brand Kit, não é fixa no layout.
- Posição do rótulo/meta-linha (topo fixo em todos os 5 atualmente — poderia variar).
- Peso da fonte de destaque, quando a família tiver mais de 1 peso disponível (hoje só Swiss Mono usa Inter 800; os outros 3 layouts com fonte própria só têm peso 400 disponível — trocar isso exige baixar um peso novo da fonte).

## O que NÃO muda (regras de sistema, não mexer sem avisar)

- Canvas 1080×1350.
- Chip de perfil + trilha de ícones (posição, margem 60px, estilo dos ícones).
- Motor de contraste automático (tema claro/escuro por luminância real da foto).
- Corpo de texto do card interior sempre usa a fonte que o cliente escolheu em Ajustes (Inter/Sora/Space Grotesk) — só a HEADLINE e elementos decorativos usam a fonte fixa do layout.

## Post único — 2 variações (adicionado 2026-07-21)

A página 1 do post único (foto + título, sem "deslize") tem 2 variações,
escolhidas em Ajustes (`brand_kits.single_post_style`), cada uma usando os
5 layouts acima normalmente (typography do preset escolhido):
- **Estilo capa** (padrão): igual à capa do carrossel — wordmark + título.
- **Fonte no meio**: frase curta centralizada no meio do quadro, SEM
  wordmark/marca nenhuma — minimalista, deixa a foto respirar.

## Vídeo (Reels 9:16) — adicionado 2026-07-21, redesenhado 2026-07-23 e 2026-07-24

Existe um formato de vídeo (upload manual do usuário, sem geração por
IA). Versão original (descartada): a capa 4:5 era encaixada pela
LARGURA no rodapé do quadro 1080×1920, com o topo preenchido por uma
extensão desfocada — não batia com o protótipo de referência
(exemplo-modelos-com-video.png, caso 3 "REELS 9:16"). O vídeo cobre o
quadro 1080×1920 **INTEIRO** (cover-fit, nunca esticado). O texto fica
numa **ZONA SEGURA** — título alinhado à ESQUERDA (nunca centralizado)
numa faixa que reserva margem embaixo (220px, onde o Instagram desenha
legenda/@) e à direita (170px, onde ficam os ícones de curtir/
comentar/compartilhar) — nunca invade essas áreas.

2026-07-24: o divisor (———WORDMARK®———) saiu do canto topo-esquerdo
isolado (tratamento próprio, plaquinha separada) e voltou pra JUNTO do
título — exatamente como nos outros modelos de vídeo (feed 4:5,
interior do carrossel): divisor logo acima da 1ª linha do título,
dentro da MESMA zona segura/gradiente, sem precisar de placa/medição
separada pra marca (antes precisava, porque ela ficava fora da faixa
protegida). Legibilidade vem de um gradiente (mesmo motor de
`contrast.ts`) medido na própria zona segura do frame de pôster, não da
foto/vídeo inteiro. `buildReelsVideoOverlayPng` (image.ts) +
`composeReelsVideo` (video.ts, um simples cover-fit + overlay).

### Direção do gradiente das placas (regra geral, 2026-07-24)

`buildOverlayGradientSvg` (contrast.ts) ganhou um parâmetro `edge:
"top" | "bottom"` — TODA placa de legibilidade que protege um rótulo
isolado (fora da banda de identidade principal) é sólida na BORDA do
quadro onde está "grudada" e vira transparente indo pro centro:
- `edge: "bottom"` (default — bandas ancoradas no rodapé: capa,
  fechamento, vídeo feed, zona segura do Reels): sólido na base do
  quadro, funde subindo.
- `edge: "top"` (meta-linha/eyebrow no TOPO dos 4 layouts
  alternativos): sólido bem no topo do quadro, funde descendo.

Nunca um retângulo de opacidade fixa desconectado — e a placa só
aparece quando o contraste LOCAL medido pelo chamador não é suficiente
(alpha=0 não desenha nada, mesma condição de sempre).

## Vídeo feed (4:5) — adicionado 2026-07-23, redesenhado 2x no mesmo dia (migration 036)

Segundo formato de vídeo, `format: "video_feed"` — MESMO upload manual
do usuário, mas SEM o quadro 9:16 do Reels. Versão final (a 1ª e a 2ª
tentativa foram descartadas — vídeo cobrindo o quadro inteiro, depois
uma caixa no topo com cor sólida amostrada — nenhuma batia com o
protótipo de referência): o vídeo vive numa **MOLDURA própria, tamanho
YouTube (16:9), cantos arredondados (32px), com margem lateral de 90px**
(igual ao `editorial-noir-prototype.html`, seção 06 "Modelos com
vídeo") — nunca cobre o quadro inteiro. Fundo do card é **SÓLIDO,
padrão PRETO** (`#0A0A0A`, ou `colorBackground` da marca) — não depende
de luminância/cor do vídeo. Ordem vertical (cada elemento na SUA seção,
nunca sobrepostos): divisor (wordmark) → moldura do vídeo → título.
`feedVideoLayoutParts` (image.ts) calcula a geometria (a moldura sobe
sozinha se o título tiver mais linhas, igual ao resto do sistema:
grupo cresce de baixo pra cima a partir de uma margem de rodapé fixa).
`buildFeedVideoOverlay` desenha o fundo sólido com um **buraco
arredondado transparente** exatamente do tamanho da moldura (via SVG
`<mask>`) — `composeFeedVideo` (video.ts) encaixa o vídeo (cover-fit)
atrás desse buraco via `pad` do ffmpeg; os cantos arredondados saem de
graça (o buraco já corta o vídeo na forma certa, não precisa mascarar
o vídeo em si). Publica no Instagram pelo mesmo container REELS do
Graph API. Anexado no post pelo mesmo botão de upload da Fila, numa
opção separada ("Anexar Feed (4:5)") — um post só guarda 1 vídeo por
vez; trocar de formato reprocessa por cima do que já tinha.

## Interior com vídeo (carrossel) — adicionado 2026-07-23 (migration 037)

Terceiro caso de vídeo, igual ao protótipo de referência (caso
"Interior"): vídeo dentro de um CARD do meio do carrossel, não no post
inteiro. Ordem vertical (cada seção no seu lugar): TÍTULO no topo →
moldura de vídeo (16:9, cantos arredondados, MESMA técnica de buraco
transparente do vídeo feed) → CORPO abaixo → rótulo de marca (@handle)
no rodapé. Fundo sólido preto, igual ao vídeo feed. `cardVideoLayoutParts`
+ `buildCardVideoOverlay` (image.ts) calculam a geometria; reusa
`composeFeedVideo` (video.ts) sem nenhuma mudança — a função já era
genérica o bastante (só recebe a moldura como retângulo). Upload por
card no editor de cards do carrossel (`CarouselEditor.tsx`), um botão
"Anexar vídeo ao card" por card — `carousel_cards.video_url` guarda o
resultado (migration 037). Job: `attach-card-video.ts`.

**Corrigido (2026-07-24):** o preview principal do carrossel
(`CarouselPreview.tsx`, usado na Fila) agora troca pra `<video>` no
slide certo quando aquele card tem vídeo pronto (`video_status:
"ready"`) — antes o upload/processamento funcionava certinho no
backend, mas a galeria principal continuava mostrando só a imagem
estática (bug real: parecia que o vídeo "não carregava", quando na
verdade só não aparecia na prévia). `PostCard.tsx` monta `videos`/
`posters` alinhados por índice com `images`; `types.ts`
(`PostWithNews.carousel_cards`) e a query da Fila (`fila/page.tsx`)
precisaram incluir as colunas de vídeo no select.

**Limitação conhecida (2026-07-24):** a publicação (Graph API) ainda só
manda `image_url` de cada card pro container do carrossel, não
`video_url` — isso é trabalho futuro. `ReadyPostCard.tsx` (aba
Prontos) também ainda não foi atualizado com o mesmo fix de preview
(só usa `image_url`/`closing_image_url`, nem lê `carousel_cards`).
