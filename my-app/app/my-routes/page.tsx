import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { viewerPrefs, withScores, type RouteRow } from "@/lib/routes";
import { RouteCard } from "@/components/RouteCard";
import { PinIcon } from "@/components/Icons";

const tabCls = (on: boolean) => `px-3 py-1.5 text-sm font-bold ${on ? "bg-black text-white" : "border border-black/20 hover:border-black"}`;

// Logged-in only (proxy.ts)
export default async function MyRoutes({ searchParams }: PageProps<"/my-routes">) {
  const { tab } = await searchParams;
  const liked = tab === "liked";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let rows: RouteRow[] = [];
  if (liked) {
    const { data: votes } = await supabase.from("votes").select("route_id").eq("value", 1); // RLS: only my votes
    const ids = [...new Set((votes ?? []).map((v) => v.route_id))];
    if (ids.length) rows = ((await supabase.from("routes").select("*").in("id", ids)).data ?? []) as RouteRow[];
  } else {
    rows = ((await supabase.from("routes").select("*").eq("created_by", user!.id).order("created_at", { ascending: false })).data ?? []) as RouteRow[];
  }
  const items = await withScores(supabase, rows, user!.id);
  const prefs = await viewerPrefs(supabase, user!.id);

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">My routes</h1>
        <Link href="/plan" className="flex items-center gap-2 bg-black px-5 py-3 font-bold text-white"><PinIcon size={18} /> Plan a new trip</Link>
      </div>
      <nav className="flex gap-2">
        <Link href="/my-routes" className={tabCls(!liked)}>Planned by me</Link>
        <Link href="/my-routes?tab=liked" className={tabCls(liked)}>Saved (upvoted)</Link>
      </nav>
      <div className="grid gap-4 md:grid-cols-2">{items.map((item) => <RouteCard key={item.id} item={item} prefs={prefs} />)}</div>
      {items.length === 0 && <p className="text-neutral-600">Nothing here yet.</p>}
    </main>
  );
}
