// ============================================================
// Cliente Inngest — orquestra os jobs de background
// (coleta RSS, triagem, geração de conteúdo, notificação).
// Local: roda com `npx inngest-cli dev` sem precisar de chave.
// ============================================================
import { EventSchemas, Inngest } from "inngest";

// Eventos que trafegam entre os jobs (tipados)
type Events = {
  // Disparado pelo cron ou manualmente — inicia a varredura de feeds.
  // scanRunId só vem no disparo manual (botão "Varrer agora") — usado
  // pra reportar o status de volta na tabela scan_runs. clientId (manual)
  // restringe a varredura às fontes do cliente ativo.
  "news/scan.requested": { data: { scanRunId?: string; clientId?: string } };
  // Uma notícia passou do threshold e virou candidata → gerar post
  "post/generate.requested": {
    data: { newsItemId: string; userId: string };
  };
  // Gerar um CARROSSEL a partir de uma notícia (fluxo separado do post single)
  "post/generate-carousel.requested": {
    data: { newsItemId: string; userId: string };
  };
  // Post pronto para aprovação → notificar no Telegram
  "post/ready.notify": {
    data: { postId: string; userId: string };
  };
  // Cliente trocou o formato do post na fila (migration 044) — único
  // vira carrossel (gera a estrutura dos cards) ou carrossel vira único
  // (a capa vira imagem base). Roda em background: a chamada de IA e o
  // download da base estouram o orçamento de um Server Action.
  "post/convert-format.requested": {
    data: { postId: string; target: "single" | "carousel" };
  };
  // Post aprovado/agendado → monta a arte final UMA vez e congela o
  // RenderSpec usado (migration 040). `token` é o posts.render_token
  // gravado pela ação: o job descarta o próprio trabalho se ele mudou,
  // pra um render superado não sobrescrever um mais recente.
  "post/render.requested": {
    data: { postId: string; userId: string; token: string };
  };
  // Usuário anexou um vídeo a um post pendente (Fase 4, kit v2 §3) →
  // compõe o quadro em background (ffmpeg). shape decide Reels (9:16,
  // vídeo cobre o quadro inteiro), feed (4:5, moldura 16:9 sobre fundo
  // sólido — migration 036) ou feed-blur (4:5, moldura 16:9 sobre o
  // MESMO vídeo borrado como fundo, 2026-07-23); default "reels".
  "post/attach-video.requested": {
    data: { postId: string; userId: string; shape?: "reels" | "feed" | "feed-blur" };
  };
  // Usuário anexou um vídeo a um CARD de carrossel (migration 037) →
  // compõe o quadro "interior com vídeo" (título + moldura 16:9 + corpo)
  // em background (ffmpeg) — mesma técnica do vídeo feed do post único.
  "card/attach-video.requested": {
    data: { cardId: string; userId: string };
  };
  // Disparo manual pra reprocessar a fila de agendados agora (Sprint C)
  // — o cron do publish-scheduled-posts já cobre isso a cada 5min.
  "post/publish.requested": { data: Record<string, never> };
  // Um post acabou de ser publicado via Graph API → dispara a coleta
  // de métricas 24h/72h depois (Sprint C, collect-insights.ts).
  "post/published": { data: { postId: string } };
  // Disparo manual da renovação dos tokens do Instagram — o cron diário
  // do refresh-social-tokens já cobre isso.
  "social/refresh-tokens.requested": { data: Record<string, never> };
};

export const inngest = new Inngest({
  id: "postpilot",
  schemas: new EventSchemas().fromRecord<Events>(),
});
