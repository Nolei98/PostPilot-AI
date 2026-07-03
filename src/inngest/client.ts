// ============================================================
// Cliente Inngest — orquestra os jobs de background
// (coleta RSS, triagem, geração de conteúdo, notificação).
// Local: roda com `npx inngest-cli dev` sem precisar de chave.
// ============================================================
import { EventSchemas, Inngest } from "inngest";

// Eventos que trafegam entre os jobs (tipados)
type Events = {
  // Disparado pelo cron ou manualmente — inicia a varredura de feeds
  "news/scan.requested": { data: Record<string, never> };
  // Uma notícia passou do threshold e virou candidata → gerar post
  "post/generate.requested": {
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
