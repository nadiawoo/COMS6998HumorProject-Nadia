import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { rankedRoutes, viewerPrefs, withScores, type FeedItem, type RouteRow } from "@/lib/routes";
import { THEMES, themeOf } from "@/lib/themes";
import { RouteCard } from "@/components/RouteCard";
import { ArrowIcon } from "@/components/Icons";

// Explore: every trip as a card, grouped by theme. Logged-out visitors only see the community favorites.
export default async function Explore() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const prefs = await viewerPrefs(supabase, user?.id);

  const favorites = (await withScores(supabase, await rankedRoutes(supabase, undefined, 12), user?.id)).filter((i) => i.scores.score > 0).slice(0, 6);
  let groups: { theme: string; items: FeedItem[] }[] = [];
  if (user) {
    const { data } = await supabase.from("routes").select("*").order("created_at", { ascending: false }).limit(200);
    const items = (await withScores(supabase, (data ?? []) as RouteRow[], user.id)).sort((a, b) => b.scores.score - a.scores.score);
    groups = THEMES.map((theme) => ({ theme, items: items.filter((i) => themeOf(i) === theme) })).filter((g) => g.items.length);
  }
  const sections = [{ theme: "Columbia favorites", items: favorites, note: "Most-recommended by students" }, ...groups.map((g) => ({ ...g, note: "" }))].filter((g) => g.items.length);
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Explore trips</h1>
        <p className="text-neutral-600">Every trip from 116 St, sorted by what it&apos;s for. Times include the ride and time at each stop.</p>
        <nav className="flex flex-wrap gap-2">
          {sections.map((g) => (
            <a key={g.theme} href={`#${slug(g.theme)}`} className="border border-black/25 px-3 py-1.5 text-sm font-bold hover:border-black">{g.theme} <span className="font-normal text-neutral-500">{g.items.length}</span></a>
          ))}
          <Link href="/lucky" className="bg-black px-3 py-1.5 text-sm font-bold text-white">Feeling lucky</Link>
        </nav>
      </div>

      {sections.map((g) => (
        <section key={g.theme} id={slug(g.theme)} className="scroll-mt-20 space-y-3">
          <div className="sign flex items-baseline gap-3 px-4 pb-2 pt-3">
            <h2 className="text-lg font-bold">{g.theme}</h2>
            {g.note && <span className="text-sm text-neutral-400">{g.note}</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {g.items.map((item) => <RouteCard key={item.id} item={item} prefs={prefs} compact />)}
          </div>
        </section>
      ))}

      {sections.length === 0 && <p className="border border-dashed border-black/40 p-6 text-center text-sm">No trips yet.</p>}
      {!user && (
        <Link href="/login" className="flex items-center justify-between border border-black p-4 hover:bg-black hover:text-white">
          <span><b>Log in</b> to browse every theme, plan trips and vote.</span><ArrowIcon />
        </Link>
      )}
    </main>
  );
}
