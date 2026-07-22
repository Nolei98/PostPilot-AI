# Handoff — Template @0verlens + Legibilidade adaptativa + Template Studio

> **O que é este arquivo:** brief de execução para dar às **capas** e **cards** o
> acabamento sofisticado do **@0verlens** — tipografia forte, divisor de marca com o
> **wordmark** `———— OVERLENS® ————` (não o @), **blur/scrim** que desce sobre o texto e
> **legibilidade que se adapta ao fundo** (com override manual). É uma **extensão do
> Sprint B (Carousel Engine)**. Referenciado pelo `PROGRESSO-2.0.md`.

> **Como usar:** cada **«TAREFA» B6–B15** = 1 PR pequeno, na ordem (têm dependência).
> Validar pelo **Critério de aceite**. O **prompt mestre** (seção 8) vai como instrução
> de sistema.

## 0. Contexto

O PostPilot-AI já renderiza arte por **Satori (JSX/HTML → SVG) + resvg (SVG → PNG)** e
processa imagem com **`sharp`**, com **Brand Kit por cliente** (multi-tenant, RLS) e um
job Inngest `generate-carousel` que monta N cards. Esta entrega **não reescreve** o
pipeline: adiciona (1) **template de capa e card** estilo @0verlens, (2) **motor de
legibilidade adaptativa** compartilhado, (3) **overrides manuais** na fila. Vale para
**carrossel** e **imagem única** (a "capa" é o card 0 / a arte única).

## 1. Referência visual (@0verlens) — copiar a fórmula, não a arte

Sofisticação por **restrição**: muito espaço negativo, tipografia grande em caixa alta
com tracking apertado, rótulos pequenos e espaçados, color grade discreto, um único
divisor fino.

| Princípio | Como aplicar |
| --- | --- |
| **Tipografia protagonista** | Headline CAIXA ALTA, bold, `letter-spacing` levemente negativo, `line-height` ~1.05, **máx 3–4 linhas** (auto-fit do tamanho). |
| **Rótulos micro** | `@handle`/keywords em caps pequenas (~12–14px no 1080), `letter-spacing` ~0.2em, opacidade 0.7–0.9. |
| **Divisor de marca (só capa)** | `———— OVERLENS® ————`: duas réguas de 1px centralizadas com o **wordmark** (não o @) no meio, no topo do bloco de texto. |
| **Espaço negativo** | Margens ~8–10% da largura. Nunca encostar na borda. |
| **Color grade discreto** | Overlay escuro/dessaturado leve sobre foto (opcional, configurável). |
| **Blur/scrim direcional** | Faixa que escurece/desfoca do meio da seção de texto para baixo (ou cima), contraste sem tapar a foto. |

## 2. Anatomia

- **Capa (card 0 / imagem única):** divisor `———— OVERLENS® ————` (wordmark) no topo do
  bloco + headline (3–4 linhas, auto-fit) + CTA/label opcional + scrim da seção pra baixo.
- **Cards interiores (sem divisor):** marca **variável** (`@handle · keywords`, só @handle,
  só ícone/logo, wordmark ou nada), topo **ou** base, decidido pelo motor de legibilidade
  e travável manualmente. Cores da marca em todos os elementos.

## 3. Motor de legibilidade adaptativa (núcleo novo)

Objetivo: *"ajustar conforme o fundo pra não desaparecer, em cima ou embaixo, ou nem
aparecer — e configurar manual caso a IA erre."* Medir o fundo → escolher cor do texto +
posição + intensidade do scrim para bater a meta de contraste; permitir override total.

**`resolveLegibility` (roda antes do Satori, via `sharp`):**
1. **Sem imagem** → fundo sólido/gradiente do Brand Kit; contraste determinístico, pula análise.
2. **Com imagem** → `sharp` recorta zonas candidatas (faixa superior ~28%, inferior ~32%), reduz p/ thumb, `stats()` por canal.
3. Por zona: **luminância** `L = 0.2126·R + 0.7152·G + 0.0722·B` (0–1) + **desvio-padrão** (proxy de "ocupado/ruidoso").
4. **Cor do texto:** `L<0.5` → claro (branco); senão escuro. (Preferir branco sobre zona escura, estilo @0verlens.)
5. **Posição** (`auto`): `score = adequação_da_cor + baixa_ocupação`; escolhe a maior.
6. **Scrim/blur:** razão de contraste texto×fundo. Se `<4.5:1`, subir α do scrim (`transparent → rgba(0,0,0,α)`) até bater, com teto (α ≤ 0.7). Blur real (opcional/premium): `sharp` desfoca+escurece só a faixa e recompõe.
7. **Auto-hide:** se nem no teto de scrim alcança (foto clara+ocupada em cima E embaixo) → `render:false` p/ o rótulo/divisor. Só no modo `auto`.
8. **Override manual sempre vence:** `position`, `textColor`, `scrim`, `showLabel` fixos ignoram tudo acima.

