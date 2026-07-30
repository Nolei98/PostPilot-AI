// ============================================================
// Gera docs/layouts.html — o painel visual dos 5 presets, montado com os
// MESMOS builders de SVG que o render usa (layout-preview.ts). Não é
// mockup: se o código mudar, é só rodar de novo e o painel acompanha.
//
// Rodar: npx tsx scripts/build-layouts-html.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import {
  PREVIEW_LAYOUTS,
  PREVIEW_FORMATS,
  buildCoverPreview,
  buildInteriorPreview,
  buildClosingPreview,
  buildVideoPreview,
  buildFeedVideoPreview,
  buildFeedVideoPhotoPreview,
  buildInteriorVideoPreview,
  scaleSvg,
} from "../src/lib/layout-preview";
import {
  buildCardVideoOverlaySvg,
  buildFeedVideoOverlaySvg,
  buildFeedVideoBlurBgOverlaySvg,
} from "../src/lib/image";
import { buildPageOneCoverSvg } from "../src/lib/cover-svg";
import type { CardBrand, LayoutPreset } from "../src/lib/render-shared";
import {
  FONT_BUFFERS_BASE64,
  SORA_BUFFERS_BASE64,
  ANTON_BUFFERS_BASE64,
  IBM_PLEX_MONO_BUFFERS_BASE64,
  DM_SERIF_DISPLAY_BUFFERS_BASE64,
  VARELA_ROUND_BUFFERS_BASE64,
} from "../src/lib/font-data";

/**
 * As fontes vão EMBUTIDAS no arquivo. O SVG pede "Inter", "Anton", "DM
 * Serif Display"… e o resvg resolve isso com os buffers do font-data;
 * um HTML solto não resolve — o navegador cai na fonte do sistema e o
 * painel mentiria justamente sobre tipografia, que é o que distingue um
 * preset do outro.
 */
function fontesEmbutidas(): string {
  const familias: [string, { weight: number; data: string }[]][] = [
    ["Inter", FONT_BUFFERS_BASE64],
    ["Sora", SORA_BUFFERS_BASE64],
    ["Anton", ANTON_BUFFERS_BASE64],
    ["IBM Plex Mono", IBM_PLEX_MONO_BUFFERS_BASE64],
    ["DM Serif Display", DM_SERIF_DISPLAY_BUFFERS_BASE64],
    ["Varela Round", VARELA_ROUND_BUFFERS_BASE64],
  ];
  return familias
    .flatMap(([nome, buffers]) =>
      buffers.map(
        (f) => `@font-face{font-family:"${nome}";font-weight:${f.weight};font-display:block;src:url(data:font/ttf;base64,${f.data}) format("truetype");}`
      )
    )
    .join("\n");
}

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7C5CFF",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Sua Marca",
  wordmark: "SUAMARCA",
  handle: "suamarca",
  keywords: ["design", "ia"],
  brandMark: "wordmark",
  layoutPreset: "editorial-noir",
};

/** As peças de cada preset, na ordem de leitura de um carrossel. */
function pecas(preset: LayoutPreset) {
  return [
    { rotulo: "Capa", aspecto: "4 / 5", svg: buildCoverPreview(preset, brand) },
    { rotulo: "Interior", aspecto: "4 / 5", svg: buildInteriorPreview(preset, brand) },
    { rotulo: "Fechamento", aspecto: "4 / 5", svg: buildClosingPreview(preset, brand) },
    { rotulo: "Reels (9:16)", aspecto: "9 / 16", svg: buildVideoPreview(preset, brand) },
    { rotulo: "Vídeo no feed (4:5)", aspecto: "4 / 5", svg: buildFeedVideoPreview(preset, brand) },
    { rotulo: "Feed 4:5 com foto", aspecto: "4 / 5", svg: buildFeedVideoPhotoPreview(preset, brand) },
    { rotulo: "Interior com vídeo", aspecto: "4 / 5", svg: buildInteriorVideoPreview(preset, brand) },
  ];
}

