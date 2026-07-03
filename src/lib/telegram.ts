// ============================================================
// Notificações via Telegram Bot API (grátis).
// Sem TELEGRAM_BOT_TOKEN → apenas loga no console (modo local).
// ============================================================

const API_BASE = "https://api.telegram.org";

/**
 * Envia foto + legenda para um chat. Usada para avisar que há
 * post novo aguardando aprovação.
 */
export async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(
      `[telegram] TELEGRAM_BOT_TOKEN ausente — notificação suprimida: ${caption}`
    );
    return;
  }

  const res = await fetch(`${API_BASE}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendPhoto falhou (${res.status}): ${body}`);
  }
}

/**
 * Envia mensagem de texto simples (fallback quando não há imagem).
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(
      `[telegram] TELEGRAM_BOT_TOKEN ausente — notificação suprimida: ${text}`
    );
    return;
  }

  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage falhou (${res.status}): ${body}`);
  }
}
