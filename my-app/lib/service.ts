// How often each line runs, by hour (from MTA GTFS stop_times, Oct 2026).
// data/service.json: { weekday|weekend: { line: { first, last (minutes after midnight), hw: [24 hourly headways or null] } } }
import serviceData from "@/data/service.json";
import type { When } from "./transit";

type Svc = { first: number; last: number; hw: (number | null)[] };
const SERVICE = serviceData as unknown as Record<When, Record<string, Svc>>;

export const headway = (line: string, when: When, hour: number) => SERVICE[when]?.[line]?.hw[((hour % 24) + 24) % 24] ?? null;
export const runsAt = (line: string, when: When, hour: number) => headway(line, when, hour) !== null;

// "every ~6 min around then; no service 12–5 AM" — for the AI prompt and the UI
export function serviceText(line: string, when: When, hour: number) {
  const s = SERVICE[when]?.[line];
  if (!s) return `no ${line} service on ${when}s`;
  const h = headway(line, when, hour);
  const off = s.hw.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const clock = (i: number) => `${i % 12 || 12}${i < 12 ? "am" : "pm"}`;
  const gap = off.length === 0 ? "runs 24/7" : `no service roughly ${clock(off[0])}–${clock((off[off.length - 1] + 1) % 24)}`;
  return `${h === null ? "NOT RUNNING at that hour" : `every ~${h} min at that hour`}; ${gap}`;
}
