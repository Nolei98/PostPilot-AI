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
};

export const inngest = new Inngest({
  id: "postpilot",
  schemas: new EventSchemas().fromRecord<Events>(),
});
