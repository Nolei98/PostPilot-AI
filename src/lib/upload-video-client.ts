// ============================================================
// Envio do vídeo BROWSER → STORAGE, sem passar pelo servidor do app.
//
// O caminho antigo mandava o arquivo dentro de um Server Action. Isso
// esbarra no teto de corpo de requisição da função serverless da Vercel
// (4,5MB), que `serverActions.bodySizeLimit` NÃO afrouxa — é limite da
// plataforma, não do Next. Vídeo de celular passa disso com folga, e o
// erro voltava como resposta não-JSON: no client virava "Falha ao subir
// vídeo. Tente um arquivo menor", como se o arquivo fosse inválido.
//
// Agora o servidor só assina um ticket (createVideoUploadTicket) e o
// binário vai direto pro Storage. O teto que sobra é o do próprio
// Supabase Storage, não o da função.
// ============================================================
import { createClient } from "@/lib/supabase/client";

/** Teto do plano do Storage. Barrado aqui pra dar erro claro antes do envio. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export interface VideoUploadTicket {
  ok: boolean;
  path?: string;
  token?: string;
  error?: string;
}

/**
 * Sobe `file` usando o ticket assinado. Devolve mensagem de erro pronta
 * pra tela — nunca lança.
 */
export async function uploadVideoWithTicket(
  file: File,
  ticket: VideoUploadTicket
): Promise<{ ok: boolean; error?: string }> {
  if (!ticket.ok || !ticket.path || !ticket.token) {
    return { ok: false, error: ticket.error ?? "Não foi possível preparar o envio." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: "Vídeo muito grande (máx 50MB)." };
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("post-images")
    .uploadToSignedUrl(ticket.path, ticket.token, file, {
      contentType: file.type || "video/mp4",
      upsert: true,
    });
  if (error) {
    console.error("[uploadVideoWithTicket] falha no envio direto:", error);
    return {
      ok: false,
      error: "Falha ao enviar o vídeo. Confira a conexão e tente de novo.",
    };
  }
  return { ok: true };
}