// ------------------------------------------------------------
// Véu de leitura e fundo do vídeo
//
// O overlay do vídeo NÃO é uma arte fechada: ele tem um buraco onde o
// vídeo entra (transparente no PNG; o ffmpeg encaixa o clipe por trás) e
// uma placa de leitura atrás do texto, que pode ser PRETA ou BRANCA
// conforme a luminância medida. Sem ver as três situações lado a lado é
// fácil aprovar um layout que só funciona sobre fundo escuro.
// ------------------------------------------------------------
/** Quadriculado — o que for transparente no overlay aparece como xadrez. */
const XADREZ =
  "background-color:#8e8a99;background-image:linear-gradient(45deg,#b6b2bf 25%,transparent 25%),linear-gradient(-45deg,#b6b2bf 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#b6b2bf 75%),linear-gradient(-45deg,transparent 75%,#b6b2bf 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0";

/**
 * "Foto" simulada atrás da peça: cinza MÉDIO e uniforme.
 *
 * Já foi um gradiente que ia do preto ao branco, e isso mentia: a placa
 * é translúcida, então o trecho branco da foto atravessava a placa PRETA
 * e o exemplo aparecia com áreas claras — parecia defeito da placa, e
 * não do fundo de teste. Um cinza médio deixa as duas cores legíveis
 * pelo que são: a preta escurece, a branca clareia, ambas por igual.
 */
const FOTO = "background:#8a8694";

/** As quatro situações de fundo que o overlay de vídeo pode ter. */
const VEUS = [
  { rotulo: "Fundo sólido da marca", veu: undefined },
  { rotulo: "Placa preta", veu: { theme: "dark" as const, alpha: 0.55 } },
  { rotulo: "Placa branca", veu: { theme: "light" as const, alpha: 0.55 } },
  { rotulo: "Sem placa (transparente)", veu: { theme: "dark" as const, alpha: 0 } },
];

const W = 1080;
const H = 1350;

/**
 * Uma peça do painel. `frame` é a moldura do vídeo: quando o overlay não
 * pinta fundo (placa ou transparente), nada indicaria onde o clipe entra
 * — o quadriculado nessa área é o que mostra "aqui é vídeo", igual ao
 * buraco que o ffmpeg preenche no render.
 */
function quadro(
  rotulo: string,
  svg: string,
  opts: {
    fundo?: string;
    aspecto?: string;
    frame?: { x: number; y: number; w: number; h: number; radius: number };
    canvas?: { w: number; h: number };
  } = {}
): string {
  const { fundo = FOTO, aspecto = "4 / 5", frame } = opts;
  const canvas = opts.canvas ?? { w: W, h: H };
  const areaVideo = frame
    ? `<div class="video" style="left:${((frame.x / canvas.w) * 100).toFixed(2)}%;top:${(
        (frame.y / canvas.h) *
        100
      ).toFixed(2)}%;width:${((frame.w / canvas.w) * 100).toFixed(2)}%;height:${(
        (frame.h / canvas.h) *
        100
      ).toFixed(2)}%;border-radius:${((frame.radius / canvas.w) * 100).toFixed(2)}cqw;${XADREZ}"></div>`
    : "";
  return `      <figure class="peca">
        <div class="quadro" style="aspect-ratio:${aspecto};${fundo}">${areaVideo}${scaleSvg(svg)}</div>
        <figcaption>${rotulo}</figcaption>
      </figure>`;
}

/**
 * Um preset temático nas paletas do SETOR dele.
 *
 * O resto do painel usa a marca genérica (roxo) porque a cor vem do
 * Brand Kit de cada cliente, não do preset. Só que julgar um layout
 * feito pra doceria — ou pra clínica — com o roxo do exemplo não diz
 * nada: a estrutura é a mesma, o que muda é a leitura.
 */
