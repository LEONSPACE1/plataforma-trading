import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramApi } from "./notify";
import { parseStartCode } from "./start-code";

// Links a user's Telegram chat without a webhook: the app gives the user a
// t.me/<bot>?start=<code> link, Telegram sends "/start <code>" to the bot, and
// we read it with getUpdates (here, on demand and on every alert run).

type Update = { update_id: number; message?: { chat: { id: number }; text?: string } };

let botUsername: string | null = null;

export async function telegramBotUsername(): Promise<string> {
  botUsername ??= (await telegramApi<{ username: string }>("getMe")).username;
  return botUsername;
}

/** Reads pending bot messages and links chats; returns how many were linked. */
export async function processTelegramUpdates(db: SupabaseClient): Promise<number> {
  const updates = await telegramApi<Update[]>("getUpdates", { timeout: 0, allowed_updates: ["message"] });
  if (updates.length === 0) return 0;

  let linked = 0;
  for (const u of updates) {
    const chatId = u.message?.chat.id;
    if (!chatId) continue;
    const code = parseStartCode(u.message?.text);
    const { data } = code
      ? await db.from("telegram_links").update({ chat_id: chatId, link_code: null }).eq("link_code", code).select("user_id")
      : { data: null };
    if (data?.length) {
      linked++;
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Listo: este chat quedó vinculado a la Plataforma Trading. Aquí te llegarán tus alertas.",
      }).catch(() => {});
    } else if (!code && u.message?.text?.startsWith("/start")) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Para vincular este chat, abre la página Alertas de la plataforma y toca «Vincular Telegram».",
      }).catch(() => {});
    }
  }
  // Confirm what we read so Telegram doesn't send it again.
  await telegramApi("getUpdates", { offset: updates.at(-1)!.update_id + 1, timeout: 0 });
  return linked;
}
