// Route finder: Dijkstra over the whole subway map.
//
// Graph nodes
//   F|station        "on foot at a station entrance" — can board any line here
//   R|station|line   "on a train of <line> at <station>"
//   A|station        "just got off at <station>" — can walk to another station or the destination
//   ORIGIN / DEST    the trip's start and end points (any place, not just stations)
//
// Rider preferences become graph rules: walks longer than the limit and transfers the
// rider avoids simply don't exist as edges, so every route found already respects them.
import { headway } from "./service";
import {
  bridgeBetween, distanceKm, HARD_TRANSFERS, isAbove, PATTERNS, station, STATIONS, walkMin,
  type Leg, type Point, type Prefs, type RideLeg, type Segment, type Station, type Transfer, type When,
} from "./transit";

export type Variant = "fastest" | "scenic" | "fewest_transfers" | "least_walking" | "alternative";
type Ctx = { variant: Variant; when: When; hour?: number; avoidLines?: Set<string> };
type Edge = { to: string; cost: number; minutes: number; kind: "board" | "ride" | "alight" | "transfer" | "walk" };

// ---------- static parts of the graph (built once per weekday/weekend) ----------
type Graph = {
  rideAdj: Map<string, { to: string; minutes: number }[]>; // key R|station|line
  servedBy: Map<string, string[]>;                         // station -> lines stopping there
  walkPairs: Map<string, { to: string; minutes: number }[]>;
};
const byComplex = new Map<string, string[]>();
for (const s of STATIONS) byComplex.set(s.complex, [...(byComplex.get(s.complex) ?? []), s.id]);
const graphs = new Map<When, Graph>();

function graph(when: When): Graph {
  const cached = graphs.get(when);
  if (cached) return cached;
  const rideAdj = new Map<string, { to: string; minutes: number }[]>();
  const add = (k: string, v: { to: string; minutes: number }) => { const a = rideAdj.get(k) ?? []; if (!a.some((x) => x.to === v.to)) a.push(v); rideAdj.set(k, a); };
  const servedBy = new Map<string, string[]>();
  for (const [line, patterns] of Object.entries(PATTERNS[when]))
    for (const p of patterns) {
      for (const id of p) { const l = servedBy.get(id) ?? []; if (!l.includes(line)) l.push(line); servedBy.set(id, l); }
      for (let i = 0; i < p.length - 1; i++) {
        const a = station(p[i]), b = station(p[i + 1]);
        if (!a || !b) continue;
        const m = 0.6 + distanceKm(a, b) * 1.9; // dwell + ~32 km/h
        add(`R|${a.id}|${line}`, { to: `R|${b.id}|${line}`, minutes: m });
        add(`R|${b.id}|${line}`, { to: `R|${a.id}|${line}`, minutes: m });
      }
    }
  // station-to-station walking pairs up to 30 min (filtered per rider later)
  const walkPairs = new Map<string, { to: string; minutes: number }[]>();
  for (const a of STATIONS) for (const b of STATIONS) {
    if (a.id === b.id || a.complex === b.complex || !servedBy.has(a.id) || !servedBy.has(b.id)) continue;
    if (distanceKm(a, b) > 1.9) continue;
    const m = walkMin(a, b);
    if (m <= 30) walkPairs.set(a.id, [...(walkPairs.get(a.id) ?? []), { to: b.id, minutes: m }]);
  }
  const g = { rideAdj, servedBy, walkPairs };
  graphs.set(when, g);
  return g;
}

