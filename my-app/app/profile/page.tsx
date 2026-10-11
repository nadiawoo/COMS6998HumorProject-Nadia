import { createClient } from "@/lib/supabase";
import { signOut, updateProfile } from "../actions";
import { DEFAULT_PREFS, HARD_TRANSFERS } from "@/lib/transit";
import { PhotoInput } from "@/components/PhotoInput";

const input = "w-full border border-black/25 px-4 py-3 focus:border-black focus:outline-none";
const label = "block text-xs font-bold uppercase tracking-widest text-neutral-500";

// Protected by proxy.ts
export default async function Profile({ searchParams }: PageProps<"/profile">) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
  const p = { ...DEFAULT_PREFS, ...(profile ?? {}) };
  const needsName = !profile?.first_name || !profile?.last_name;
  const traits = profile?.traits as { summary?: string; likes?: string[] } | null;
  const initials = `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      {needsName && <p className="bg-black p-4 text-white">Welcome. Add your name and tell us how you like to ride — every trip is planned around it.</p>}
      {saved && <p className="border-l-4 border-black bg-neutral-100 p-3 text-sm">Saved.</p>}

      <form action={updateProfile} className="space-y-8">
        <section className="space-y-5">
          <PhotoInput current={profile?.profile_pic} initials={initials} />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className={label}>First name</span><input name="first_name" defaultValue={profile?.first_name ?? ""} required className={input} /></label>
            <label className="space-y-1"><span className={label}>Last name</span><input name="last_name" defaultValue={profile?.last_name ?? ""} required className={input} /></label>
          </div>
        </section>

        {/* Personal routing preferences — the route search obeys these */}
        <section className="space-y-5 border border-black p-5">
          <h2 className="sign -mx-5 -mt-5 px-5 pb-3 pt-4 text-lg font-bold">How you ride</h2>
          {/* Free text -> AI turns it into the settings below + habits to plan around */}
          <label className="block space-y-2">
            <span className={label}>In your own words</span>
            <textarea name="ride_notes" rows={4} defaultValue={profile?.ride_notes ?? ""} maxLength={600} className={input}
              placeholder="e.g. I'll happily walk 15–20 min instead of a long transfer. The 1↔2 at 96th is fine, but I hate the Times Sq transfer to the Q and 14th St 1↔L. I always grab a coffee on the way and love bakeries." />
            <span className="block text-xs text-neutral-500">When you save, AI turns this into the settings below. You can still adjust them by hand.</span>
          </label>
          {traits?.summary && (
            <div className="bg-neutral-100 p-3 text-sm">
              <p className="font-bold">What we picked up</p>
              <p>{traits.summary}</p>
              {traits.likes?.length ? <p className="mt-1">Planned around: {traits.likes.join(", ")}</p> : null}
            </div>
          )}
          <div className="space-y-2">
            <span className={label}>Longest walk to skip an annoying transfer</span>
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15, 20, 25, 30].map((m) => (
                <label key={m} className="cursor-pointer border border-black/25 px-3 py-1.5 text-sm has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white">
                  <input type="radio" name="max_walk_minutes" value={m} defaultChecked={p.max_walk_minutes === m} className="sr-only" />{m === 0 ? "No walking" : `${m} min`}
                </label>
              ))}
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className={label}>Transfers</legend>
            {[["any", "Don't mind transfers"], ["same_station", "Only easy ones in the same station (like 1 ↔ 2)"], ["none", "No transfers — I'd rather walk between stations"]].map(([v, t]) => (
              <label key={v} className="flex items-center gap-3"><input type="radio" name="transfer_style" value={v} defaultChecked={p.transfer_style === v} className="h-4 w-4 accent-black" /> {t}</label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className={label}>Transfers I avoid</legend>
            {HARD_TRANSFERS.map((h) => (
              <label key={h.id} className="flex items-center gap-3 text-sm"><input type="checkbox" name="avoid_transfers" value={h.id} defaultChecked={p.avoid_transfers.includes(h.id)} className="h-4 w-4 accent-black" /> {h.label}</label>
            ))}
          </fieldset>
        </section>

        <button className="w-full bg-black px-5 py-4 text-lg font-bold text-white">Save</button>
      </form>
      <form action={signOut}><button className="text-sm underline">Log out</button></form>
    </main>
  );
}
