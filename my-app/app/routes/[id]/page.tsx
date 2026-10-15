import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { mapDetail, viewerPrefs, withScores, type RouteRow } from "@/lib/routes";
import { departures, serviceAlerts } from "@/lib/live";
import { fitFor, type RideLeg } from "@/lib/transit";
import { buildTimeline, depKey, fmtDay, fmtTime, parseNy, serviceDay, sunTimes, timeWarnings, toNyInput, type Departures } from "@/lib/time";
import { VibeCard } from "@/components/VibeCard";
import { GoogleSteps, TripSteps } from "@/components/TripSteps";
import { Votes } from "@/components/Votes";
import { LineBullet } from "@/components/LineBullet";
import { AlertIcon, ClockIcon, StarIcon } from "@/components/Icons";
import { hrs, outingMinutes, themeOf } from "@/lib/themes";
import MapClient from "@/components/MapClient";

export const maxDuration = 30;

export default async function RoutePage({ params, searchParams }: PageProps<"/routes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("routes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const [item] = await withScores(supabase, [data as RouteRow], user?.id);
  if (!item) notFound(); // older test routes from the first version
  const prefs = await viewerPrefs(supabase, user?.id);
  const s = item.facts.summary;
  const issues = prefs ? fitFor(item.facts.segments, prefs) : [];

  // This page is a template until you pick a departure time; then every step gets a clock time.
  const planned = item.facts.planned_leave ? new Date(item.facts.planned_leave) : null;
  const picked = parseNy(String(sp.leave ?? ""));
  const usePlanned = !picked && planned && planned.getTime() > Date.now();
  const leaveAt = picked ?? (usePlanned ? planned : new Date());
  const isTemplate = !picked && !usePlanned; // nobody chose a time: show it as "if you left now"
  const minutesAway = (leaveAt.getTime() - Date.now()) / 60000;
  const rides = item.facts.segments.flatMap((seg) => seg.legs.filter((l): l is RideLeg => l.type === "ride"));
  let live: Departures | null = null;
  if (minutesAway > -10 && minutesAway < 90) { // live data only helps for trips leaving soon
    live = new Map();
    await Promise.all(rides.map(async (r) => { const d = await departures(r.line, r.from, r.dir); if (d) live!.set(depKey(r), d); }));
  }
  const dwell = item.facts.stops.slice(1).map((st, i) => item.card.stops?.find((x) => x.stop === i + 1)?.minutes ?? (st.kind === "must" ? 0 : Math.max(45, item.facts.segments[i]?.minutes ?? 45)));
  const theme = themeOf(item);
  const times = buildTimeline(item.facts.segments, item.facts.stops, dwell, leaveAt, live ?? undefined);
  const warnings = timeWarnings(item.facts.segments, times, item.facts.stops, theme, leaveAt);
  const wrongDay = serviceDay(leaveAt) !== item.facts.when;
  const alerts = minutesAway < 180 ? await serviceAlerts(s.lines) : [];
  const end = times[times.length - 1];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/" className="text-sm underline">All trips</Link>

      <VibeCard item={item} />

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{theme} · about {hrs(outingMinutes(item))} out</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{item.card.title}</h1>
        <p className="text-lg text-neutral-700">{item.card.hook}</p>
        {/* All stops of the trip */}
        <ol className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          {item.facts.stops.map((st, i) => (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-400">→</span>}
              {i ? <StarIcon size={18} /> : <span className="h-3.5 w-3.5 rounded-full border-[3px] border-black" />}
              <span className="font-medium">{st.name}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
          <span className="flex gap-1">{s.lines.map((l) => <LineBullet key={l} line={l} size={24} />)}</span>
          <span className="flex items-center gap-1"><ClockIcon size={16} /> {s.minutes} min of travel</span>
          <span>{s.aboveGround} stop{s.aboveGround === 1 ? "" : "s"} above ground</span>
          {s.bridges.map((b) => <span key={b} className="font-bold">{b}</span>)}
          <span>{s.transfers ? `${s.transfers} transfer${s.transfers > 1 ? "s" : ""}` : "No transfers"}</span>
        </div>
        {prefs && <p className="text-sm font-medium">{issues.length ? `Not your style: ${issues.join(", ")}` : "Fits how you ride"}</p>}
        <p className="text-sm text-neutral-600">Best time: {item.card.best_time}</p>
      </header>

      <Votes item={item} />

      {/* Turn the template into a plan for a specific departure */}
      <section className="space-y-3 border-2 border-black p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          {isTemplate ? "Trip template — times below are if you left now" : picked && Math.abs(picked.getTime() - Date.now()) < 5 * 60000 ? "Leaving now" : usePlanned ? "Planned departure" : "Your departure"}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Link href={`/routes/${item.id}?leave=${toNyInput(new Date())}`} className="border border-black px-4 py-2.5 text-sm font-bold hover:bg-black hover:text-white">Go now</Link>
          <form className="flex gap-2">
            <input type="datetime-local" name="leave" defaultValue={toNyInput(leaveAt)} className="border border-black px-3 py-2" />
            <button className="bg-black px-4 py-2.5 text-sm font-bold text-white">Plan for this time</button>
          </form>
        </div>
        <p className="font-bold">
          {fmtDay(leaveAt)}: leave {fmtTime(leaveAt)} · done around {fmtTime(end.leave)}
          {live && live.size > 0 ? " · using live train times" : ""}
        </p>
        <p className="text-sm text-neutral-600">Sunset {fmtTime(sunTimes(leaveAt).sunset)}.</p>
        {wrongDay && <p className="flex gap-2 text-sm"><AlertIcon size={16} className="mt-0.5 shrink-0" /> This route was planned for {item.facts.when} service; on a {serviceDay(leaveAt)} some lines may run differently.</p>}
        {warnings.map((w) => <p key={w} className="flex gap-2 text-sm"><AlertIcon size={16} className="mt-0.5 shrink-0" /> {w}</p>)}
      </section>

      {/* Live MTA service alerts for the lines on this trip */}
      {alerts === null ? <p className="text-xs text-neutral-500">Live service alerts unavailable right now.</p>
        : alerts.length > 0 && (
          <section className="space-y-2 border-2 border-black p-4">
            <p className="flex items-center gap-2 font-bold"><AlertIcon size={18} /> Service changes on your lines right now</p>
            {alerts.map((a, i) => (
              <p key={i} className="flex gap-2 text-sm"><span className="flex shrink-0 gap-1">{a.lines.map((l) => <LineBullet key={l} line={l} size={20} />)}</span><span><b>{a.type}:</b> {a.text}</span></p>
            ))}
          </section>
        )}

      <div className="border border-black"><MapClient routes={[mapDetail(item, times.map((t) => fmtTime(t.arrive)))]} height={380} focus labels /></div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Step by step</h2>
        <TripSteps item={item} times={times} live={live} />
      </section>

      <GoogleSteps item={item} />

      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-500">How this trip was made ({item.model})</summary>
        <p className="mt-2 text-neutral-600">The routes were computed from MTA schedule data with a shortest-path search that respects the creator&apos;s walking and transfer preferences. The AI then chose between those options and wrote the text, using this prompt:</p>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap bg-neutral-100 p-3 text-xs">{item.prompt}</pre>
      </details>
      <p className="text-xs text-neutral-500">Routes computed from MTA schedule data. Live times from MTA. Not affiliated with the MTA.</p>
    </main>
  );
}