// ---------- per-request search ----------
function edgesFrom(g: Graph, node: string, prefs: Prefs, ctx: Ctx, origin: Point, dest: Point, endWalk: number): Edge[] {
  const { rideAdj, servedBy, walkPairs } = g;
  const { variant } = ctx;
  const out: Edge[] = [];
  // Lines that don't run at that hour (e.g. the B late at night) simply can't be boarded; expected wait = half the headway
  const wait = (l: string) => {
    if (ctx.hour === undefined) return 3;
    const hw = headway(l, ctx.when, ctx.hour);
    return hw === null ? null : Math.min(12, Math.max(2, hw / 2));
  };
  const walkCost = (m: number) => (variant === "least_walking" ? m * 3 : m);
  const avoidPenalty = (l: string) => (ctx.avoidLines?.has(l) ? 1.8 : 1);
  const scenicRide = (a: string, b: string, m: number) =>
    variant !== "scenic" ? m : bridgeBetween(a, b) ? m * 0.15 : isAbove(a) && isAbove(b) ? m * 0.4 : m;
  const boardPenalty = variant === "fewest_transfers" ? 12 : 0;
  const transferPenalty = variant === "fewest_transfers" ? 25 : 0;

  if (node === "ORIGIN") {
    for (const s of STATIONS) {
      if (!servedBy.has(s.id)) continue;
      const m = walkMin(origin, s);
      if (m <= endWalk) out.push({ to: `F|${s.id}`, cost: walkCost(m), minutes: m, kind: "walk" });
    }
    const direct = walkMin(origin, dest);
    if (direct <= endWalk) out.push({ to: "DEST", cost: walkCost(direct), minutes: direct, kind: "walk" });
    return out;
  }
  const [type, id, line] = node.split("|");
  const s = station(id)!;
  if (type === "F") for (const l of servedBy.get(id) ?? []) {
    const w = wait(l);
    if (w !== null) out.push({ to: `R|${id}|${l}`, cost: w + boardPenalty, minutes: w, kind: "board" });
  }
  if (type === "R") {
    for (const e of rideAdj.get(node) ?? []) out.push({ to: e.to, cost: scenicRide(id, e.to.split("|")[1], e.minutes) * avoidPenalty(line), minutes: e.minutes, kind: "ride" });
    out.push({ to: `A|${id}`, cost: 0, minutes: 0, kind: "alight" });
    // transfers without leaving the station complex
    for (const t of byComplex.get(s.complex) ?? []) for (const l of servedBy.get(t) ?? []) {
      if (l === line) continue;
      const hard = t !== id ? HARD_TRANSFERS.find((h) => h.complex === s.complex) : undefined;
      if (prefs.transfer_style === "none") continue;
      if (prefs.transfer_style === "same_station" && t !== id) continue;
      if (hard && prefs.avoid_transfers.includes(hard.id)) continue;
      const w = wait(l);
      if (w === null) continue;
      const m = t === id ? 2 : hard ? 8 : 5;
      out.push({ to: `R|${t}|${l}`, cost: m + w + transferPenalty, minutes: m + w, kind: "transfer" });
    }
  }
  if (type === "A") {
    for (const w of walkPairs.get(id) ?? [])
      if (w.minutes <= prefs.max_walk_minutes) out.push({ to: `F|${w.to}`, cost: walkCost(w.minutes) + 1, minutes: w.minutes, kind: "walk" });
    const m = walkMin(s, dest);
    if (m <= endWalk) out.push({ to: "DEST", cost: walkCost(m), minutes: m, kind: "walk" });
  }
  return out;
}

export function findRoute(origin: Point, dest: Point, prefs: Prefs, ctx: Ctx): Segment | null {
  const { variant, when } = ctx;
  const g = graph(when);
  const endWalk = Math.max(prefs.max_walk_minutes, 20); // walking to/from the first/last station
  const dist = new Map<string, number>([["ORIGIN", 0]]);
  const prev = new Map<string, { from: string; edge: Edge }>();
  const done = new Set<string>();
  const heap: [number, string][] = [[0, "ORIGIN"]]; // tiny binary heap
  const push = (x: [number, string]) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };

  while (heap.length) {
    const [d, node] = pop();
    if (done.has(node)) continue;
    done.add(node);
    if (node === "DEST") break;
    for (const e of edgesFrom(g, node, prefs, ctx, origin, dest, endWalk)) {
      const nd = d + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: node, edge: e }); push([nd, e.to]); }
    }
  }
  if (!prev.has("DEST")) return null;

  const steps: { from: string; to: string; edge: Edge }[] = [];
  for (let n = "DEST"; n !== "ORIGIN"; ) { const p = prev.get(n)!; steps.unshift({ from: p.from, to: n, edge: p.edge }); n = p.from; }
  return toSegment(steps, origin, dest, variant, when, ctx.hour);
}

const pointOf = (node: string, origin: Point, dest: Point): Point => {
  if (node === "ORIGIN") return origin;
  if (node === "DEST") return dest;
  const s = station(node.split("|")[1])!;
  return { name: s.name, lat: s.lat, lon: s.lon };
};

