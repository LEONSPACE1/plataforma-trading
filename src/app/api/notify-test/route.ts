import { deliver } from "@/lib/alerts/notify";
import { adminClient, authenticate } from "@/lib/supabase/server";

/** Sends a test notification to every channel the signed-in user set up. */
export async function POST(request: Request) {
  const { user, denied } = await authenticate(request);
  if (denied) return denied;
  try {
    const report = await deliver(adminClient(), user.id, {
      title: "Prueba de alertas",
      body: "Si ves esto, las alertas de la Plataforma Trading te llegan aquí.",
      url: "/alertas",
    });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
