"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export type Step = { at: number; label: string }; // seconds after submitting -> what we're probably doing

// Big black button. While its form's server action runs it turns into a progress bar.
// The server can't report real progress mid-request, so the bar follows how long this usually
// takes (`expected` seconds): it moves fast at first, slows down, and never claims 100% until done.
export function SubmitButton({ children, pending, steps, expected = 45 }: {
  children: React.ReactNode; pending: string; steps?: Step[]; expected?: number;
}) {
  const { pending: busy } = useFormStatus();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) / 1000), 250);
    return () => { clearInterval(id); setT(0); };
  }, [busy]);

  if (!busy) return <button className="w-full bg-black px-5 py-4 text-lg font-bold text-white">{children}</button>;

  const p = Math.min(0.96, 1 - Math.exp(-t / (expected / 2))); // ~86% at the expected time
  const label = [...(steps ?? [])].reverse().find((s) => t >= s.at)?.label ?? pending;
  const mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <div className="relative h-14 w-full overflow-hidden border-2 border-black bg-white">
        <div className="absolute inset-y-0 left-0 bg-black transition-[width] duration-300 ease-out" style={{ width: `${p * 100}%` }} />
        <p className="relative flex h-full items-center justify-between px-4 font-bold text-white mix-blend-difference">
          <span>{label}</span><span className="tabular-nums">{Math.round(p * 100)}%</span>
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        {mmss} · usually about {expected < 60 ? `${expected} seconds` : `${Math.round(expected / 60)} minute${expected >= 90 ? "s" : ""}`}
        {t > expected * 1.5 ? " — the AI is slow right now, still working" : ". Keep this tab open."}
      </p>
    </div>
  );
}

// The steps a trip goes through on the server (timings are typical, not measured live)
export const PLAN_STEPS: Step[] = [
  { at: 0, label: "Finding your places" },
  { at: 3, label: "Searching every subway route" },
  { at: 6, label: "AI is picking the best route" },
  { at: 20, label: "Writing views and food stops" },
  { at: 40, label: "Putting your trip together" },
  { at: 70, label: "Almost there" },
];
