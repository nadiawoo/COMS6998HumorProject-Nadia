// The two AI steps. The route itself always comes from lib/router.ts (real subway data);
// Gemini only (1) finds coordinates for typed places and (2) picks between real route
// options and writes what makes them worth taking.
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { prefsInWords, station, type Prefs, type RideLeg, type Segment, type TripStop } from "./transit";
import { serviceText } from "./service";
import { THEMES } from "./themes";

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
// Finding coordinates is easy — use the smaller, faster model for it
export const FAST_MODEL = process.env.GEMINI_FAST_MODEL ?? "gemini-flash-lite-latest";

// Speed: "thinking" is what made planning take a minute+, so keep it low. The free tier can still be slow,
// so wait up to 60 s for small lookups and 2.5 min for writing the trip before giving up.
export async function ask<T>(prompt: string, schema: object, opts: { temperature?: number; fast?: boolean } = {}): Promise<T> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const call = (thinking: boolean) => ai.models.generateContent({
    model: opts.fast ? FAST_MODEL : MODEL, contents: prompt,
    config: {
      responseMimeType: "application/json", responseJsonSchema: schema, temperature: opts.temperature ?? 0.7,
      ...(thinking ? { thinkingConfig: { thinkingLevel: opts.fast ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW } } : {}),
    },
  });
  const limit = opts.fast ? 60000 : 150000;
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer from the AI after ${limit / 1000} s`)), limit));
  const t0 = Date.now();
  let res;
  try { res = await Promise.race([call(true), timeout]); }
  catch (e) {
    // older models don't accept thinkingLevel — retry once without it
    if (e instanceof Error && /thinking/i.test(e.message)) res = await Promise.race([call(false), timeout]);
    else throw e;
  }
  console.log(`[gemini] ${opts.fast ? FAST_MODEL : MODEL} ${Date.now() - t0} ms`);
  return JSON.parse(res.text ?? "{}") as T;
}

// ---------- Step 1: typed places -> coordinates ----------
export async function locatePlaces(names: string[]) {
  const prompt = `For each place in New York City below, give its latitude and longitude and a short clean name.
If a place is vague (e.g. "Midtown"), use its most typical central point. If it is not in NYC, set found=false.
Places:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
  const schema = {
    type: "object",
    properties: { places: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, lat: { type: "number" }, lon: { type: "number" }, found: { type: "boolean" },
    }, required: ["name", "lat", "lon", "found"] } } },
    required: ["places"],
  };
  const out = await ask<{ places: { name: string; lat: number; lon: number; found: boolean }[] }>(prompt, schema, { temperature: 0, fast: true });
  return { prompt, places: out.places ?? [] };
}

// ---------- Step 2: choose between real options + write the trip ----------
export type TripCard = {
  version: 2; title: string; hook: string; best_time: string;
  choices: number[];
  views: { leg_id: string; text: string }[];
  stops: { stop: number; headline: string; minutes: number; suggestions: { name: string; detail: string; lat?: number; lon?: number }[] }[];
  theme?: string;
  on_the_way?: { near: string; name: string; detail: string }[];
  vibe: { headline: string; subline: string; words: string[] };
};

const legId = (s: number, o: number, l: number) => `s${s}o${o}l${l}`;

function describeOption(seg: Segment, s: number, o: number) {
  const lines = seg.legs.map((l, k) => {
    if (l.type === "walk") return `  - walk ${l.minutes} min: ${l.from.name} → ${l.to.name}`;
    const r = l as RideLeg;
    const above = r.aboveGround.map((id) => station(id)?.name).filter(Boolean);
    return `  - [${legId(s, o, k)}] ${r.line} train ${r.dirLabel} (toward ${r.toward}) ${station(r.from)?.name} → ${station(r.to)?.name}, ${r.stops.length - 1} stops, ~${r.minutes} min` +
      (above.length ? `; ABOVE GROUND at: ${above.join(", ")}` : "; underground the whole way") +
      (r.bridges.length ? `; CROSSES the ${r.bridges.join(" and ")}` : "") +
      (seg.hour !== undefined ? `; ${r.line} ${serviceText(r.line, seg.when, seg.hour)}` : "");
  });
  const t = seg.transfers.map((t) => `${t.fromLine}→${t.toLine} at ${t.at} (${t.kind.replace("_", " ")})`).join("; ");
  return `  Option ${o} (${seg.variant.replace("_", " ")}, ~${seg.minutes} min${t ? `, transfers: ${t}` : ", no in-station transfers"}):\n${lines.join("\n")}`;
}

