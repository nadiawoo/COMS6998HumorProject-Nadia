// Live MTA data (no API key needed). Every call fails soft: if MTA can't be reached,
// the page just says live data is unavailable.
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";
const FEED: Record<string, string> = {
  A: "nyct%2Fgtfs-ace", C: "nyct%2Fgtfs-ace", E: "nyct%2Fgtfs-ace",
  B: "nyct%2Fgtfs-bdfm", D: "nyct%2Fgtfs-bdfm", F: "nyct%2Fgtfs-bdfm", M: "nyct%2Fgtfs-bdfm",
  G: "nyct%2Fgtfs-g", J: "nyct%2Fgtfs-jz", Z: "nyct%2Fgtfs-jz", L: "nyct%2Fgtfs-l",
  N: "nyct%2Fgtfs-nqrw", Q: "nyct%2Fgtfs-nqrw", R: "nyct%2Fgtfs-nqrw", W: "nyct%2Fgtfs-nqrw",
  "1": "nyct%2Fgtfs", "2": "nyct%2Fgtfs", "3": "nyct%2Fgtfs", "4": "nyct%2Fgtfs", "5": "nyct%2Fgtfs", "6": "nyct%2Fgtfs", "7": "nyct%2Fgtfs",
};

// protobuf int64 values may arrive as Long objects — convert safely
const num = (x: unknown) => (x && typeof x === "object" && "toNumber" in x ? (x as { toNumber: () => number }).toNumber() : Number(x ?? 0));

const feedCache = new Map<string, Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage | null>>();
function feed(name: string) {
  if (!feedCache.has(name)) {
    feedCache.set(name, fetch(BASE + name, { next: { revalidate: 30 }, signal: AbortSignal.timeout(4000) })
      .then(async (r) => (r.ok ? GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer())) : null))
      .catch(() => null));
    setTimeout(() => feedCache.delete(name), 30000);
  }
  return feedCache.get(name)!;
}

// Upcoming departures (epoch seconds) of `line` from `stationId` in direction N or S
export async function departures(line: string, stationId: string, dir: "N" | "S"): Promise<number[] | null> {
  const name = FEED[line];
  if (!name) return null;
  const msg = await feed(name);
  if (!msg) return null;
  const now = Date.now() / 1000, stop = stationId + dir, out: number[] = [];
  for (const e of msg.entity) {
    const tu = e.tripUpdate;
    if (!tu || (tu.trip?.routeId ?? "").replace("X", "") !== line) continue;
    for (const u of tu.stopTimeUpdate ?? []) {
      if (u.stopId !== stop) continue;
      const t = num(u.departure?.time) || num(u.arrival?.time);
      if (t > now - 30) out.push(t);
    }
  }
  return out.sort((a, b) => a - b).slice(0, 12);
}

type AlertJson = { entity?: { id: string; alert?: {
  active_period?: { start?: number; end?: number }[];
  informed_entity?: { route_id?: string }[];
  header_text?: { translation?: { text: string; language?: string }[] };
  "transit_realtime.mercury_alert"?: { alert_type?: string };
} }[] };

// Current service alerts that mention any of `lines`
export async function serviceAlerts(lines: string[]): Promise<{ lines: string[]; type: string; text: string }[] | null> {
  try {
    const res = await fetch(BASE + "camsys%2Fsubway-alerts.json", { next: { revalidate: 120 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as AlertJson;
    const now = Date.now() / 1000, seen = new Set<string>(), out = [];
    for (const e of data.entity ?? []) {
      const a = e.alert;
      if (!a) continue;
      const active = (a.active_period ?? []).some((p) => (p.start ?? 0) <= now && (!p.end || p.end >= now));
      const affected = [...new Set((a.informed_entity ?? []).map((i) => i.route_id ?? "").filter((r) => lines.includes(r)))];
      const text = a.header_text?.translation?.find((t) => t.language === "en")?.text ?? a.header_text?.translation?.[0]?.text;
      if (!active || affected.length === 0 || !text || seen.has(text)) continue;
      seen.add(text);
      out.push({ lines: affected, type: a["transit_realtime.mercury_alert"]?.alert_type ?? "Alert", text });
    }
    return out.slice(0, 6);
  } catch {
    return null;
  }
}
