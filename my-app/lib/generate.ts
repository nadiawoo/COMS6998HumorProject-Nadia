// The two AI steps. The route itself always comes from lib/router.ts (real subway data);
// Gemini only (1) finds coordinates for typed places and (2) picks between real route
// options and writes what makes them worth taking.
import { GoogleGenAI } from "@google/genai";
import { prefsInWords, station, type Prefs, type RideLeg, type Segment, type TripStop } from "./transit";
import { serviceText } from "./service";

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

async function ask<T>(prompt: string, schema: object, temperature = 0.7): Promise<T> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: MODEL, contents: prompt,
    config: { responseMimeType: "application/json", responseJsonSchema: schema, temperature },
  });
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
  const out = await ask<{ places: { name: string; lat: number; lon: number; found: boolean }[] }>(prompt, schema, 0);
  return { prompt, places: out.places ?? [] };
}

// ---------- Step 2: choose between real options + write the trip ----------
export type TripCard = {
  version: 2; title: string; hook: string; best_time: string;
  choices: number[];
  views: { leg_id: string; text: string }[];
  stops: { stop: number; headline: string; minutes: number; suggestions: { name: string; detail: string }[] }[];
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

export function buildWritePrompt(input: { stops: TripStop[]; options: Segment[][]; vibe: string; timeAvail: string; when: string; prefs: Prefs; leaving: string; sunset: string; likes: string[]; events: string[] }) {
  const parts = input.options.map((opts, s) =>
    `PART ${s} — from ${input.stops[s].name} to ${input.stops[s + 1].name}${input.stops[s + 1].kind === "must" ? ` (MUST be there${input.stops[s + 1].time ? ` by ${input.stops[s + 1].time}` : ""})` : " (to explore)"}:\n${opts.map((seg, o) => describeOption(seg, s, o)).join("\n")}`);
  return `You are the voice of "Journey", a guide for a Columbia student who is new to NYC and explores on ${input.when}s.
The subway routes below were computed from real MTA data and are all valid. Your job:
1. For each PART pick one option index (choices[]) — there can be up to 5 options per part. If the destination is a MUST stop, prefer the fastest/most reliable; otherwise prefer the one that best fits the vibe "${input.vibe}" (for views: above-ground stretches and bridges).
2. For every ride leg of the options you chose that is above ground or crosses a bridge, write "views": what the rider actually sees out the window there and which side/door to stand at. Only mention landmarks you are confident are visible from that elevated stretch or bridge; otherwise describe the scene in general terms. Never write views for underground legs.
3. For every stop after the start, write a headline and 2–4 concrete suggestions near that stop that match the vibe (e.g. for a food crawl: specific long-running eateries and what to order; for sightseeing: specific spots). Use real, well-known places only.
4. For every stop, "minutes": a realistic time to spend there (0 for a stop the rider only needs to reach; 30–120 for exploring), fitting the time available.
5. "on_the_way": ${input.likes.length ? `the rider likes: ${input.likes.join(", ")}. Suggest 1–2 quick stops near a boarding or transfer station that fit those habits (real places only).` : "leave empty."}
6. best_time: when to go and why — consistent with the planned departure and the sunset time below (never suggest watching a sunset after it has set; if the trip is after dark, talk about night views or say the ride is best in daylight). title (max 6 words) and hook (max 14 words, casual, like a friend texting).
7. vibe: an editorial poster for this trip — headline (2–5 words, evocative), subline (one sentence), words (3 single mood words).
Plain text only, no emojis.

Rider: ${prefsInWords(input.prefs)}. Time available: ${input.timeAvail}.
Planned departure: ${input.leaving}. Sunset that day: ${input.sunset}.
${input.events.length ? `Happening that day near the stops (verified schedules — mention them where they fit, e.g. as a suggestion): ${input.events.join("; ")}.` : ""}
Each option lists how often its trains run at the hour the rider would be on them. Prefer options with frequent service; never choose an option whose train is NOT RUNNING at that hour.

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
        suggestions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, detail: { type: "string" } }, required: ["name", "detail"] } },
      }, required: ["stop", "headline", "minutes", "suggestions"] } },
      on_the_way: { type: "array", items: { type: "object", properties: { near: { type: "string" }, name: { type: "string" }, detail: { type: "string" } }, required: ["near", "name", "detail"] } },
      vibe: { type: "object", properties: { headline: { type: "string" }, subline: { type: "string" }, words: { type: "array", items: { type: "string" } } }, required: ["headline", "subline", "words"] },
    },
    required: ["title", "hook", "best_time", "choices", "views", "stops", "vibe"],
  };
  const card = await ask<Omit<TripCard, "version">>(prompt, schema, 0.8);
  return { ...card, version: 2 as const };
}

// Apply the AI's choices to the real options and attach its view notes to the chosen legs
export function assemble(options: Segment[][], card: TripCard): Segment[] {
  return options.map((opts, s) => {
    const o = Number.isInteger(card.choices?.[s]) && opts[card.choices[s]] ? card.choices[s] : 0;
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
  const t = await ask<Traits>(prompt, schema, 0);
  return {
    max_walk_minutes: Math.min(30, Math.max(0, Math.round(t.max_walk_minutes ?? 15))),
    transfer_style: ["any", "same_station", "none"].includes(t.transfer_style) ? t.transfer_style : "any",
    avoid_transfers: (t.avoid_transfers ?? []).filter((id) => hardTransfers.some((h) => h.id === id)),
    likes: (t.likes ?? []).slice(0, 6).map((x) => String(x).slice(0, 40)),
    summary: String(t.summary ?? "").slice(0, 200),
  };
}