export function buildWritePrompt(input: { stops: TripStop[]; options: Segment[][]; timeBudget: number; when: string; prefs: Prefs; leaving: string; sunset: string; likes: string[]; events: string[] }) {
  const parts = input.options.map((opts, s) =>
    `PART ${s} — from ${input.stops[s].name} to ${input.stops[s + 1].name}${input.stops[s + 1].kind === "must" ? ` (MUST be there${input.stops[s + 1].time ? ` by ${input.stops[s + 1].time}` : ""})` : " (to explore)"}:\n${opts.map((seg, o) => describeOption(seg, s, o)).join("\n")}`);
  return `You are the voice of "Journey", a guide for a Columbia student who is new to NYC and explores on ${input.when}s.
The subway routes below were computed from real MTA data and are all valid. Work out what each stop is for from what it is (a night market is about cheap food, a bridge or waterfront about views, a flea about browsing) — the rider does not tell you a goal.
1. For each PART pick one option index (choices[]) — up to 5 options per part. Prefer the scenic option only when it costs at most ~15 extra minutes; for MUST stops pick the fastest reliable one.
2. TIME: the rider has about ${input.timeBudget} minutes in total. Travel should be the smaller share — set each stop's "minutes" so that time at the places is at least as long as the trip there, and travel + stops roughly fill the time available. 0 minutes for a stop they only need to reach.
3. For every ride leg you chose that is above ground or crosses a bridge, write "views": what the rider sees out the window and which side/door to stand at. Only name landmarks you are confident are visible from that stretch; never write views for underground legs.
4. For every stop after the start: a headline and 2–4 concrete suggestions that fit what the stop is for (eateries + what to order, spots to see). Use real, well-known, long-running places only, and give each one's latitude/longitude. Order them as a short walking loop starting from the stop.
5. "on_the_way": ${input.likes.length ? `the rider likes: ${input.likes.join(", ")}. Suggest 1–2 quick stops near a boarding or transfer station that fit those habits (real places only).` : "leave empty."}
6. best_time: when to go and why — consistent with the planned departure and the sunset below (never suggest watching a sunset after it has set). title (max 6 words), hook (max 14 words, casual, like a friend texting).
7. theme: exactly one of: ${THEMES.join(" | ")}.
8. vibe: an editorial poster — headline (2–5 words), subline (one sentence), words (3 single mood words).
Plain text only, no emojis.

Rider: ${prefsInWords(input.prefs)}.
Planned departure: ${input.leaving}. Sunset that day: ${input.sunset}.
${input.events.length ? `Happening near the stops (verified schedules — suggest them where they fit): ${input.events.join("; ")}.` : ""}
Each option lists how often its trains run at that hour. Prefer frequent service; never choose an option whose train is NOT RUNNING then.

${parts.join("\n\n")}`;
}