const PALETAS_TEMATICAS: Partial<
  Record<
    LayoutPreset,
    { titulo: string; marca: Partial<CardBrand>; paletas: [string, Partial<CardBrand>][] }
  >
> = {
  "doce-vitrine": {
    titulo: "Doce Vitrine · em paleta de confeitaria",
    marca: {
      brandName: "Doce Ateliê",
      wordmark: "DOCE ATELIÊ",
      handle: "doceatelie",
      keywords: ["bolos", "docinhos"],
    },
    paletas: [
      ["Cacau + rosa glacê", { colorBackground: "#2A1A1E", colorAccent: "#F0A9C0", colorText: "#FFF6F0" }],
      ["Creme + morango", { colorBackground: "#FBF1E4", colorAccent: "#E4577A", colorText: "#3A2226" }],
      ["Pistache + chocolate", { colorBackground: "#22301F", colorAccent: "#C8DFA0", colorText: "#FAF7EE" }],
    ],
  },
  tribuna: {
    titulo: "Tribuna · em paleta de advocacia",
    marca: {
      brandName: "Marques & Alves",
      wordmark: "MARQUES & ALVES",
      handle: "marquesalves.adv",
      keywords: ["trabalhista", "civil"],
    },
    paletas: [
      ["Grafite + dourado", { colorBackground: "#0E1116", colorAccent: "#C2A05A", colorText: "#F4F2EE" }],
      ["Marfim + bordô", { colorBackground: "#F4F1EA", colorAccent: "#8C2F39", colorText: "#1A1A1A" }],
      ["Azul-marinho + prata", { colorBackground: "#101A2E", colorAccent: "#A9B7C9", colorText: "#F2F5FA" }],
    ],
  },
  "clinica-clara": {
    titulo: "Clínica Clara · em paleta de saúde",
    marca: {
      brandName: "Clínica Vitalis",
      wordmark: "VITALIS",
      handle: "clinicavitalis",
      keywords: ["cuidado", "prevenção"],
    },
    paletas: [
      ["Verde-menta clínico", { colorBackground: "#0C1418", colorAccent: "#3FBFA8", colorText: "#F2FAF8" }],
      ["Branco + azul confiança", { colorBackground: "#F5F8FA", colorAccent: "#1E6FA8", colorText: "#12232B" }],
      ["Azul-noite + coral", { colorBackground: "#101A2C", colorAccent: "#FF7A6B", colorText: "#EEF3FA" }],
    ],
  },
};

function secaoPaleta(preset: LayoutPreset): string {
  const tema = PALETAS_TEMATICAS[preset];
  if (!tema) return "";

  const pecasPaleta = tema.paletas.flatMap(([nome, cores]) => {
    const b: CardBrand = { ...brand, ...tema.marca, ...cores, layoutPreset: preset };
    return [
      quadro(`${nome} · capa`, buildCoverPreview(preset, b), { fundo: "background:#000" }),
      quadro(`${nome} · interior`, buildInteriorPreview(preset, b), { fundo: "background:#000" }),
      quadro(`${nome} · fechamento`, buildClosingPreview(preset, b), { fundo: "background:#000" }),
    ];
  });

  return `  <section class="preset">
    <h2>${tema.titulo} <span class="nota">a cor vem do Brand Kit; a estrutura é a mesma das peças acima</span></h2>
    <div class="tira">
${pecasPaleta.join("\n")}
    </div>
  </section>
`;
}

