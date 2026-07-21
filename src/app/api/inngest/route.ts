// ============================================================
// Endpoint que a Inngest usa para invocar as funções.
// Local: `npx inngest-cli dev` descobre este endpoint sozinho.
// Produção: registrar https://seu-app.vercel.app/api/inngest
// no dashboard da Inngest.
// As funções são registradas aqui conforme cada etapa é construída.
// ============================================================
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scanNews } from "@/inngest/functions/scan-news";
import { generatePost } from "@/inngest/functions/generate-post";
import { generateCarousel } from "@/inngest/functions/generate-carousel";
import { notifyPostReady } from "@/inngest/functions/notify";
import { resyncLayoutPreset } from "@/inngest/functions/resync-layout-preset";
import { attachVideo } from "@/inngest/functions/attach-video";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scanNews, generatePost, generateCarousel, notifyPostReady, resyncLayoutPreset, attachVideo],
});
