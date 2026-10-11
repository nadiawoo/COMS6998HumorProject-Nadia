// NYC subway data, shared types and small helpers. No AI here.
//
// data/stations.json — MTA stations: lines served (MTA GTFS, Oct 2026), Structure
//                      (Subway / Elevated / Viaduct …), uptown/downtown sign labels
// data/lines.json    — stop order of every line, stored in northbound ("N") order
import stationsData from "@/data/stations.json";
import linesData from "@/data/lines.json";

export type Station = {
  id: string; complex: string; name: string; lines: string[]; boro: string;
  structure: string; lat: number; lon: number; up: string; down: string;
};
export type Prefs = {
  max_walk_minutes: number;
  transfer_style: "any" | "same_station" | "none";
  avoid_transfers: string[]; // ids from HARD_TRANSFERS
};
export type Point = { name: string; lat: number; lon: number };
export type StopKind = "start" | "explore" | "must";
export type TripStop = Point & { kind: StopKind; time?: string; input: string };

export type WalkLeg = { type: "walk"; from: Point; to: Point; minutes: number; betweenStations: boolean };
export type RideLeg = {
  type: "ride"; line: string; from: string; to: string; stops: string[]; dir: "N" | "S";
  dirLabel: string; toward: string; minutes: number; aboveGround: string[]; bridges: string[];
  id?: string; view?: string;
};
export type Leg = WalkLeg | RideLeg;
export type Transfer = { at: string; fromLine: string; toLine: string; kind: "same_station" | "walk" | "hard"; hardId?: string };
export type Segment = { legs: Leg[]; transfers: Transfer[]; minutes: number; variant: string; when: When; hour?: number };

export const DEFAULT_PREFS: Prefs = { max_walk_minutes: 15, transfer_style: "any", avoid_transfers: [] };

export const STATIONS = stationsData as Station[];
const byId = new Map(STATIONS.map((s) => [s.id, s]));
export const station = (id: string) => byId.get(id);
export type When = "weekday" | "weekend";
// Daytime stopping patterns per line, separately for weekdays and weekends (e.g. no B/W/Z on weekends)
export const PATTERNS = linesData as Record<When, Record<string, string[][]>>;
export const whenOf = (d = new Date()) => {
  const day = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  return (day === 0 || day === 6 ? "weekend" : "weekday") as When;
};

export const CAMPUS: Point = { name: "Columbia University (116 St)", lat: 40.8075, lon: -73.9626 };

// Transfers inside these station complexes mean long walks/stairs. MTA's own data rates
// them the same as easy ones (3 min), so this list is hand-made — edit freely.
export const HARD_TRANSFERS = [
  { id: "times_sq", complex: "611", label: "Times Sq – 42 St (e.g. 1 ↔ Q, 7 ↔ A/C/E)" },
  { id: "14st_6av", complex: "601", label: "14 St / 6 Av (1 ↔ L, 1 ↔ F/M)" },
  { id: "fulton", complex: "628", label: "Fulton St (2/3 ↔ 4/5 ↔ A/C ↔ J/Z)" },
  { id: "court_sq", complex: "606", label: "Court Sq (G ↔ 7 ↔ E/F)" },
  { id: "wtc", complex: "624", label: "WTC / Park Pl / Chambers (2/3 ↔ A/C/E ↔ R/W)" },
  { id: "atlantic", complex: "617", label: "Atlantic Av – Barclays Ctr (2/3/4/5 ↔ B/Q ↔ D/N/R)" },
];

// Famous scenic crossings between two consecutive stops
export const BRIDGES = [
  { name: "Williamsburg Bridge", a: ["M18"], b: ["M16"] },
  { name: "Manhattan Bridge", a: ["D22", "Q01"], b: ["R30", "D24", "R31"] },
  { name: "Jamaica Bay trestle", a: ["H03"], b: ["H04"] },
];
export function bridgeBetween(x: string, y: string) {
  return BRIDGES.find((b) => (b.a.includes(x) && b.b.includes(y)) || (b.b.includes(x) && b.a.includes(y)))?.name;
}
export const isAbove = (id: string) => (station(id)?.structure ?? "Subway") !== "Subway";

