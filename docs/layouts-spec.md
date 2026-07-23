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
- Headline grande abaixo do divisor.
- Corpo de apoio (opcional) abaixo da headline.
- Capa: "Deslize para ver mais" pequeno embaixo. Fechamento: sem essa linha; mostra chip (esq.) + ícones (dir.) nos cantos.

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

## Vídeo (Reels 9:16) — adicionado 2026-07-21

Existe um formato de vídeo (upload manual do usuário, sem geração por
IA): o quadro final é **1080×1920 nativo** — a capa 4:5 (mesmo motor de
layout acima) é encaixada pela LARGURA no rodapé do quadro, e o topo é
preenchido com uma extensão desfocada do próprio vídeo/foto (nunca corta
lateral). O texto usa o MESMO preset de layout escolhido em Ajustes.

## Vídeo feed (4:5) — adicionado 2026-07-23, redesenhado no mesmo dia (migration 036)

Segundo formato de vídeo, `format: "video_feed"` — MESMO upload manual
do usuário, mas SEM o quadro 9:16 do Reels. Diferente da 1ª versão
(vídeo cobrindo o quadro 1080×1350 inteiro), o vídeo fica só numa
**caixa de cima** (altura = `blurBandTop`, a mesma variável que já
delimita onde a banda de identidade da capa começa — dinâmica por
headline, igual ao Reels/capa) — cover-fit dentro dessa caixa, sem
esticar/cortar fora dela. O RESTANTE do quadro (banda de identidade,
rodapé) vira uma **cor SÓLIDA amostrada do próprio vídeo** (média RGB
do frame de pôster, `buildFeedVideoOverlay` em image.ts) — não um véu
translúcido sobre vídeo, porque ali não tem vídeo nenhum atrás pra
"velar"; é cor pura escolhida pra combinar com a paleta do vídeo.
Wordmark + título (mesmo motor de layout dos 5 presets) desenham em
cima dessa cor sólida, com a cor de texto escolhida por contraste real
(claro/escuro) contra ela. `composeFeedVideo` (video.ts) monta isso via
`pad` do ffmpeg: vídeo na caixa de cima, preenchimento sólido no resto.
Publica no Instagram pelo mesmo container REELS do Graph API (só a
proporção do vídeo muda, não o tipo de mídia). Anexado no post pelo
mesmo botão de upload da Fila, numa opção separada ("Anexar Feed
(4:5)") — um post só guarda 1 vídeo por vez; trocar de formato
reprocessa por cima do que já tinha.
