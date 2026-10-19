import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Notification } from "./rules";

// Delivers a notification to every channel a user set up: web push on each
// subscribed browser or phone, and their linked Telegram chat.

export type DeliveryReport = { push: number; telegram: boolean; errors: string[] };

const appUrl = () => (process.env.APP_URL ?? "https://plataforma-trading-chi.vercel.app").replace(/\/$/, "");

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:alertas@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidSet = true;
}

export async function telegramApi<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN (ver guía de alertas)");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!body.ok) throw new Error(`Telegram ${method}: ${body.description ?? `HTTP ${res.status}`}`);
  return body.result as T;
}

export function sendTelegram(chatId: number, n: Notification) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return telegramApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `<b>${escape(n.title)}</b>\n${escape(n.body)}\n${appUrl()}${n.url}`,
    link_preview_options: { is_disabled: true },
  });
}

export async function deliver(db: SupabaseClient, userId: string, n: Notification): Promise<DeliveryReport> {
  const report: DeliveryReport = { push: 0, telegram: false, errors: [] };
  const [{ data: subs }, { data: link }] = await Promise.all([
    db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
    db.from("telegram_links").select("chat_id").eq("user_id", userId).maybeSingle(),
  ]);

  if (subs?.length && pushConfigured()) {
    ensureVapid();
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 3600,
            urgency: "high",
          });
          report.push++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped the subscription (app uninstalled, permission revoked).
          if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
          else report.errors.push(`push: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );
  }

  if (link?.chat_id && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      await sendTelegram(link.chat_id, n);
      report.telegram = true;
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return report;
}