export async function writeTrip(prompt: string) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" }, hook: { type: "string" }, best_time: { type: "string" },
      choices: { type: "array", items: { type: "integer" } },
      views: { type: "array", items: { type: "object", properties: { leg_id: { type: "string" }, text: { type: "string" } }, required: ["leg_id", "text"] } },
      stops: { type: "array", items: { type: "object", properties: {
        stop: { type: "integer", description: "1 = first stop after the start" }, headline: { type: "string" }, minutes: { type: "integer" },
        suggestions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, detail: { type: "string" }, lat: { type: "number" }, lon: { type: "number" } }, required: ["name", "detail", "lat", "lon"] } },
      }, required: ["stop", "headline", "minutes", "suggestions"] } },
      on_the_way: { type: "array", items: { type: "object", properties: { near: { type: "string" }, name: { type: "string" }, detail: { type: "string" } }, required: ["near", "name", "detail"] } },
      vibe: { type: "object", properties: { headline: { type: "string" }, subline: { type: "string" }, words: { type: "array", items: { type: "string" } } }, required: ["headline", "subline", "words"] },
      theme: { type: "string", enum: [...THEMES] },
    },
    required: ["title", "hook", "best_time", "choices", "views", "stops", "vibe", "theme"],
  };
  const card = await ask<Omit<TripCard, "version">>(prompt, schema, { temperature: 0.8 });
  return { ...card, version: 2 as const };
}

// Apply the AI's choices to the real options and attach its view notes to the chosen legs
export function assemble(options: Segment[][], card: TripCard): Segment[] {
  return options.map((opts, s) => {
    let o = Number.isInteger(card.choices?.[s]) && opts[card.choices[s]] ? card.choices[s] : 0;
    // Keep travel sensible: never more than ~20 min slower than the fastest option
    const fastest = opts.reduce((m, x) => Math.min(m, x.minutes), Infinity);
    if (opts[o].minutes > fastest + 20) o = opts.findIndex((x) => x.minutes === fastest);
    const seg: Segment = JSON.parse(JSON.stringify(opts[o]));
    seg.legs.forEach((l, k) => {
      if (l.type !== "ride") return;
      l.id = legId(s, o, k);
      l.view = card.views?.find((v) => v.leg_id === l.id)?.text;
    });
    return seg;
  });
}

// ---------- Profile: free-text riding habits -> structured traits ----------
export type Traits = { max_walk_minutes: number; transfer_style: "any" | "same_station" | "none"; avoid_transfers: string[]; likes: string[]; summary: string };
export async function parseRidingNotes(notes: string, hardTransfers: { id: string; label: string }[]): Promise<Traits> {
  const prompt = `A NYC subway rider described how they like to get around:
"""${notes}"""
Turn this into settings:
- max_walk_minutes (0–30): longest walk they accept to avoid an annoying transfer (default 15 if not mentioned)
- transfer_style: "any", "same_station" (only easy transfers inside one station, e.g. cross-platform), or "none" (no in-station transfers; walking between stations is fine)
- avoid_transfers: ids from this list that they dislike: ${hardTransfers.map((h) => `${h.id} = ${h.label}`).join("; ")}
- likes: short habits to plan around (e.g. "coffee on the way", "bakeries", "bookstores", "avoid crowds")
- summary: one sentence in second person describing how they ride.`;
  const schema = { type: "object", properties: {
    max_walk_minutes: { type: "integer" }, transfer_style: { type: "string", enum: ["any", "same_station", "none"] },
    avoid_transfers: { type: "array", items: { type: "string" } }, likes: { type: "array", items: { type: "string" } }, summary: { type: "string" },
  }, required: ["max_walk_minutes", "transfer_style", "avoid_transfers", "likes", "summary"] };
  const t = await ask<Traits>(prompt, schema, { temperature: 0, fast: true });
  return {
    max_walk_minutes: Math.min(30, Math.max(0, Math.round(t.max_walk_minutes ?? 15))),
    transfer_style: ["any", "same_station", "none"].includes(t.transfer_style) ? t.transfer_style : "any",
    avoid_transfers: (t.avoid_transfers ?? []).filter((id) => hardTransfers.some((h) => h.id === id)),
    likes: (t.likes ?? []).slice(0, 6).map((x) => String(x).slice(0, 40)),
    summary: String(t.summary ?? "").slice(0, 200),
  };
}