function secaoVeus(preset: LayoutPreset, label: string): string {
  const b: CardBrand = { ...brand, layoutPreset: preset };
  const card = {
    headline: "Quando o vídeo explica melhor",
    body: "O texto senta na placa; o vídeo entra pelo buraco da moldura.",
  };

  // Placa branca pede texto ESCURO — é o que a medição de luminância faz
  // no render. Sem isso a variante sairia branco-no-branco e pareceria
  // um defeito do layout em vez da combinação certa.
  const comTexto = (veu?: { theme: "light" | "dark"; alpha: number }): CardBrand =>
    veu?.theme === "light" && veu.alpha > 0 ? { ...b, colorText: "#0A0A0A" } : b;

  const interiores = VEUS.map((v) => {
    const r = buildCardVideoOverlaySvg(card, comTexto(v.veu), {
      pageKind: "interior",
      index: 4,
      total: 10,
      photoBg: v.veu,
    });
    return quadro(`Interior com vídeo · ${v.rotulo}`, r.svg, { frame: r.frame });
  });

  const feeds = VEUS.map((v) => {
    const r = buildFeedVideoOverlaySvg(
      "Vídeo no feed, 4:5",
      comTexto(v.veu),
      v.veu ? { ...v.veu, textColor: v.veu.theme === "dark" ? "#FFFFFF" : "#0A0A0A" } : undefined
    );
    return quadro(`Vídeo no feed · ${v.rotulo}`, r.svg, { frame: r.frame });
  });

  // Feed BORRADO: o fundo é o próprio vídeo desfocado (o quadro INTEIRO é
  // vídeo), com a moldura por cima — por isso o fundo aqui é xadrez cheio.
  const blurs = (["dark", "light"] as const).map((theme) => {
    const r = buildFeedVideoBlurBgOverlaySvg(
      "Fundo é o próprio vídeo, borrado",
      theme === "light" ? { ...b, colorText: "#0A0A0A" } : b,
      { theme, textColor: theme === "dark" ? "#FFFFFF" : "#0A0A0A", alpha: 0.55 }
    );
    return quadro(
      `Feed borrado · placa ${theme === "dark" ? "preta" : "branca"}`,
      r.svg,
      { fundo: XADREZ, frame: r.frame }
    );
  });

  return `  <section class="preset">
    <h2>${label} · véu e fundo do vídeo <span class="nota">xadrez = transparente (é por onde o vídeo aparece)</span></h2>
    <div class="tira">
${[...interiores, ...feeds, ...blurs].join("\n")}
    </div>
  </section>
${secaoOverlay(preset, label)}`;
}

/**
 * Modos de véu (`bg_overlay`, migration 048): auto / escurecer mais /
 * sem véu. Hoje a escolha vale na PÁGINA 1 com foto e no vídeo em feed
 * 4:5 com foto. O feed borrado e o Reels seguem só a medição com piso
 * mínimo — não há escolha a mostrar ali, e o painel diz isso.
 */
const MODOS = [
  { rotulo: "auto (medido)", alpha: 0.32 },
  { rotulo: "escurecer mais", alpha: 0.55 },
  { rotulo: "sem véu", alpha: 0 },
];

function secaoOverlay(preset: LayoutPreset, label: string): string {
  const b: CardBrand = { ...brand, layoutPreset: preset };

  const capas = MODOS.map((m) => {
    const { svg } = buildPageOneCoverSvg("O título do seu próximo post", b, true, {
      showSwipeHint: false,
      overlay: { theme: "dark", alpha: m.alpha },
      topOverlay: { theme: "dark", alpha: m.alpha },
    });
    return quadro(`Página 1 com foto · ${m.rotulo}`, svg);
  });

  const feedsFoto = MODOS.map((m) => {
    const r = buildFeedVideoOverlaySvg("Vídeo no feed, com foto atrás", b, {
      theme: "dark",
      alpha: m.alpha,
      textColor: "#FFFFFF",
    });
    return quadro(`Vídeo no feed com foto · ${m.rotulo}`, r.svg, { frame: r.frame });
  });

  return `  <section class="preset">
    <h2>${label} · modos de véu <span class="nota">vale na página 1 com foto e no vídeo em feed 4:5 com foto; feed borrado e Reels usam só a medição</span></h2>
    <div class="tira">
${[...capas, ...feedsFoto].join("\n")}
    </div>
  </section>`;
}

