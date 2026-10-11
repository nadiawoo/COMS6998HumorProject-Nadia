import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PREFS, lineColor, station, type Prefs, type Segment, type TripStop, type When } from "./transit";
import type { TripCard } from "./generate";

export type Scores = { want: number; pass: number; rode_yes: number; rode_no: number; score: number };
export type TripFacts = {
  version: 2; when: When; stops: TripStop[]; segments: Segment[];
  summary: { minutes: number; transfers: number; aboveGround: number; bridges: string[]; lines: string[] };
  planned_leave?: string;
};
export type RouteRow = {
  id: string; created_at: string; destination: string; vibe: string; prompt: string; model: string;
  card: TripCard; facts: TripFacts; prefs_used: Prefs;
};
export type FeedItem = RouteRow & { scores: Scores; myVotes: { intent?: number; experience?: number } };

const ZERO: Scores = { want: 0, pass: 0, rode_yes: 0, rode_no: 0, score: 0 };
const isCurrent = (r: RouteRow) => r.facts?.version === 2 && Array.isArray(r.facts.segments); // skip MVP-era rows

// Attach vote totals (public view) and the viewer's own votes (RLS: only their rows)
export async function withScores(supabase: SupabaseClient, rows: RouteRow[], userId?: string): Promise<FeedItem[]> {
  const routes = rows.filter(isCurrent);
  const ids = routes.map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: scores } = await supabase.from("route_scores").select("*").in("route_id", ids);
  const { data: mine } = userId ? await supabase.from("votes").select("route_id, kind, value").in("route_id", ids) : { data: [] };
  return routes.map((r) => {
    const s = scores?.find((x) => x.route_id === r.id);
    const myVotes = Object.fromEntries((mine ?? []).filter((v) => v.route_id === r.id).map((v) => [v.kind, v.value]));
    return { ...r, scores: s ? { want: s.want, pass: s.pass, rode_yes: s.rode_yes, rode_no: s.rode_no, score: s.score } : ZERO, myVotes };
  });
}

// Routes ordered by the route_scores view (Top = all time, Trending = last 7 days)
export async function rankedRoutes(supabase: SupabaseClient, sinceDays?: number, limit = 30) {
  let q = supabase.from("route_scores").select("route_id").order("score", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (sinceDays) q = q.gte("created_at", new Date(Date.now() - sinceDays * 86400000).toISOString());
  const { data: ranked } = await q;
  const ids = (ranked ?? []).map((r) => r.route_id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("routes").select("*").in("id", ids);
  return ids.map((id) => data?.find((r) => r.id === id)).filter(Boolean) as RouteRow[];
}

export async function viewerPrefs(supabase: SupabaseClient, userId?: string): Promise<Prefs | null> {
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("max_walk_minutes, transfer_style, avoid_transfers").eq("id", userId).maybeSingle();
  return { ...DEFAULT_PREFS, ...(data ?? {}) } as Prefs;
}

// ---------- What the map needs (keeps station data on the server) ----------
export type MapLeg = { path: [number, number][]; color: string; dashed: boolean };
export type MapMarker = { lat: number; lon: number; label: string; n?: number };
export type MapRoute = { id: string; title: string; color: string; legs: MapLeg[]; markers: MapMarker[] };

// Distinct colors for routes on the overview map (subway-bullet palette)
export const ROUTE_COLORS = ["#EE352E", "#0039A6", "#00933C", "#FF6319", "#B933AD", "#996633", "#6CBE45", "#E6A800", "#00A1DE", "#808183"];

function legsOf(r: RouteRow, colorFor: (line: string) => string): MapLeg[] {
  return r.facts.segments.flatMap((seg) => seg.legs.map((l) => l.type === "walk"
    ? { path: [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]] as [number, number][], color: "#555", dashed: true }
    : { path: l.stops.map((id) => station(id)).filter(Boolean).map((s) => [s!.lat, s!.lon] as [number, number]), color: colorFor(l.line), dashed: false }));
}
const stopMarkers = (r: RouteRow, labels?: string[]): MapMarker[] =>
  r.facts.stops.slice(1).map((s, i) => ({ lat: s.lat, lon: s.lon, n: i + 1, label: labels?.[i] ? `${i + 1} · ${labels[i]}` : s.name }));

// Overview: one color per route
export const mapSummary = (r: RouteRow, i: number): MapRoute => {
  const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
  return { id: r.id, title: r.card.title, color, legs: legsOf(r, () => color).map((l) => ({ ...l, color })), markers: stopMarkers(r) };
};
// Detail: legs colored by subway line, walks dashed, stops labeled with arrival times
export const mapDetail = (r: RouteRow, arrivals?: string[]): MapRoute =>
  ({ id: r.id, title: r.card.title, color: "#000", legs: legsOf(r, (line) => lineColor(line).bg), markers: stopMarkers(r, arrivals) });
