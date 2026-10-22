import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { mapDetail, mapSummary, rankedRoutes, ROUTE_COLORS, viewerPrefs, withScores, type RouteRow } from "@/lib/routes";
import { themeOf } from "@/lib/themes";
import { logActivity } from "@/lib/activity";
import { HomeMap, HomeShell, SelectableCard } from "@/components/HomeShell";
import { fmtDay, fmtTime, isDark, nyWeekday, parseNy, serviceDay, sunTimes, toNyInput } from "@/lib/time";
import { eventsOn } from "@/lib/events";
import { fitFor } from "@/lib/transit";
import { RouteCard } from "@/components/RouteCard";
import { ArrowIcon, PinIcon } from "@/components/Icons";

const TABS = { trending: "Trending", top: "Top rated", new: "New" } as const;
const tabCls = (on: boolean) => `px-3 py-1.5 text-sm font-bold ${on ? "bg-black text-white" : "border border-black/20 hover:border-black"}`;

// Home: full-screen map of the top routes; on laptops the list sits in a panel on the right,
// on phones the map fills the screen and the list follows below it.
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const q = user ? String(sp.q ?? "").trim() : ""; // searching requires login
  if (q) await logActivity(supabase, { kind: "search", term: q }); // for the admin "top searches" stats
  const fitsOnly = !!user && sp.fits === "1";
  let tab = String(sp.tab ?? "trending") as keyof typeof TABS;
  if (!TABS[tab] || (tab === "new" && !user)) tab = "trending";

  let rows: RouteRow[];
  if (q) rows = ((await supabase.from("routes").select("*").ilike("destination", `%${q}%`).order("created_at", { ascending: false }).limit(30)).data ?? []) as RouteRow[];
  else if (tab === "new") rows = ((await supabase.from("routes").select("*").order("created_at", { ascending: false }).limit(30)).data ?? []) as RouteRow[];
  else rows = await rankedRoutes(supabase, tab === "trending" ? 7 : undefined);
  if (!q && tab === "trending" && rows.length === 0) rows = await rankedRoutes(supabase); // quiet week: fall back to all-time

  const prefs = await viewerPrefs(supabase, user?.id);
  let items = await withScores(supabase, rows, user?.id);
  if (fitsOnly && prefs) items = items.filter((i) => fitFor(i.facts.segments, prefs).length === 0);

  // When: Anytime (all templates) / Now / Pick a time. A time keeps routes planned for that kind of day
  // and floats the ones that suit the light (views before dark, food and museums after).
  const mode = sp.when === "now" ? "now" : sp.when === "pick" ? "pick" : "anytime";
  const leaveAt = mode === "now" ? new Date() : mode === "pick" ? parseNy(String(sp.leave ?? "")) : null;
  const leaveStr = leaveAt ? toNyInput(leaveAt) : "";
  let timeNote = "";
  if (leaveAt) {
    const day = serviceDay(leaveAt), dark = isDark(leaveAt), { sunset } = sunTimes(leaveAt);
    const nearSunset = Math.abs(sunset.getTime() - leaveAt.getTime()) < 2.5 * 3600000 && leaveAt < sunset;
    const fit = (t: string) => (t === "Views & bridges" ? (nearSunset ? 2 : dark ? -1 : 0) : t === "Parks & outdoors" && dark ? -2 : /Food|Culture/.test(t) && dark ? 1 : 0);
    items = items.filter((i) => i.facts.when === day).sort((a, b) => fit(themeOf(b)) - fit(themeOf(a)));
    timeNote = `${mode === "now" ? `Now, ${fmtTime(leaveAt)}` : `${fmtDay(leaveAt)}, ${fmtTime(leaveAt)}`} · ${day} service · sunset ${fmtTime(sunset)}${dark ? " · after dark: views become city lights" : nearSunset ? " · views first, for sunset" : ""}`;
  }
  // What's on: the chosen day, or else today + the coming weekend
  const now = new Date();
  const days = leaveAt ? [leaveAt] : [0, 1, 2, 3, 4, 5, 6].map((k) => new Date(now.getTime() + k * 86400000)).filter((d, k) => k === 0 || [0, 6].includes(nyWeekday(d))).slice(0, 3);
  const whatsOn = days.map((d) => ({ day: d, events: eventsOn(d) })).filter((x) => x.events.length);
  const keep = (extra: string) => `${extra}${mode !== "anytime" ? `&when=${mode}` : ""}${mode === "pick" ? `&leave=${encodeURIComponent(leaveStr)}` : ""}`;
  const top = items.slice(0, 10);
  const modeLink = (m: string) => `/?tab=${tab}${fitsOnly ? "&fits=1" : ""}${m === "anytime" ? "" : `&when=${m}`}`;

  return (
    <HomeShell>
    <main className="home lg:grid lg:h-[calc(100svh-4rem)] lg:grid-cols-[1fr_440px]">
      {/* Map: the whole screen on phones, everything left of the panel on laptops */}
      <section className="relative h-[calc(100svh-4rem)] lg:h-full">
        <HomeMap routes={top.map(mapSummary)} details={top.map((r, i) => mapDetail(r, undefined, ROUTE_COLORS[i % ROUTE_COLORS.length]))} count={items.length} />
      </section>

      {/* Panel: right side on laptops, below the map on phones */}
      <aside id="routes" className="space-y-5 border-black p-4 lg:overflow-y-auto lg:border-l">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">The journey is the point.</h1>
          <p className="mt-1 text-sm text-neutral-600">Real subway routes from 116 St, chosen for the ride itself. Rated by students.</p>
        </div>

        {user ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Link href="/plan" className="flex items-center justify-center gap-2 bg-black px-6 py-3 font-bold text-white"><PinIcon size={18} /> Plan a new trip</Link>
              <Link href="/lucky" className="flex items-center justify-center border border-black px-4 py-3 text-sm font-bold hover:bg-black hover:text-white">Feeling lucky</Link>
            </div>
            <form className="flex">
              <input name="q" defaultValue={q} placeholder="Search a destination" className="min-w-0 flex-1 border border-black px-3 py-2.5 focus:outline-none" />
              <button className="bg-black px-4 text-sm font-bold text-white">Search</button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="flex items-center justify-between border border-black p-3 text-sm hover:bg-black hover:text-white">
            <span><span className="font-bold">Log in</span> to search, plan trips and vote.</span><ArrowIcon />
          </Link>
        )}

        {q ? <p className="text-sm">Trips to “{q}” · <Link href="/" className="underline">clear</Link></p> : (
          <nav className="flex flex-wrap gap-2">
            {Object.entries(TABS).filter(([k]) => k !== "new" || user).map(([k, label]) => (
              <Link key={k} href={`/?${keep(`tab=${k}${fitsOnly ? "&fits=1" : ""}`)}`} className={tabCls(tab === k)}>{label}</Link>
            ))}
            {user && <Link href={`/?${keep(`tab=${tab}${fitsOnly ? "" : "&fits=1"}`)}`} className={tabCls(fitsOnly)}>Fits how I ride</Link>}
          </nav>
        )}

        {/* When are you going? Anytime = all trip templates; Now / a time = only what works then, with clock times */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 border border-black text-center text-sm font-bold">
            {([["anytime", "Anytime"], ["now", "Now"], ["pick", "Pick a time"]] as const).map(([m, label], k) => (
              <Link key={m} href={modeLink(m)} className={`py-2 ${k ? "border-l border-black" : ""} ${mode === m ? "bg-black text-white" : "hover:bg-neutral-100"}`}>{label}</Link>
            ))}
          </div>
          {mode === "pick" && (
            <form className="flex gap-2">
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="when" value="pick" />
              {fitsOnly && <input type="hidden" name="fits" value="1" />}
              <input type="datetime-local" name="leave" defaultValue={leaveStr} required className="min-w-0 flex-1 border border-black px-3 py-2" />
              <button className="bg-black px-4 text-sm font-bold text-white">Show</button>
            </form>
          )}
        </div>
        {timeNote && <p className="text-sm text-neutral-600">{timeNote}</p>}

        {/* Recurring markets & events — a reason to come back every week */}
        {whatsOn.length > 0 && (
          <section className="space-y-3 border border-black p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">What&apos;s on</h2>
            {whatsOn.map(({ day, events }) => (
              <div key={day.toISOString()} className="space-y-1.5">
                <p className="text-sm font-bold">{fmtDay(day)}</p>
                {events.map((e) => (
                  <div key={e.id} className="flex items-start gap-2 text-sm">
                    <p className="flex-1"><span className="font-medium">{e.name}</span> <span className="text-neutral-500">· {e.hours}</span></p>
                    <Link href={`/plan?to=${encodeURIComponent(e.name)}`} className="shrink-0 underline">Plan</Link>
                  </div>
                ))}
              </div>
            ))}
            <p className="text-xs text-neutral-500">Schedules change — tap through to check before you go.</p>
          </section>
        )}

        <div className="space-y-4">
          {items.map((item, i) => {
            const color = i < 10 ? ROUTE_COLORS[i % ROUTE_COLORS.length] : undefined;
            return <SelectableCard key={item.id} id={item.id} color={color}><RouteCard item={item} prefs={prefs} color={color} leave={leaveStr || undefined} /></SelectableCard>;
          })}
        </div>
        {items.length === 0 && (
          <div className="border border-dashed border-black/40 p-6 text-center text-sm">
            {q ? <>No trips to “{q}” yet. <Link href={`/plan?to=${encodeURIComponent(q)}`} className="font-bold underline">Plan the first one</Link></> : "No trips yet."}
          </div>
        )}
        <Link href="/explore" className="flex items-center justify-between border border-black p-3 text-sm font-bold hover:bg-black hover:text-white">Browse every trip by theme <ArrowIcon /></Link>
        <p className="text-xs text-neutral-500">Click a route on the map or a card to focus it. Routes computed from MTA schedule data. Not affiliated with the MTA.</p>
      </aside>
    </main>
    </HomeShell>
  );
}
