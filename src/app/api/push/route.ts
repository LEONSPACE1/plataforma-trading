import { adminClient, authenticate } from "@/lib/supabase/server";

// Saves or removes this browser's push subscription for the signed-in user.
// Goes through the server so a phone that switches accounts moves its
// subscription instead of hitting the unique endpoint of the old owner.

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

const validEndpoint = (s: unknown): s is string => typeof s === "string" && /^https:\/\//.test(s) && s.length < 1000;

export async function POST(request: Request) {
  const { user, denied } = await authenticate(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as Body;
  const { endpoint, keys } = body;
  if (!validEndpoint(endpoint) || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  const { error } = await adminClient()
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, denied } = await authenticate(request);
  if (denied) return denied;
  const { endpoint } = (await request.json().catch(() => ({}))) as Body;
  if (!validEndpoint(endpoint)) return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  const { error } = await adminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
