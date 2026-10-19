import { sendSummaryNow } from "@/lib/jobs/summary";
import { adminClient, authenticate } from "@/lib/supabase/server";

/** Sends the signed-in user today's summary right away, to every channel they set up. */
export async function POST(request: Request) {
  const { user, denied } = await authenticate(request);
  if (denied) return denied;
  try {
    const report = await sendSummaryNow(adminClient(), user.id);
    if (!report) return Response.json({ error: "No hay activos en tus listas ni en tu portafolio para resumir." }, { status: 400 });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
