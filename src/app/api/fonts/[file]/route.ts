// ============================================================
// GET /api/fonts/{key}-{weight}.ttf — serve as MESMAS TTFs que o resvg
// usa no render final (src/lib/font-data.ts, base64 embutido) para o
// browser desenhar o preview da fila.
//
// Por que não importar do Google Fonts: o preview da fila e a arte final
// precisam ser o mesmo desenho. Uma família baixada do CDN pode divergir
// em versão/métricas do .ttf embutido, e a divergência aparece justo no
// que o usuário está avaliando. Servindo daqui, são os mesmos bytes.
//
// Os arquivos são imutáveis (fazem parte do bundle), então cache eterno.
// O browser só baixa a variante que algum glifo realmente usar — declarar
// as 14 no globals.css não custa download.
// ============================================================
import { ALL_FONTS, findFontByFileName, fontFileName } from "@/lib/font-data";

/** Bytes vêm do bundle, não do banco — pode ser estático e pré-renderizado. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return ALL_FONTS.flatMap((font) =>
    font.buffers.map((b) => ({ file: fontFileName(font.key, b.weight) }))
  );
}

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const font = findFontByFileName(params.file);
  if (!font) return new Response("Fonte não encontrada", { status: 404 });

  return new Response(new Uint8Array(font.buffer), {
    headers: {
      "Content-Type": "font/ttf",
      "Content-Length": String(font.buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
