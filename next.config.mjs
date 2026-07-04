/** @type {import('next').NextConfig} */
const nextConfig = {
  // resvg-js tem um binário nativo (.node) — sem isso o webpack tenta
  // "bundlar" o binário como se fosse JS e quebra o build (o mesmo
  // problema que o Next já resolve automaticamente para o sharp).
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
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