```tsx
async function resolveLegibility(img, zone, cfg) {
  if (!img) return { textColor: cfg.solidTextColor, scrimAlpha: 0, render: true }
  const bands = await measureBands(img)          // sharp: L e stddev por faixa
  let pos = cfg.position === 'auto' ? pickBand(bands, cfg) : cfg.position
  let textColor = cfg.textColor === 'auto'
      ? (bands[pos].L < 0.5 ? 'light' : 'dark') : cfg.textColor
  let alpha = 0
  if (cfg.scrim !== 'off')
    while (contrastRatio(textColor, effectiveBg(bands[pos], alpha)) < 4.5 && alpha < 0.7)
      alpha += 0.1
  const ok = contrastRatio(textColor, effectiveBg(bands[pos], alpha)) >= 4.5
  const render = cfg.showLabel === 'auto' ? ok : cfg.showLabel === true
  return { position: pos, textColor, scrimAlpha: alpha, blurBand: cfg.blur === 'on', render }
}
```

> **Nota Satori:** não suporta `backdrop-filter`. Scrim = `linear-gradient` (barato,
> default); blur real = `sharp` antes do render, só quando `blur:'on'`.

## 4. Modelo de dados

Estende `brand_kits`:
```sql
alter table brand_kits add column handle text;              -- @0verlens
alter table brand_kits add column keywords text[];           -- {DESIGN, ARTE, TECH}
alter table brand_kits add column wordmark text;             -- OVERLENS® (capa)
alter table brand_kits add column font_heading_url text;     -- .woff/.ttf p/ Satori
alter table brand_kits add column template_defaults jsonb;
```
Config por card em `carousel_cards`:
```sql
alter table carousel_cards add column layout jsonb;
alter table carousel_cards add column is_cover boolean default false;
```

## 5. Tokens de template (contrato JSON)

`template_defaults` (por Brand Kit) e `layout` (override por card) têm o mesmo shape (card sobrescreve):
```json
{
  "background": "image",          // image | solid | gradient
  "colorGrade": { "enabled": true, "darken": 0.18, "desaturate": 0.2 },
  "labelPosition": "auto",        // auto | top | bottom
  "showLabel": "auto",            // auto | true | false
  "textColor": "auto",            // auto | light | dark
  "scrim": "auto",                // auto | on | off
  "scrimMaxAlpha": 0.7,
  "blur": "off",                  // off | on (blur real via sharp, premium)
  "brandMark": "auto",            // wordmark | handle | icon | wordmark+handle | none | auto
  "colorScheme": "brand",         // brand | inverse | mono-light | mono-dark | accent
  "showDivider": true,            // divisor wordmark (só capa)
  "contrastTarget": 4.5
}
```

## 6. Tarefas B6–B10 (continuam o Sprint B)

- **B6 — Estender Brand Kit:** migration seção 4; campos em `settings/brand` (handle, keywords, wordmark, paleta, fonte da headline, brandMark padrão, template_defaults); upload da fonte; preview ao vivo. Aceite: edições refletem no preview; defaults por client_id; RLS testada.
- **B7 — Motor de legibilidade (util compartilhado):** `resolveLegibility` + `measureBands` (sharp), `contrastRatio`, `effectiveBg`. Aceite: unit cobrindo escuro→claro sem scrim; claro→escuro/scrim; foto clara+ocupada nas 2 faixas em auto→`render:false`; override vence.
- **B8 — `CapaTemplate` + `CardTemplate` (Satori):** fonte embutida (`fonts:[{name,data}]`); capa com divisor wordmark centralizado + headline auto-fit + scrim; card com marca variável posicionável; scrim=gradient; blur via sharp; color grade opcional. Aceite: 1080×1350 fiel à seção 2; capa com divisor, card sem; troca de fonte/cor/handle reflete no PNG.
- **B9 — Overrides manuais na fila:** controles por card (labelPosition, showLabel, textColor, scrim, blur, showDivider) → `carousel_cards.layout`; re-render só do card. Aceite: forçar rótulo na base re-renderiza só o card; showLabel:false remove; persiste por card.
- **B10 — Integrar no `generate-carousel` + imagem única:** card 0 `is_cover=true` (CapaTemplate), demais CardTemplate; B7 antes de cada render; imagem única reusa CapaTemplate; mock. Aceite: carrossel com capa+N cards adaptativos; imagem única estilo capa; mock a $0.

## 6B. Template Studio — galeria de modelos + editor visual

Seção em Ajustes com **modelos prontos (≥4 por superfície)** para o cliente escolher +
liberdade para **editar cores, fontes, tamanho e posicionar elementos**, partindo de um
preset. Transforma os templates de código (B8) em **modelos dirigidos por dados (spec)**.

