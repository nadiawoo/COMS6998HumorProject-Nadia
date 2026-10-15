import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { ask, FAST_MODEL, MODEL } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Quick check that the deployment can reach Gemini and the MTA, and how long each takes.
// Open /api/health while logged in (the Gemini ping uses quota, so it's members-only). Never shows the key.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const out: Record<string, unknown> = { gemini_key_set: !!process.env.GEMINI_API_KEY, model: MODEL, fast_model: FAST_MODEL, region: process.env.VERCEL_REGION ?? "local" };

  const time = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try { const r = await fn(); out[name] = { ok: true, ms: Date.now() - t0, ...(r && typeof r === "object" ? r : {}) }; }
    catch (e) { out[name] = { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 300) : String(e) }; }
  };
  await Promise.all([
    time("mta_feed", async () => { const r = await fetch("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs", { cache: "no-store", signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return { bytes: (await r.arrayBuffer()).byteLength }; }),
    user ? time("gemini_fast", () => ask<object>("Reply with {\"ok\":true}", { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, { temperature: 0, fast: true }))
         : Promise.resolve(void (out.gemini_fast = "log in to test")),
    user ? time("gemini_main", () => ask<object>("Reply with {\"ok\":true}", { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, { temperature: 0 }))
         : Promise.resolve(void (out.gemini_main = "log in to test")),
  ]);
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