/**
 * Presets feitos para um SETOR. Servem a qualquer marca, mas nasceram de
 * uma leitura específica (doceria, clínica, escritório) e é assim que se
 * escolhe entre eles — por isso ficam separados dos presets de uso geral
 * em vez de misturados numa lista só.
 */
const TEMATICOS = new Set<LayoutPreset>(["doce-vitrine", "clinica-clara", "tribuna"]);

function blocoPreset(key: LayoutPreset, label: string): string {
  const quadros = pecas(key)
    .map(
      (p) => `      <figure class="peca">
        <div class="quadro" style="aspect-ratio:${p.aspecto}">${scaleSvg(p.svg)}</div>
        <figcaption>${p.rotulo}</figcaption>
      </figure>`
    )
    .join("\n");
  return `  <section class="preset">
    <h2>${label}</h2>
    <div class="tira">
${quadros}
    </div>
  </section>
${secaoPaleta(key)}${secaoVeus(key, label)}`;
}

/** Um painel de aba: só um fica visível por vez (ver o script no fim). */
function grupo(
  id: string,
  descricao: string,
  presets: typeof PREVIEW_LAYOUTS,
  visivel: boolean
): string {
  const blocos = presets.map((p) => blocoPreset(p.key as LayoutPreset, p.label)).join("\n");
  return `<section id="${id}" class="painel${visivel ? "" : " oculto"}" role="tabpanel" aria-labelledby="aba-${id}">
  <p class="grupo-desc">${descricao}</p>
${blocos}
</section>`;
}

const GRUPOS = [
  {
    id: "tematicos",
    titulo: "Temáticos por área",
    descricao:
      "Nasceram de um setor: a estrutura já conta a história antes do texto. As cores continuam vindo do Brand Kit de cada cliente.",
    presets: PREVIEW_LAYOUTS.filter((p) => TEMATICOS.has(p.key as LayoutPreset)),
  },
  {
    id: "padroes",
    titulo: "Padrões",
    descricao: "Uso geral, qualquer nicho — a escolha é de tom editorial, não de ramo.",
    presets: PREVIEW_LAYOUTS.filter((p) => !TEMATICOS.has(p.key as LayoutPreset)),
  },
];

const menu = `<nav class="abas" role="tablist">
${GRUPOS.map(
  (g, i) =>
    `  <button id="aba-${g.id}" class="aba${i === 0 ? " ativa" : ""}" role="tab" aria-selected="${i === 0}" aria-controls="${g.id}" data-alvo="${g.id}">${g.titulo} <span class="conta">${g.presets.length}</span></button>`
).join("\n")}
</nav>`;

const secoes = GRUPOS.map((g, i) => grupo(g.id, g.descricao, g.presets, i === 0)).join("\n");

