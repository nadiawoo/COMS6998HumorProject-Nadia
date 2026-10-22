import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { viewerPrefs, withScores, type RouteRow } from "@/lib/routes";
import { MOODS, themeOf } from "@/lib/themes";
import { isDark, serviceDay, toNyInput } from "@/lib/time";
import { luckyNew } from "../actions";
import { logActivity } from "@/lib/activity";
import { RouteCard } from "@/components/RouteCard";
import { SubmitButton } from "@/components/SubmitButton";
import { ArrowIcon } from "@/components/Icons";

export const maxDuration = 300; // "Make me a new one" calls Gemini, which can be slow

// Feeling lucky (logged-in only): pick a mood, draw a random trip that fits — or have a new one made.
export default async function Lucky({ searchParams }: PageProps<"/lucky">) {
  const sp = await searchParams;
  const mood = MOODS.find((m) => m.id === sp.mood);
  const now = sp.when === "now";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const prefs = await viewerPrefs(supabase, user?.id);
  const link = (m: string, w: boolean) => `/lucky?mood=${m}${w ? "&when=now" : ""}`;

  // Draw: trips of this mood's theme (for "now": planned for today's kind of service), better-rated ones more likely
  let drawn = null, pool = 0;
  if (mood) {
    await logActivity(supabase, { kind: "lucky", term: mood.label }); // for the admin "moods drawn" stats
    const { data } = await supabase.from("routes").select("*").order("created_at", { ascending: false }).limit(300);
    let items = (await withScores(supabase, (data ?? []) as RouteRow[], user?.id)).filter((i) => themeOf(i) === mood.theme);
    if (now) items = items.filter((i) => i.facts.when === serviceDay(new Date()));
    if (items.length > 1) items = items.filter((i) => i.id !== sp.skip); // "Draw again" never repeats the last one
    pool = items.length;
    const weights = items.map((i) => Math.max(1, 1 + i.scores.score));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    drawn = items.find((_, k) => (r -= weights[k]) < 0) ?? null;
  }
  const leave = now ? toNyInput(new Date()) : undefined;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feeling lucky</h1>
        <p className="mt-1 text-neutral-600">Pick a mood. We&apos;ll draw a trip for you.</p>
      </div>

      <div className="grid grid-cols-2 border border-black">
        <Link href={mood ? link(mood.id, false) : "/lucky"} className={`py-2.5 text-center text-sm font-bold ${!now ? "bg-black text-white" : "hover:bg-neutral-100"}`}>Anytime</Link>
        <Link href={mood ? link(mood.id, true) : "/lucky?when=now"} className={`border-l border-black py-2.5 text-center text-sm font-bold ${now ? "bg-black text-white" : "hover:bg-neutral-100"}`}>Going now</Link>
      </div>
      {now && isDark(new Date()) && <p className="text-sm text-neutral-600">It&apos;s dark out — views will be city lights.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MOODS.map((m) => (
          <Link key={m.id} href={link(m.id, now)} className={`border p-4 ${mood?.id === m.id ? "border-black bg-black text-white" : "border-black/25 hover:border-black"}`}>
            <span className="block text-lg font-bold">{m.label}</span>
            <span className={`text-sm ${mood?.id === m.id ? "text-neutral-300" : "text-neutral-500"}`}>{m.line}</span>
          </Link>
        ))}
      </div>

      {sp.error && <p className="border-l-4 border-black bg-neutral-100 p-3 text-sm">{String(sp.error)}</p>}

      {mood && (
        <section className="space-y-3">
          {drawn ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">You drew · 1 of {pool} {mood.label.toLowerCase()} trips</p>
              <RouteCard item={drawn} prefs={prefs} leave={leave} />
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/routes/${drawn.id}${leave ? `?leave=${leave}` : ""}`} className="flex items-center justify-center gap-2 bg-black py-3 font-bold text-white">Take this trip <ArrowIcon /></Link>
                <Link href={`${link(mood.id, now)}&skip=${drawn.id}&r=${Date.now()}`} className="flex items-center justify-center border border-black py-3 font-bold hover:bg-neutral-100">Draw again</Link>
              </div>
            </>
          ) : (
            <p className="border border-dashed border-black/40 p-4 text-sm">No {mood.label.toLowerCase()} trips{now ? " for today" : ""} yet — have one made.</p>
          )}
          <form action={luckyNew} className="space-y-2">
            <input type="hidden" name="mood" value={mood.id} />
            <input type="hidden" name="when" value={now ? "now" : "anytime"} />
            <SubmitButton pending="Picking a place" steps={[{ at: 0, label: "Picking a place" }, { at: 3, label: "Searching every subway route" }, { at: 6, label: "AI is picking the best route" }, { at: 20, label: "Writing views and food stops" }, { at: 40, label: "Putting your trip together" }, { at: 70, label: "Almost there" }]} expected={45}>Make me a new one</SubmitButton>
            <p className="text-xs text-neutral-500">Picks a random {mood.label.toLowerCase()} spot and plans it from 116 St with your riding preferences.</p>
          </form>
        </section>
      )}
    </main>
  );
}