// Starter destinations (drafted — please review). Free-text places work too.
export const DESTINATIONS: Point[] = [
  { name: "DUMBO", lat: 40.7033, lon: -73.9881 },
  { name: "Williamsburg waterfront (Domino Park)", lat: 40.7142, lon: -73.9682 },
  { name: "Coney Island", lat: 40.5755, lon: -73.9707 },
  { name: "Rockaway Beach", lat: 40.583, lon: -73.816 },
  { name: "Roosevelt Island", lat: 40.7615, lon: -73.9496 },
  { name: "Long Island City waterfront (Gantry Plaza)", lat: 40.7454, lon: -73.9584 },
  { name: "Flushing (Main St)", lat: 40.7596, lon: -73.83 },
  { name: "Jackson Heights", lat: 40.747, lon: -73.891 },
  { name: "Astoria Park", lat: 40.779, lon: -73.922 },
  { name: "Prospect Park", lat: 40.6602, lon: -73.969 },
  { name: "Greenpoint", lat: 40.73, lon: -73.954 },
  { name: "The High Line", lat: 40.748, lon: -74.0048 },
  { name: "Staten Island Ferry (Whitehall)", lat: 40.7013, lon: -74.0132 },
  { name: "Yankee Stadium", lat: 40.8296, lon: -73.9262 },
];
export const VIBES = ["Scenic views", "Sunset", "Food crawl", "Cheap day out", "Rainy day", "Show a visiting friend"];

// ---------- helpers ----------
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Street grid ≈ 1.3× straight-line distance, ~80 m per minute
export const walkMin = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.max(1, Math.round((distanceKm(a, b) * 1.3 * 1000) / 80));

export function prefsInWords(p: Prefs) {
  const style = { any: "any transfers are fine", same_station: "only easy transfers inside the same station", none: "no in-station transfers; walking between stations is fine" }[p.transfer_style];
  const avoid = HARD_TRANSFERS.filter((h) => p.avoid_transfers.includes(h.id)).map((h) => h.label.split(" (")[0]);
  return `walks up to ${p.max_walk_minutes} min between stations; ${style}${avoid.length ? `; never transfers at ${avoid.join(", ")}` : ""}`;
}

// Does a saved route fit a (possibly different) viewer's preferences?
export function fitFor(segments: Segment[], p: Prefs) {
  const issues: string[] = [];
  for (const seg of segments) {
    for (const t of seg.transfers) {
      if (t.hardId && p.avoid_transfers.includes(t.hardId)) issues.push(`transfer at ${t.at}`);
      else if (p.transfer_style === "none") issues.push(`transfer at ${t.at}`);
      else if (p.transfer_style === "same_station" && t.kind !== "same_station") issues.push(`walk-transfer at ${t.at}`);
    }
    for (const l of seg.legs) if (l.type === "walk" && l.betweenStations && l.minutes > p.max_walk_minutes) issues.push(`${l.minutes}-min walk`);
  }
  return issues;
}

// Summary numbers for a whole trip
export function tripFacts(segments: Segment[]) {
  const rides = segments.flatMap((s) => s.legs.filter((l): l is RideLeg => l.type === "ride"));
  return {
    minutes: segments.reduce((a, s) => a + s.minutes, 0),
    transfers: segments.reduce((a, s) => a + s.transfers.length, 0),
    aboveGround: rides.reduce((a, r) => a + r.aboveGround.length, 0),
    bridges: [...new Set(rides.flatMap((r) => r.bridges))],
    lines: [...new Set(rides.map((r) => r.line))],
  };
}

// Polyline for maps: every stop of every ride, plus walk endpoints
export function tripPath(segments: Segment[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const seg of segments)
    for (const l of seg.legs) {
      if (l.type === "walk") pts.push([l.from.lat, l.from.lon], [l.to.lat, l.to.lon]);
      else for (const id of l.stops) { const s = station(id); if (s) pts.push([s.lat, s.lon]); }
    }
  return pts;
}

// MTA line colors for the round line "bullets"
export function lineColor(line: string) {
  const c: Record<string, string> = {
    "1": "#EE352E", "2": "#EE352E", "3": "#EE352E", "4": "#00933C", "5": "#00933C", "6": "#00933C",
    "7": "#B933AD", A: "#0039A6", C: "#0039A6", E: "#0039A6", B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
    G: "#6CBE45", J: "#996633", Z: "#996633", L: "#A7A9AC", N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A", S: "#808183",
  };
  return { bg: c[line] ?? "#555", fg: ["N", "Q", "R", "W"].includes(line) ? "#000" : "#fff" };
}
