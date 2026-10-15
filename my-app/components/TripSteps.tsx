import { LineBullet } from "./LineBullet";
import { AlertIcon, ArrowIcon, ForkIcon, StarIcon, TransferIcon, ViewIcon, WalkIcon } from "./Icons";
import { station, type RideLeg } from "@/lib/transit";
import { depKey, fmtTime, type Departures, type SegmentTime } from "@/lib/time";
import type { FeedItem } from "@/lib/routes";

const gmapsPlace = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + " New York")}`;
const gmapsWalk = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=walking`;
// Walking loop through several places (Google Maps allows waypoints in a walking route)
const gmapsLoop = (from: { lat: number; lon: number }, spots: { lat: number; lon: number }[]) => {
  const last = spots[spots.length - 1], mid = spots.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${last.lat},${last.lon}${mid.length ? `&waypoints=${mid.map((p) => `${p.lat},${p.lon}`).join("|")}` : ""}&travelmode=walking`;
};
const T = ({ d }: { d?: Date }) => (d ? <span className="tabular-nums">{fmtTime(d)}</span> : null);

function Ride({ leg, time, live, first }: { leg: RideLeg; time?: SegmentTime["legs"][number]; live?: Departures | null; first: boolean }) {
  const from = station(leg.from)!, to = station(leg.to)!;
  const deps = live?.get(depKey(leg));
  return (
    <div className="border border-black">
      {/* Like the sign above the platform */}
      <div className="sign flex items-center gap-3 px-4 pb-3 pt-4">
        <LineBullet line={leg.line} size={34} />
        <div className="leading-tight">
          <p className="text-lg font-bold">{leg.dirLabel}</p>
          <p className="text-sm text-neutral-300">toward {leg.toward}</p>
        </div>
        {time?.board && <p className="ml-auto text-right text-sm"><span className="block text-xs text-neutral-400">{time.live ? "train at" : "about"}</span><T d={time.board} /></p>}
      </div>
      <div className="space-y-2 p-4">
        <p className="font-bold">Board at {from.name}</p>
        {/* First train of the trip: show the next few live departures as clock times */}
        {first && deps && deps.length > 0 && (
          <p className="text-sm">Live departures: {deps.slice(0, 4).map((x) => fmtTime(new Date(x * 1000))).join(", ")}</p>
        )}
        {time && !first && <p className="text-sm text-neutral-600">{time.live ? "Live: catch the train at " : "Estimated train around "}<T d={time.board} /></p>}
        <details className="summary-inline">
          <summary className="cursor-pointer text-sm">Ride {leg.stops.length - 1} stop{leg.stops.length > 2 ? "s" : ""} · about {leg.minutes} min</summary>
          <ol className="mt-2 border-l-2 pl-3 text-sm" style={{ borderColor: "#000" }}>
            {leg.stops.map((id) => <li key={id} className={station(id)?.structure !== "Subway" ? "font-bold" : "text-neutral-600"}>{station(id)?.name}{station(id)?.structure !== "Subway" && " — above ground"}</li>)}
          </ol>
        </details>
        <p className="font-bold">Get off at {to.name} {time && <span className="font-normal text-neutral-600">· around <T d={time.end} /></span>}</p>
        {leg.view && (
          <div className="flex gap-2 bg-neutral-100 p-3 text-sm">
            <ViewIcon size={18} className="mt-0.5 shrink-0" />
            <p><span className="font-bold">{leg.bridges.length ? `On the ${leg.bridges.join(" / ")}: ` : "Out the window: "}</span>{leg.view}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Built-in, leg-by-leg directions with clock times for the chosen departure
export function TripSteps({ item, times, live }: { item: FeedItem; times?: SegmentTime[]; live?: Departures | null }) {
  const { segments, stops } = item.facts;
  let firstRide = true;
  return (
    <ol className="space-y-3">
      {item.card.on_the_way?.length ? (
        <li className="border border-black/30 p-4 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">On the way, for you</p>
          {item.card.on_the_way.map((o) => (
            <p key={o.name} className="flex gap-2"><ForkIcon size={16} className="mt-0.5 shrink-0" /><span><a href={gmapsPlace(o.name)} target="_blank" rel="noreferrer" className="font-bold underline">{o.name}</a> near {o.near} — {o.detail}</span></p>
          ))}
        </li>
      ) : null}
      {segments.map((seg, s) => {
        const stopInfo = item.card.stops?.find((x) => x.stop === s + 1);
        const target = stops[s + 1];
        const st = times?.[s];
        let ti = 0;
        return (
          <li key={s} className="space-y-3">
            {seg.legs.map((l, k) => {
              if (l.type === "walk") return (
                <div key={k} className="flex items-center gap-3 border border-dashed border-black/50 px-4 py-3">
                  <WalkIcon size={24} />
                  <p className="flex-1 text-sm"><span className="font-bold">Walk {l.minutes} min</span> to {l.to.name}{l.betweenStations && " — skips a transfer"}{st && <span className="text-neutral-600"> · <T d={st.legs[k].start} />–<T d={st.legs[k].end} /></span>}</p>
                  <a href={gmapsWalk(l.from, l.to)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline">Map <ArrowIcon size={14} /></a>
                </div>
              );
              const isFirst = firstRide; firstRide = false;
              const t = seg.legs[k + 1]?.type === "ride" ? seg.transfers[ti++] : undefined;
              return (
                <div key={k} className="space-y-3">
                  <Ride leg={l} time={st?.legs[k]} live={live} first={isFirst} />
                  {t && <p className="flex items-center gap-2 px-1 text-sm"><TransferIcon size={18} /> <b>Transfer at {t.at}</b> — {t.kind === "same_station" ? "same station" : t.kind === "hard" ? "long walk inside the station" : "short walk between platforms"}</p>}
                </div>
              );
            })}
            {/* Arrival at a stop of the trip */}
            <div className="bg-black p-4 text-white">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                <StarIcon size={14} /> Stop {s + 1}
                {st && <> · arrive <T d={st.arrive} /></>}
                {target.kind === "must" && target.time ? ` · be there by ${target.time}` : ""}
                {stopInfo?.minutes ? ` · spend ~${stopInfo.minutes} min` : ""}
              </p>
              <p className="mt-1 text-xl font-bold">{target.name}</p>
              {st?.lateMin ? <p className="mt-1 font-bold">About {st.lateMin} min late at this departure time.</p> : null}
              {stopInfo?.headline && <p className="mt-1 text-neutral-300">{stopInfo.headline}</p>}
              {stopInfo?.suggestions?.length ? (
                <ul className="mt-3 space-y-2">
                  {stopInfo.suggestions.map((sg) => (
                    <li key={sg.name} className="flex gap-2 text-sm">
                      <ForkIcon size={16} className="mt-0.5 shrink-0" />
                      <p><a href={gmapsPlace(sg.name)} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">{sg.name}</a> — {sg.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {(() => {
                const spots = (stopInfo?.suggestions ?? []).filter((g) => typeof g.lat === "number" && typeof g.lon === "number") as { lat: number; lon: number }[];
                return spots.length > 0 && (
                  <a href={gmapsLoop(target, spots)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 border border-white px-3 py-1.5 text-sm font-bold hover:bg-white hover:text-black">
                    <WalkIcon size={16} /> Walk the loop ({spots.length} spot{spots.length > 1 ? "s" : ""}, on the map above)
                  </a>
                );
              })()}
              {st && s < segments.length - 1 && <p className="mt-3 text-sm text-neutral-400">Head on around <T d={st.leave} /></p>}
            </div>
          </li>
        );
      })}
      <li className="flex items-center gap-2 text-xs text-neutral-500"><AlertIcon size={14} /> Places come from AI — check hours before you go. Times are estimates unless marked live.</li>
    </ol>
  );
}

// Step-by-step export: one Google Maps link per step (Google re-plans whole trips, so we hand it one piece at a time)
export function GoogleSteps({ item }: { item: FeedItem }) {
  let n = 0;
  const rows = item.facts.segments.flatMap((seg) => seg.legs.map((l) => {
    n++;
    if (l.type === "walk") return { n, label: `Walk to ${l.to.name}`, url: gmapsWalk(l.from, l.to) };
    const a = station(l.from)!, b = station(l.to)!;
    return { n, label: `${l.line} train: ${a.name} → ${b.name}`, url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.name + " station, New York")}&destination=${encodeURIComponent(b.name + " station, New York")}&travelmode=transit` };
  }));
  return (
    <details className="border border-black">
      <summary className="cursor-pointer px-4 py-3 font-bold">Open in Google Maps, step by step</summary>
      <ol className="divide-y divide-black/10 border-t border-black">
        {rows.map((r) => (
          <li key={r.n}><a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-100">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-black text-xs font-bold text-white">{r.n}</span>{r.label}<ArrowIcon size={14} className="ml-auto" />
          </a></li>
        ))}
      </ol>
    </details>
  );
}