const gerado = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PostPilot — layouts das artes</title>
<style>
${fontesEmbutidas()}
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  /* Identidade PostPilot: o mesmo par rosa (#E0219C) e roxo (#7B2FF7) da
     marca como halos sobre o fundo escuro do app. */
  body {
    margin: 0; padding: 44px 32px 64px;
    background:
      radial-gradient(900px 480px at 12% -8%, rgba(224,33,156,0.20), transparent 62%),
      radial-gradient(820px 460px at 88% 4%, rgba(123,47,247,0.22), transparent 60%),
      #0a0810;
    background-attachment: fixed;
    color: #f2eefb;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .topo { text-align: center; margin: 0 0 40px; }
  .orbe {
    width: 56px; height: 56px; border-radius: 999px; margin: 0 auto 14px;
    background: radial-gradient(circle at 32% 28%, #FF7ACD 0%, #E0219C 34%, #7B2FF7 78%, #4a12a8 100%);
    box-shadow: 0 0 28px rgba(224,33,156,.42), inset 0 1px 4px rgba(255,255,255,.35);
  }
  .marca {
    font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
    font-weight: 700; color: #f2eefb; margin: 0 0 6px;
  }
  h1 { font-size: 20px; margin: 0; font-weight: 500; letter-spacing: -0.2px; color: #b7abd4; }
  .abas {
    max-width: 1400px; margin: 0 auto 26px; display: flex; gap: 8px;
    border-bottom: 1px solid #241c36; padding-bottom: 0;
  }
  .aba {
    appearance: none; background: none; border: 0; cursor: pointer;
    font: inherit; font-weight: 600; color: #9c8fbd;
    padding: 10px 16px 12px; border-bottom: 2px solid transparent;
    display: inline-flex; align-items: center; gap: 8px;
    transition: color .15s ease, border-color .15s ease;
  }
  .aba:hover { color: #e6dcff; }
  .aba.ativa { color: #f2eefb; border-bottom-color: #E0219C; }
  .conta {
    font-size: 11px; font-weight: 700; line-height: 1;
    background: #241c36; color: #c0a7ff; border-radius: 999px; padding: 4px 7px;
  }
  .aba.ativa .conta { background: #E0219C; color: #fff; }
  .painel.oculto { display: none; }
  .grupo-desc { max-width: 1400px; margin: 0 auto 30px; color: #9c8fbd; }
  .preset { max-width: 1400px; margin: 0 auto 44px; }
  .preset h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 2px;
    color: #c0a7ff; margin: 0 0 14px; padding-bottom: 8px;
    border-bottom: 1px solid #241c36; font-weight: 600;
  }
  .tira { display: flex; gap: 18px; overflow-x: auto; padding-bottom: 10px; }
  .peca { margin: 0; flex: 0 0 auto; width: 208px; }
  .quadro {
    position: relative; width: 100%; overflow: hidden; border-radius: 10px;
    background: #000; border: 1px solid #241c36; container-type: inline-size;
  }
  .quadro svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .quadro .video { position: absolute; }
  figcaption { margin-top: 8px; font-size: 12px; color: #9c8fbd; text-align: center; }
  .nota { text-transform: none; letter-spacing: 0; font-weight: 400; color: #7d739b; }
</style>
</head>
<body>
<div class="topo">
  <div class="orbe" aria-hidden="true"></div>
  <p class="marca">PostPilot</p>
  <h1>Layouts das artes · ${gerado}</h1>
</div>
${menu}
${secoes}
<script>
  // Menu de abas: um painel visível por vez. A aba escolhida vai pro
  // hash da URL — assim dá pra mandar o link já aberto no grupo certo,
  // e recarregar a página não joga de volta pro primeiro.
  var abas = Array.prototype.slice.call(document.querySelectorAll('.aba'));
  var paineis = Array.prototype.slice.call(document.querySelectorAll('.painel'));

  function mostrar(alvo, atualizarHash) {
    var existe = paineis.some(function (p) { return p.id === alvo; });
    if (!existe) return;
    abas.forEach(function (a) {
      var ativa = a.dataset.alvo === alvo;
      a.classList.toggle('ativa', ativa);
      a.setAttribute('aria-selected', String(ativa));
    });
    paineis.forEach(function (p) { p.classList.toggle('oculto', p.id !== alvo); });
    if (atualizarHash) history.replaceState(null, '', '#' + alvo);
    // Trocar de aba muda a altura da página; sem voltar ao topo, o
    // scroll antigo deixa o painel novo aberto no meio do nada.
    // scrollTo com objeto não basta em todo navegador — os dois.
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  abas.forEach(function (a) {
    a.addEventListener('click', function () { mostrar(a.dataset.alvo, true); });
  });

  if (location.hash) mostrar(location.hash.slice(1), false);
</script>
</body>
</html>
`;

const destino = path.join(__dirname, "..", "docs", "layouts.html");
fs.writeFileSync(destino, html);
console.log(`docs/layouts.html gerado (${PREVIEW_LAYOUTS.length} presets × ${PREVIEW_FORMATS.length} formatos)`);
