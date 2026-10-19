import { randomBytes } from "node:crypto";
import { processTelegramUpdates, telegramBotUsername } from "@/lib/alerts/telegram";
import { adminClient, authenticate } from "@/lib/supabase/server";

// POST {action: "start"} returns a t.me link with a one-time code for this user.
// POST {action: "check"} reads the bot's pending messages right away (the alert
// run also does it every minute) and says whether the chat is linked.
export async function POST(request: Request) {
  const { user, denied } = await authenticate(request);
  if (denied) return denied;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ error: "Telegram no está configurado (falta TELEGRAM_BOT_TOKEN)" }, { status: 500 });
  }
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  const db = adminClient();

  try {
    if (action === "start") {
      const code = randomBytes(12).toString("base64url");
      const { error } = await db
        .from("telegram_links")
        .upsert({ user_id: user.id, link_code: code, chat_id: null }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      return Response.json({ url: `https://t.me/${await telegramBotUsername()}?start=${code}` });
    }
    if (action === "check") {
      await processTelegramUpdates(db);
      const { data } = await db.from("telegram_links").select("chat_id").eq("user_id", user.id).maybeSingle();
      return Response.json({ linked: Boolean(data?.chat_id) });
    }
    return Response.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
