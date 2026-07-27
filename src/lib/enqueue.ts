// ============================================================
// Envio de evento pra fila (Inngest) a partir de Server Action.
//
// Por que existe: `inngest.send()` SEM await dentro de um Server Action
// parece funcionar em dev (o processo local continua vivo e a promise
// resolve depois), mas em produção serverless a função é congelada
// assim que a action retorna — o evento nunca chega na Inngest e o job
// simplesmente não roda, sem erro nenhum em lugar nenhum.
//
// Sintomas reais que isso causou (corrigidos em 2026-07-27):
//  - salvar o layout em Ajustes não re-renderizava a fila;
//  - vídeo anexado ficava "processando" pra sempre.
//
// O await é rápido quando a fila está acessível (~100ms). A demora que
// motivou o fire-and-forget original só acontece em dev SEM
// `npx inngest-cli dev` rodando — e nesse caso o job não rodaria mesmo.
// Falha no envio nunca derruba a ação: o dado principal já foi salvo
// antes de chegar aqui.
// ============================================================
import { inngest } from "@/inngest/client";

type EventPayload = Parameters<typeof inngest.send>[0];

/**
 * Enfileira o evento e ESPERA a confirmação. `origem` só entra no log
 * pra dizer qual ação falhou.
 */
export async function enqueue(origem: string, event: EventPayload): Promise<void> {
  try {
    await inngest.send(event);
  } catch (err) {
    console.warn(`[${origem}] não foi possível enfileirar o job:`, err);
  }
}
