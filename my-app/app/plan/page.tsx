import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { generateRoute } from "../actions";
import { viewerPrefs } from "@/lib/routes";
import { DESTINATIONS, HARD_TRANSFERS } from "@/lib/transit";
import { toNyInput } from "@/lib/time";
import { PlanForm } from "@/components/PlanForm";
import { daysText, EVENTS } from "@/lib/events";

export const maxDuration = 60; // planning calls Gemini — give the server action time on Vercel

// Logged-in only (proxy.ts)
export default async function Plan({ searchParams }: PageProps<"/plan">) {
  const { to, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const prefs = (await viewerPrefs(supabase, user!.id))!;
  const avoid = HARD_TRANSFERS.filter((h) => prefs.avoid_transfers.includes(h.id));

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plan a trip</h1>
        <p className="mt-1 text-neutral-600">We search every station, line and walk for real routes, then AI picks the best one and tells you what to see and eat along the way.</p>
      </div>
      {error && <p className="border-l-4 border-black bg-neutral-100 p-3 text-sm">{String(error)}</p>}
      <PlanForm action={generateRoute} initial={to ? String(to) : ""} places={[...EVENTS.map((e) => ({ name: e.name, tag: `${daysText(e)} · ${e.hours}`, days: e.days, months: e.months })), ...DESTINATIONS.map((d) => ({ name: d.name }))]} today={toNyInput(new Date())} />
      <p className="text-sm text-neutral-600">
        Using your preferences: walks up to {prefs.max_walk_minutes} min · transfers: {prefs.transfer_style.replace("_", " ")}
        {avoid.length > 0 && ` · avoiding ${avoid.map((a) => a.label.split(" (")[0]).join(", ")}`} · <Link href="/profile" className="underline">edit</Link>
      </p>
    </main>
  );
}
