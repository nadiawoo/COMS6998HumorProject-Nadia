// Journey's AI setup lives in the database (supabase/week6.sql) so it can be managed from the admin area:
//   prompt_chains + prompt_chain_steps   which steps run, with which model, temperature and instructions
//   prompt_chain_mix                     how often each trip-writing chain is picked
//   llm_models / llm_providers           which models exist and whether they're switched on
//   terms / generation_examples          extra context added to the trip-writing prompt
//   generation_requests / llm_responses  a log of every request and every raw AI call
// If any of it is missing (e.g. the SQL hasn't been run yet), Journey falls back to its built-in defaults.
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAST_MODEL, MODEL, VOICE_DEFAULT, type CallLog, type StepSettings } from "./generate";

type Role = "locate" | "write" | "parse";
export type Chain = { id: number | null; slug: string; name: string; steps: Partial<Record<Role, StepSettings>> };

const FALLBACK: Record<"trip" | "profile", Chain> = {
  trip: { id: null, slug: "built-in", name: "Built-in default", steps: {
    locate: { role: "locate", model: FAST_MODEL, temperature: 0, thinking: "minimal" },
    write: { role: "write", model: MODEL, temperature: 0.8, thinking: "low", instructions: VOICE_DEFAULT },
  } },
  profile: { id: null, slug: "built-in", name: "Built-in default", steps: {
    parse: { role: "parse", model: FAST_MODEL, temperature: 0, thinking: "minimal" },
  } },
};

type StepRow = {
  id: number; role: Role; temperature: number; thinking_level: "none" | "minimal" | "low"; instructions: string;
  llm_models: { model_key: string; is_active: boolean; supports_thinking: boolean; llm_providers: { slug: string; is_active: boolean } | null } | null;
};
type ChainRow = { id: number; slug: string; name: string; prompt_chain_steps: StepRow[]; prompt_chain_mix: { weight: number } | { weight: number }[] | null };

// Pick the chain to run: for trips, a weighted random draw using the mix; for profiles, the active one.
// `onlyId` runs one specific chain instead (used by the admin area's "New trip").
export async function pickChain(supabase: SupabaseClient, kind: "trip" | "profile", onlyId?: number): Promise<Chain> {
  let query = supabase.from("prompt_chains")
    .select("id, slug, name, prompt_chain_steps(id, role, temperature, thinking_level, instructions, llm_models(model_key, is_active, supports_thinking, llm_providers(slug, is_active))), prompt_chain_mix(weight)")
    .eq("kind", kind).eq("is_active", true);
  if (onlyId) query = query.eq("id", onlyId);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as ChainRow[];
  if (error || rows.length === 0) return FALLBACK[kind];

  const weight = (r: ChainRow) => { const m = Array.isArray(r.prompt_chain_mix) ? r.prompt_chain_mix[0] : r.prompt_chain_mix; return Math.max(0, m?.weight ?? 0); };
  let chosen = rows[0];
  if (kind === "trip" && !onlyId) {
    const total = rows.reduce((a, r) => a + weight(r), 0);
    if (total > 0) { let x = Math.random() * total; chosen = rows.find((r) => (x -= weight(r)) < 0) ?? rows[0]; }
  }
  const steps: Chain["steps"] = {};
  for (const st of chosen.prompt_chain_steps ?? []) {
    const m = st.llm_models;
    // Journey can call Google's models; a switched-off or unknown model falls back to the default
    const usable = m && m.is_active && m.llm_providers?.slug === "google" && m.llm_providers.is_active;
    steps[st.role] = {
      id: st.id, role: st.role, temperature: Number(st.temperature), instructions: st.instructions,
      model: usable ? m!.model_key : (st.role === "write" ? MODEL : FAST_MODEL),
      thinking: usable && !m!.supports_thinking ? "none" : st.thinking_level,
    };
  }
  for (const role of Object.keys(FALLBACK[kind].steps) as Role[]) steps[role] ??= FALLBACK[kind].steps[role];
  return { id: chosen.id, slug: chosen.slug, name: chosen.name, steps };
}

// Glossary terms and example write-ups for the trip-writing prompt
export async function promptExtras(supabase: SupabaseClient, chainId: number | null) {
  const [{ data: terms }, { data: examples }] = await Promise.all([
    supabase.from("terms").select("term, definition").eq("include_in_prompts", true).order("term").limit(40),
    chainId
      ? supabase.from("generation_examples").select("example_text").eq("is_active", true).or(`chain_id.is.null,chain_id.eq.${chainId}`).limit(2)
      : supabase.from("generation_examples").select("example_text").eq("is_active", true).is("chain_id", null).limit(2),
  ]);
  return {
    glossary: (terms ?? []).map((t) => `${t.term}: ${t.definition}`),
    examples: (examples ?? []).map((e) => String(e.example_text).slice(0, 1500)),
  };
}

// ---------- Request log ----------
// One generation_requests row per planning/profile request; each AI call inside it goes to llm_responses.
export class RequestLog {
  private id: string | null = null;
  private calls: CallLog[] = [];
  private t0 = Date.now();
  constructor(private supabase: SupabaseClient, private kind: "trip" | "lucky" | "profile" | "admin", private chain: Chain, private input: object) {}

  async start(userId: string) {
    const { data } = await this.supabase.from("generation_requests")
      .insert({ user_id: userId, kind: this.kind, chain_id: this.chain.id, input: this.input })
      .select("id").maybeSingle();
    this.id = data?.id ?? null;   // null if the table doesn't exist yet: logging just stops, planning goes on
    return this;
  }
  // pass this as the `log` callback to the AI functions
  record = (c: CallLog) => { this.calls.push(c); };

  async finish(result: { route_id?: string; error?: string }) {
    if (!this.id) return;
    try {
      if (this.calls.length) {
        await this.supabase.from("llm_responses").insert(this.calls.map((c) => ({
          request_id: this.id, step_id: c.step_id ?? null, role: c.role ?? null, model_key: c.model_key, temperature: c.temperature,
          prompt: c.prompt, response: c.response ?? null, error: c.error ?? null, duration_ms: c.duration_ms,
        })));
      }
      await this.supabase.from("generation_requests").update({
        status: result.error ? "failed" : "done", error: result.error ?? null, route_id: result.route_id ?? null,
        duration_ms: Date.now() - this.t0, finished_at: new Date().toISOString(),
      }).eq("id", this.id);
    } catch { /* logging is best-effort */ }
  }
}