// Sign-style heading. Inside Manhattan: Uptown/Downtown; otherwise "<Borough>-bound" by where the train ends up.
const BORO: Record<string, string> = { M: "Manhattan", Bk: "Brooklyn", Q: "Queens", Bx: "Bronx", SI: "Staten Island" };
function heading(from: Station, terminal: Station, to: Station) {
  if (from.boro === "M" && to.boro === "M") return to.lat > from.lat ? "Uptown" : "Downtown";
  return `${BORO[terminal.boro] ?? "Outbound"}-bound`;
}

function makeRide(line: string, stops: string[], when: When): RideLeg {
  const pattern = PATTERNS[when][line]?.find((p) => p.includes(stops[0]) && p.includes(stops[stops.length - 1]));
  const dir = pattern && pattern.indexOf(stops[0]) > pattern.indexOf(stops[stops.length - 1]) ? "S" : "N";
  const first = station(stops[0])!;
  const terminal = pattern ? (dir === "N" ? pattern[pattern.length - 1] : pattern[0]) : stops[stops.length - 1];
  const bridges: string[] = [];
  for (let i = 0; i < stops.length - 1; i++) { const b = bridgeBetween(stops[i], stops[i + 1]); if (b && !bridges.includes(b)) bridges.push(b); }
  let minutes = 0;
  for (let i = 0; i < stops.length - 1; i++) minutes += 0.6 + distanceKm(station(stops[i])!, station(stops[i + 1])!) * 1.9;
  return {
    type: "ride", line, from: stops[0], to: stops[stops.length - 1], stops, dir,
    dirLabel: heading(first, station(terminal) ?? station(stops[stops.length - 1])!, station(stops[stops.length - 1])!),
    toward: station(terminal)?.name ?? "", minutes: Math.round(minutes),
    aboveGround: stops.slice(1).filter(isAbove), bridges,
  };
}

function toSegment(steps: { from: string; to: string; edge: Edge }[], origin: Point, dest: Point, variant: Variant, when: When, hour?: number): Segment {
  const legs: Leg[] = [];
  const transfers: Transfer[] = [];
  let ride: { line: string; stops: string[] } | null = null;
  const flush = () => { if (ride) { legs.push(makeRide(ride.line, ride.stops, when)); ride = null; } };

  for (const st of steps) {
    const k = st.edge.kind;
    if (k === "board") { const [, id, line] = st.to.split("|"); ride = { line, stops: [id] }; }
    else if (k === "ride") ride!.stops.push(st.to.split("|")[1]);
    else if (k === "transfer") {
      const [, a, l1] = st.from.split("|"), [, b, l2] = st.to.split("|");
      flush();
      const hard = a !== b ? HARD_TRANSFERS.find((h) => h.complex === station(a)!.complex) : undefined;
      transfers.push({ at: station(a)!.name, fromLine: l1, toLine: l2, kind: a === b ? "same_station" : hard ? "hard" : "walk", hardId: hard?.id });
      ride = { line: l2, stops: [b] };
    } else if (k === "alight") flush();
    else if (k === "walk") {
      flush();
      legs.push({
        type: "walk", from: pointOf(st.from, origin, dest), to: pointOf(st.to, origin, dest), minutes: st.edge.minutes,
        betweenStations: st.from.startsWith("A|") && st.to.startsWith("F|"),
      });
    }
  }
  flush();
  const minutes = Math.round(steps.reduce((a, s) => a + s.edge.minutes, 0));
  return { legs, transfers, minutes, variant, when, hour };
}

// Up to 5 distinct options for one part of the trip, for the hour you'd be riding
export function routeOptions(origin: Point, dest: Point, prefs: Prefs, when: When, hour?: number): Segment[] {
  const out: Segment[] = [];
  const sig = (seg: Segment) => seg.legs.map((l) => (l.type === "ride" ? `${l.line}:${l.from}-${l.to}` : "w")).join(",");
  const add = (seg: Segment | null) => { if (seg && !out.some((o) => sig(o) === sig(seg))) out.push(seg); };
  const fastest = findRoute(origin, dest, prefs, { variant: "fastest", when, hour });
  add(fastest);
  for (const v of ["scenic", "fewest_transfers", "least_walking"] as Variant[]) add(findRoute(origin, dest, prefs, { variant: v, when, hour }));
  // a genuinely different alternative: discourage the lines the fastest route uses
  if (fastest) add(findRoute(origin, dest, prefs, { variant: "alternative", when, hour, avoidLines: new Set(fastest.legs.flatMap((l) => (l.type === "ride" ? [l.line] : []))) }));
  return out.slice(0, 5);
}
