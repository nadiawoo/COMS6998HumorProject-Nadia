"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import { CAMPUS, DEFAULT_PREFS, distanceKm, DESTINATIONS, HARD_TRANSFERS, tripFacts, type Prefs, type StopKind, type TripStop, type When } from "@/lib/transit";
import { fmtDay, fmtTime, nyHour, parseNy, serviceDay, sunTimes } from "@/lib/time";
import { daysText, EVENTS, eventsNear } from "@/lib/events";
import { routeOptions } from "@/lib/router";
import { assemble, buildWritePrompt, locatePlaces, MODEL, parseRidingNotes, writeTrip, type TripCard } from "@/lib/generate";

const DAILY_LIMIT = 10; // routes per user per 24h (protects the free Gemini quota)

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) throw error;
  redirect(data.url); // off to Google's sign-in screen
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();

  const updates: Record<string, unknown> = {
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
    // "How you ride" preferences
    max_walk_minutes: Math.min(30, Math.max(0, Number(formData.get("max_walk_minutes") ?? 15))),
    transfer_style: ["any", "same_station", "none"].includes(String(formData.get("transfer_style"))) ? String(formData.get("transfer_style")) : "any",
    avoid_transfers: formData.getAll("avoid_transfers").map(String).filter((id) => HARD_TRANSFERS.some((h) => h.id === id)),
  };

  // Photo goes to the "avatars" Storage bucket; only its URL is saved in the table
  const photo = formData.get("photo") as File | null;
  if (photo && photo.size > 0) {
    const path = `${user.id}/avatar`;
    const { error } = await supabase.storage.from("avatars").upload(path, photo, { upsert: true, contentType: photo.type });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    updates.profile_pic = `${data.publicUrl}?t=${Date.now()}`; // ?t= busts the browser cache
  }

  // Free-text riding habits -> AI turns them into settings (only when the text changed)
  const notes = String(formData.get("ride_notes") ?? "").trim().slice(0, 600);
  const { data: before } = await supabase.from("profiles").select("ride_notes").eq("id", user.id).maybeSingle();
  if (notes !== (before?.ride_notes ?? "")) {
    updates.ride_notes = notes;
    if (notes) {
      try {
        const t = await parseRidingNotes(notes, HARD_TRANSFERS);
        Object.assign(updates, { max_walk_minutes: t.max_walk_minutes, transfer_style: t.transfer_style, avoid_transfers: t.avoid_transfers, traits: { likes: t.likes, summary: t.summary } });
      } catch { /* keep the manual settings if the AI is unavailable */ }
    } else updates.traits = {};
  }

  // upsert = update your row, or create it if the trigger never made one
  const { error } = await supabase.from("profiles").upsert({ id: user.id, ...updates });
  if (error) throw new Error(`Saving profile failed: ${error.message}`);

  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

