/** @type {import('next').NextConfig} */
const nextConfig = {
  // resvg-js tem um binário nativo (.node) — sem isso o webpack tenta
  // "bundlar" o binário como se fosse JS e quebra o build (o mesmo
  // problema que o Next já resolve automaticamente para o sharp).
  // ffmpeg-static tem o MESMO problema por um motivo diferente: exporta
  // o CAMINHO do binário calculado via `__dirname` — se o webpack
  // processar o módulo, o `__dirname` bundlado aponta pra dentro de
  // .next/server/vendor-chunks (onde o .exe não existe) em vez de
  // node_modules/ffmpeg-static (erro real visto: "spawn .../vendor-
  // chunks/ffmpeg.exe ENOENT"). Marcar como externo preserva o require
  // nativo em runtime, com o __dirname certo.
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js", "ffmpeg-static"],
    // ffmpeg-static exporta só o CAMINHO do binário (calculado em
    // runtime, não um require estático de arquivo) — o rastreador de
    // arquivos da Vercel (@vercel/nft) não detecta isso sozinho e deixa
    // o binário de fora do pacote da função serverless, quebrando em
    // produção (funciona local, quebra só no deploy). Força a inclusão
    // explícita na rota do Inngest (onde o job de vídeo roda). Next 14
    // ainda expõe essa flag só dentro de `experimental` (virou estável
    // só no Next 15).
    outputFileTracingIncludes: {
      "/api/inngest": ["./node_modules/ffmpeg-static/**"],
    },
    // Default de Server Actions é 1MB. Fotos de celular / imagens do
    // nano banana passam disso fácil (10-20MB) — a imagem é comprimida
    // e redimensionada no servidor (normalizeUploadedImage, lib/image.ts)
    // antes de compor, então aceitar o arquivo original grande aqui é
    // seguro. Sem isso o upload cai com 413 e o client recebe resposta
    // não-JSON.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Build de produção usa pasta separada (.next-build via env no
  // script "build") para NUNCA sobrescrever o .next que o `next dev`
  // está servindo — rodar `npm run build` com o dev aberto corrompia
  // os assets (404/500 em CSS/JS até reiniciar). Era a causa
  // recorrente das "bugadas de CSS".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // No Windows, o cache em disco do webpack (persistent filesystem cache)
  // sofre com falhas intermitentes de "rename" (ENOENT) — geralmente
  // causadas por antivírus/OneDrive travando o arquivo por um instante.
  // Isso corrompe o cache e gera 404 em /_next/static/... até limpar
  // manualmente a pasta .next. Desligar o cache em disco no modo dev
  // evita o problema por completo (troca velocidade de rebuild — que já
  // é rápida em projetos pequenos — por estabilidade).
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
