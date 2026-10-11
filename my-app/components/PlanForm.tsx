"use client";

import { useState } from "react";
import { PinIcon, PlusIcon } from "./Icons";
import { SubmitButton } from "./SubmitButton";

type Row = { text: string; kind: "explore" | "must"; time: string };
const chip = "cursor-pointer border border-black/25 px-3 py-1.5 text-sm has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white";

// Multi-stop trip form: up to 3 stops, each "explore" or "need to be there (by a time)"
export type Place = { name: string; tag?: string; days?: number[]; months?: number[] };

export function PlanForm({ action, initial, places, vibes, defaultLeave }: {
  action: (fd: FormData) => void; initial: string; places: Place[]; vibes: string[]; defaultLeave: string;
}) {
  const [leave, setLeave] = useState(defaultLeave);
  // Is a recurring event on during the chosen day? (date part of the datetime-local value)
  const d = leave ? new Date(`${leave.slice(0, 10)}T12:00`) : null;
  const onThatDay = (p: Place) => !!d && !!p.days && p.days.includes(d.getDay()) && !!p.months?.includes(d.getMonth() + 1);
  const happening = places.filter(onThatDay);
  const addStop = (name: string) => {
    const empty = rows.findIndex((r) => !r.text);
    if (empty >= 0) set(empty, { text: name });
    else if (rows.length < 3) setRows([...rows, { text: name, kind: "explore", time: "" }]);
  };
  const [rows, setRows] = useState<Row[]>([{ text: initial, kind: "explore", time: "" }]);
  const [open, setOpen] = useState<number | null>(null); // which stop's suggestion list is showing
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-6">

      <section className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">From</label>
        <input name="start" placeholder="116 St – Columbia University" className="w-full border border-black/25 px-4 py-3 focus:border-black focus:outline-none" />
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Stops</p>
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 border border-black p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-black text-sm font-bold text-white">{i + 1}</span>
              <div className="relative w-full">
                <input name="stop_text" required autoComplete="off" value={r.text} maxLength={80}
                  onChange={(e) => { set(i, { text: e.target.value }); setOpen(i); }}
                  onFocus={() => setOpen(i)} onBlur={() => setTimeout(() => setOpen(null), 120)}
                  placeholder={i === 0 ? "Where to? e.g. DUMBO" : "Then where?"} className="w-full border-b border-black/25 px-1 py-2 focus:border-black focus:outline-none" />
                {/* Our own suggestion list (the browser's built-in one can't be styled) */}
                {open === i && (() => {
                  const q = r.text.toLowerCase();
                  const hits = places.filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
                    .sort((a, b) => Number(onThatDay(b)) - Number(onThatDay(a))).slice(0, 8);
                  return hits.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-20 mt-1 border border-black bg-white shadow-[4px_4px_0_#000]">
                      {hits.map((p) => (
                        <li key={p.name}>
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); set(i, { text: p.name }); setOpen(null); }}
                            className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black hover:text-white">
                            <span className="flex-1">{p.name}</span>
                            {onThatDay(p) && <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase text-white group-hover:bg-white group-hover:text-black">On your date</span>}
                            {p.tag && <span className="text-xs text-neutral-500 group-hover:text-neutral-300">{p.tag}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
              {rows.length > 1 && <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="px-2 text-sm text-neutral-500">Remove</button>}
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-9">
              <input type="hidden" name="stop_kind" value={r.kind} />
              <button type="button" onClick={() => set(i, { kind: "explore" })} className={`border px-3 py-1 text-sm ${r.kind === "explore" ? "border-black bg-black text-white" : "border-black/25"}`}>Explore</button>
              <button type="button" onClick={() => set(i, { kind: "must" })} className={`border px-3 py-1 text-sm ${r.kind === "must" ? "border-black bg-black text-white" : "border-black/25"}`}>Need to be there</button>
              {r.kind === "must" && <label className="flex items-center gap-1 text-sm">by <input type="time" value={r.time} onChange={(e) => set(i, { time: e.target.value })} className="border border-black/25 px-2 py-1" /></label>}
              <input type="hidden" name="stop_time" value={r.kind === "must" ? r.time : ""} />
            </div>
          </div>
        ))}
        {happening.length > 0 && (
          <div className="space-y-2 border-l-4 border-black pl-3">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Happening on your date</p>
            <div className="flex flex-wrap gap-2">
              {happening.map((p) => (
                <button key={p.name} type="button" onClick={() => addStop(p.name)} className="border border-black px-3 py-1.5 text-left text-sm hover:bg-black hover:text-white">
                  <span className="font-bold">{p.name}</span> <span className="text-neutral-500">{p.tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {rows.length < 3 && (
          <button type="button" onClick={() => setRows([...rows, { text: "", kind: "explore", time: "" }])} className="flex items-center gap-2 text-sm font-bold">
            <PlusIcon size={16} /> Add another stop
          </button>
        )}
      </section>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">Vibe</legend>
        <div className="flex flex-wrap gap-2">
          {vibes.map((v, i) => <label key={v} className={chip}><input type="radio" name="vibe" value={v} defaultChecked={i === 0} className="sr-only" />{v}</label>)}
        </div>
      </fieldset>

      <div className="grid gap-5">
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-widest text-neutral-500">Leaving at</span>
          <div className="flex gap-2">
            <input type="datetime-local" name="leave" value={leave} onChange={(e) => setLeave(e.target.value)} className="min-w-0 flex-1 border border-black/25 bg-white px-3 py-2.5" />
            <button type="button" onClick={() => setLeave("")} className={`border px-3 text-sm ${leave ? "border-black/25" : "border-black bg-black text-white"}`}>Whenever</button>
          </div>
          <span className="block text-xs text-neutral-500">{leave ? "Trains, frequencies and events are checked for this time." : "No set time: you'll get a reusable trip and can pick a time on its page later."}</span>
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">Time you have</legend>
          <div className="flex flex-wrap gap-2">
            {["About 1 hour", "Half day", "Whole day"].map((t) => <label key={t} className={chip}><input type="radio" name="time" value={t} defaultChecked={t === "Half day"} className="sr-only" />{t}</label>)}
          </div>
        </fieldset>
      </div>

      <SubmitButton pending="Finding real routes, then writing your trip…">
        <span className="flex items-center justify-center gap-2"><PinIcon size={18} /> Plan my trip</span>
      </SubmitButton>
    </form>
  );
}