**Superfícies (≥4 presets cada):** `cover_image` (capa/único), `video_cover` (capa/legendas
de Reel/TikTok — visual/branding; montagem é o Sprint D/Remotion), `carousel_page`,
`carousel_last`.

**Contrato `spec`:** lista de elementos posicionáveis (`type`: wordmark|divider|handleLabel|
headline|body|cta|badge|dots|logo|media|shape) com `anchor` (9 âncoras), `offset` {x,y}
normalizado 0–1, `size` {fontSize,maxWidth}, `style` (color/font/weight/tracking/lineHeight/
align/case/opacity), `bind` (fonte do conteúdo), `z`, `visible`, `locked`. `color:"auto"`/
`font:"heading"` referenciam tokens do Brand Kit + motor de legibilidade.

- **B11 — Dados de templates:** tabela `templates` (client_id null = preset do sistema, surface, name, spec jsonb, thumbnail_url, is_system) + `brand_kits.template_selection` jsonb (modelo por superfície). Aceite: presets do sistema legíveis por todos; custom só do dono (RLS 2 users); seleção persiste.
- **B12 — Renderer dirigido por spec (generaliza B8):** `renderFromSpec(spec, brandKit, content, legibility)` → JSX Satori; mapeia cada `type`; resolve tokens auto; aplica anchor/offset/size/z/visible; CapaTemplate/CardTemplate viram os 2 primeiros presets em spec. Aceite: mesma spec → PNG idêntico; mudar offset/fontSize/color muda o render.
- **B13 — Seed de presets (≥4/superfície, ≥16 total):** variar marca (wordmark/@handle+kw/só @handle/só ícone/sem marca) × cor (brand/inverse/mono-claro/mono-escuro/accent) × fundo (foto/sólido/gradiente) × posição do texto. Exemplos: Prisma, Editorial, Grade, Handle Minimal, Ícone, Tag, Limpo, Fechamento, Assinatura, Reel Bold, Reel Marca. Aceite: cada superfície ≥4 com thumbnail; existem @handle, só ícone e wordmark; variações de cor visíveis; render válido em mock.
- **B14 — Editor visual interativo (Ajustes → Modelos):** canvas com drag + alças de resize (grava anchor+offset+size), snapping/guias, grid+safe-area, painel de camadas, toolbar contextual (cor/fonte/tamanho/peso/tracking/alinhamento/caixa/opacidade), swatches do Brand Kit + picker, troca de colorScheme/brandMark 1-clique, undo/redo + atalhos, **live preview (render de servidor com debounce)**, salvar como meu modelo/duplicar/resetar. Detalhes na seção 6B.5 do brief original.
- **B15 — Aplicar seleção no pipeline:** generate-carousel (capa=cover_image, internas=carousel_page, última=carousel_last), imagem única (cover_image), vídeo (video_cover) carregam `template_selection` e renderizam via B12; fallback preset padrão. Aceite: trocar modelo em Ajustes muda os próximos posts; mock.

## 7. Definition of Done
Contraste batido (ou auto-hide/override) com fundos claro/escuro/ocupado; capa sempre com
divisor wordmark, cards nunca; headline 3–4 linhas auto-fit; marca do card selecionável;
cores/esquemas aplicados; override persiste por card; com/sem imagem; fonte embutida no
Satori sem fallback quebrado; ≥4 presets por superfície; editor com cor/fonte/tamanho/
posição salvando por cliente; edição interativa (drag+resize, snapping, camadas, toolbar);
undo/redo + atalhos + live preview WYSIWYG; badge de legibilidade + prévia com foto exemplo;
render final = spec; suíte verde em mock + CI.

## 8. Prompt mestre (instrução de sistema)
Ver bloco no brief original — papel, stack (Next+Supabase+Inngest+Vercel+Anthropic+Satori/
resvg+sharp, sem Puppeteer), objetivo visual (@0verlens), 7 regras inegociáveis
(legibilidade adaptativa, override vence, Satori sem backdrop-filter, com/sem imagem, fonte
embutida, multi-tenant, testes+mock), contrato de config, método (1 tarefa/PR, testes,
verde, reportar), primeira tarefa B6.

## Decisões pendentes
- **Fonte da headline** (embutir no Satori, licença ok): sugestões gratuitas próximas do
  visual @0verlens — **Geist** (Vercel), **General Sans**, **Space Grotesk**, **Archivo**.
  (Ou paga: Neue Montreal / Söhne.) Escolha afeta B6/B8.
- **Fidelidade do editor:** recomendação = editor mostra **preview renderizado no servidor**
  (mesma engine B12, debounce) em vez de imitar em CSS — elimina divergência editor×render.
  Confirmar.
