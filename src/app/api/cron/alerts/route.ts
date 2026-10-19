import { timingSafeEqual } from "node:crypto";
import { runAlerts } from "@/lib/alerts/run";
import { adminClient } from "@/lib/supabase/server";

// Called every minute by Supabase pg_cron (see supabase/cron_alertas.sql) with
// "Authorization: Bearer <CRON_SECRET>", so alerts fire with the app closed.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    return Response.json(await runAlerts(adminClient()));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