// ---------- Trip planning: code finds real routes, AI picks + writes ----------
export async function generateRoute(formData: FormData) {
  const { supabase, user } = await requireUser();
  const texts = formData.getAll("stop_text").map((t) => String(t).trim().slice(0, 80));
  const kinds = formData.getAll("stop_kind").map(String);
  const times = formData.getAll("stop_time").map(String);
  const startText = String(formData.get("start") ?? "").trim().slice(0, 80);
  const vibe = String(formData.get("vibe") ?? "Scenic views").slice(0, 40);
  const timeAvail = String(formData.get("time") ?? "Half day").slice(0, 20);
  // "Leaving at" is optional: blank = whenever (a reusable template, planned for weekend daytime service)
  const chosen = parseNy(String(formData.get("leave") ?? ""));
  const leaveAt = chosen ?? new Date();
  const when: When = chosen ? serviceDay(chosen) : "weekend";
  const wanted = texts.map((t, i) => ({ input: t, kind: (kinds[i] === "must" ? "must" : "explore") as StopKind, time: times[i] || undefined })).filter((x) => x.input).slice(0, 3);
  const back = `/plan?to=${encodeURIComponent(wanted[0]?.input ?? "")}`;
  const fail = (msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);
  if (wanted.length === 0) fail("Add at least one stop.");

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("routes").select("id", { count: "exact", head: true }).eq("created_by", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) fail(`You've planned ${DAILY_LIMIT} trips today — come back tomorrow!`);

  const { data: profile } = await supabase.from("profiles").select("max_walk_minutes, transfer_style, avoid_transfers, traits").eq("id", user.id).maybeSingle();
  const { traits, ...prefFields } = profile ?? {};
  const prefs: Prefs = { ...DEFAULT_PREFS, ...prefFields } as Prefs;
  const likes: string[] = (traits as { likes?: string[] } | null)?.likes ?? [];

  // 1) Where is everything? Starter destinations + campus are known; ask Gemini for the rest.
  const all = [{ input: startText, kind: "start" as StopKind, time: undefined as string | undefined }, ...wanted];
  const known = (t: string) => !t || /columbia|116/i.test(t) ? CAMPUS : [...DESTINATIONS, ...EVENTS].find((d) => d.name.toLowerCase() === t.toLowerCase());
  const unknown = all.filter((x) => !known(x.input)).map((x) => x.input);
  let locatePrompt = "";
  let located: { name: string; lat: number; lon: number; found: boolean }[] = [];
  if (unknown.length) {
    try { ({ prompt: locatePrompt, places: located } = await locatePlaces(unknown)); }
    catch (e) { fail(`The AI didn't answer (${e instanceof Error ? e.message : "error"}). Try again.`); }
  }
  const stops: TripStop[] = all.map((x) => {
    const k = known(x.input);
    const p = k ?? located[unknown.indexOf(x.input)];
    const inNyc = p && p.lat > 40.49 && p.lat < 40.92 && p.lon > -74.27 && p.lon < -73.68;
    if (!p || !inNyc || ("found" in p && !p.found)) fail(`Couldn't find "${x.input}" in NYC — try a more specific name.`);
    return { name: k ? k.name : p!.name || x.input, lat: p!.lat, lon: p!.lon, kind: x.kind, time: x.time, input: x.input };
  });

  // 2) Real routes for every part of the trip (Dijkstra over the subway map)
  // Search each part at the hour you'd actually be riding it (rough: previous part + an hour at each stop)
  let clock = leaveAt.getTime();
  const options = stops.slice(1).map((to, i) => {
    const opts = routeOptions(stops[i], to, prefs, when, chosen ? nyHour(new Date(clock)) : 13); // whenever: assume early afternoon
    clock += ((opts[0]?.minutes ?? 30) + (to.kind === "must" ? 0 : 60)) * 60000;
    return opts;
  });
  const missing = options.findIndex((o) => o.length === 0);
  if (missing >= 0) fail(`No route to ${stops[missing + 1].name} fits your walking/transfer preferences. Try loosening them in Profile.`);

  // 3) Gemini picks options and writes views, places and the vibe card
  const writePrompt = buildWritePrompt({
    stops, options, vibe, timeAvail, when, prefs, likes,
    leaving: chosen ? `${fmtDay(chosen)}, ${fmtTime(chosen)}` : "flexible — no set day or time (suggest the best time to go in best_time; frequencies shown are for weekend early afternoon)",
    sunset: chosen ? fmtTime(sunTimes(chosen).sunset) : `around ${fmtTime(sunTimes(new Date()).sunset)} this time of year`,
    events: chosen
      ? [...new Set(stops.slice(1).flatMap((st) => eventsNear(st, chosen)))].map((e) => `${e.name} (${e.area}, ${e.hours}) — ${e.note}`)
      : EVENTS.filter((e) => stops.slice(1).some((st) => distanceKm(st, e) < 1.5)).map((e) => `${e.name} (${daysText(e)}, ${e.hours}) — ${e.note}`),
  });
  let card: TripCard;
  try { card = await writeTrip(writePrompt); }
  catch (e) { return fail(`The AI didn't answer (${e instanceof Error ? e.message : "error"}). Try again.`); }
  const segments = assemble(options, card);

  const { data: row, error } = await supabase.from("routes").insert({
    destination: stops.slice(1).map((s) => s.name).join(" → "),
    vibe,
    prompt: [locatePrompt, writePrompt].filter(Boolean).join("\n\n---\n\n"),
    model: MODEL,
    card,
    facts: { version: 2, when, stops, segments, summary: tripFacts(segments), planned_leave: chosen?.toISOString() },
    prefs_used: prefs,
  }).select("id").single();
  if (error) return fail(`Saving failed: ${error.message}`);

  revalidatePath("/", "layout");
  redirect(`/routes/${row.id}`);
}

// ---------- Voting ----------
// kind "intent" = Would ride / Pass, kind "experience" = took it: recommend / don't
export async function vote(formData: FormData) {
  const { supabase, user } = await requireUser();
  const route_id = String(formData.get("route_id"));
  const kind = String(formData.get("kind")) === "experience" ? "experience" : "intent";
  const value = Number(formData.get("value")) === -1 ? -1 : 1;

  const { data: existing } = await supabase.from("votes").select("value").match({ route_id, user_id: user.id, kind }).maybeSingle();
  const { error } = existing?.value === value
    ? await supabase.from("votes").delete().match({ route_id, user_id: user.id, kind }) // clicking again removes your vote
    : await supabase.from("votes").upsert({ route_id, user_id: user.id, kind, value });
  if (error) throw new Error(`Vote failed: ${error.message}`);

  revalidatePath("/", "layout");
}
