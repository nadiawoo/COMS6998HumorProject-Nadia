// Clock-time helpers (all in New York time) + the trip timeline.
import type { RideLeg, Segment, TripStop } from "./transit";
import { headway } from "./service";

const TZ = "America/New_York";
const NYC = { lat: 40.78, lon: -73.97 };

// ---------- New York time ----------
function tzOffsetMin(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000;
}
// "2026-10-11T15:30" (New York wall clock) -> Date
export function parseNy(local: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const d = new Date(guess - tzOffsetMin(new Date(guess)) * 60000);
  return new Date(guess - tzOffsetMin(d) * 60000);
}
// Date -> "2026-10-11T15:30" in New York (for <input type="datetime-local">)
export function toNyInput(d: Date) {
  const s = new Date(d.getTime() + tzOffsetMin(d) * 60000).toISOString();
  return s.slice(0, 16);
}
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
export const nyHour = (d: Date) => +new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d);
export const nyWeekday = (d: Date) => new Date(d.getTime() + tzOffsetMin(d) * 60000).getUTCDay();
export const serviceDay = (d: Date) => ([0, 6].includes(nyWeekday(d)) ? "weekend" : "weekday") as "weekday" | "weekend";
// "18:30" on the same New York day as `day`
export function atClock(day: Date, hhmm: string) {
  return parseNy(`${toNyInput(day).slice(0, 10)}T${hhmm}`);
}

// ---------- Sunrise / sunset (NOAA-style sunrise equation, ±2 min) ----------
export function sunTimes(day: Date) {
  const rad = Math.PI / 180;
  const noon = atClock(day, "12:00") ?? day;
  const n = Math.ceil(noon.getTime() / 86400000 + 2440587.5 - 2451545.0 + 0.0008);
  const Jstar = n - NYC.lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const dec = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad));
  const w0 = Math.acos((Math.sin(-0.833 * rad) - Math.sin(NYC.lat * rad) * Math.sin(dec)) / (Math.cos(NYC.lat * rad) * Math.cos(dec))) / rad;
  const toDate = (J: number) => new Date((J - 2440587.5) * 86400000);
  return { sunrise: toDate(Jtransit - w0 / 360), sunset: toDate(Jtransit + w0 / 360) };
}
export function isDark(t: Date) {
  const { sunrise, sunset } = sunTimes(t);
  return t.getTime() > sunset.getTime() + 30 * 60000 || t.getTime() < sunrise.getTime();
}

// ---------- Timeline ----------
export type LegTime = { start: Date; end: Date; board?: Date; live?: boolean };
export type SegmentTime = { legs: LegTime[]; arrive: Date; leave: Date; lateMin?: number; waitMin?: number };
export type Departures = Map<string, number[]>; // key line|station|dir -> epoch seconds
export const depKey = (l: RideLeg) => `${l.line}|${l.from}|${l.dir}`;

const TRANSFER_MIN = { same_station: 2, walk: 5, hard: 8 } as const;
const AVG_WAIT = 4;

export function buildTimeline(segments: Segment[], stops: TripStop[], dwell: number[], startAt: Date, live?: Departures): SegmentTime[] {
  const out: SegmentTime[] = [];
  let t = startAt.getTime();
  segments.forEach((seg, s) => {
    const legs: LegTime[] = [];
    let ti = 0;
    seg.legs.forEach((leg, k) => {
      const start = t;
      if (leg.type === "walk") { t += leg.minutes * 60000; legs.push({ start: new Date(start), end: new Date(t) }); return; }
      if (k > 0 && seg.legs[k - 1].type === "ride") t += TRANSFER_MIN[seg.transfers[ti++]?.kind ?? "walk"] * 60000;
      const ready = t;
      const dep = live?.get(depKey(leg))?.map((x) => x * 1000).find((x) => x >= ready + 60000);
      const hw = headway(leg.line, seg.when, nyHour(new Date(ready)));
      const est = Math.min(15, Math.max(2, (hw ?? 2 * AVG_WAIT) / 2)); // expected wait = half the time between trains
      const board = dep && dep - ready < 40 * 60000 ? dep : ready + est * 60000;
      t = board + leg.minutes * 60000;
      legs.push({ start: new Date(start), board: new Date(board), end: new Date(t), live: board === dep });
    });
    const arrive = new Date(t);
    const stop = stops[s + 1];
    let waitMin, lateMin;
    if (stop?.kind === "must" && stop.time) {
      const target = atClock(startAt, stop.time);
      if (target) {
        const diff = Math.round((target.getTime() - t) / 60000);
        if (diff >= 0) { waitMin = diff; t = target.getTime(); } else lateMin = -diff;
      }
    }
    t += (dwell[s] ?? 0) * 60000;
    out.push({ legs, arrive, leave: new Date(t), lateMin, waitMin });
  });
  return out;
}

// Plain-language warnings about the chosen time (dark views, sunset timing, late night, lateness)
export function timeWarnings(segments: Segment[], times: SegmentTime[], stops: TripStop[], vibe: string, startAt: Date) {
  const warn: string[] = [];
  const { sunset } = sunTimes(startAt);
  const scenic: { start: Date }[] = [];
  segments.forEach((seg, s) => seg.legs.forEach((l, k) => {
    if (l.type === "ride" && (l.aboveGround.length || l.bridges.length)) scenic.push({ start: times[s].legs[k].board ?? times[s].legs[k].start });
  }));
  if (scenic.length && scenic.every((x) => x.start.getTime() > sunset.getTime() + 20 * 60000))
    warn.push(`Sunset is at ${fmtTime(sunset)} — the above-ground stretches will be dark by the time you reach them. City lights instead, or leave earlier for the views.`);
  if (/sunset|views/i.test(vibe) && scenic.length) {
    const first = scenic[0].start.getTime();
    const target = sunset.getTime() - 15 * 60000;
    if (Math.abs(first - target) > 45 * 60000) {
      const leave = new Date(startAt.getTime() + (target - first));
      warn.push(`For sunset (${fmtTime(sunset)}) on the scenic stretch, leave around ${fmtTime(leave)}.`);
    }
  }
  const hours = times.flatMap((t) => t.legs.map((l) => nyHour(l.start)));
  if (hours.some((h) => h >= 23 || h < 5)) warn.push("Part of this trip is late at night — trains run less often, so expect longer waits.");
  times.forEach((t, s) => { if (t.lateMin) warn.push(`You'd reach ${stops[s + 1].name} about ${t.lateMin} min after ${stops[s + 1].time}. Leave ${t.lateMin + 5} min earlier.`); });
  return warn;
}
