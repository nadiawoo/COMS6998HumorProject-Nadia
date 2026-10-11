import { LineBullet } from "./LineBullet";
import type { FeedItem } from "@/lib/routes";

// AI-written "poster" for the trip, typeset like a vintage transit poster
export function VibeCard({ item }: { item: FeedItem }) {
  const v = item.card.vibe;
  const stops = item.facts.stops;
  return (
    <figure className="relative aspect-[4/5] w-full overflow-hidden bg-black p-6 text-white sm:aspect-[16/10]">
      <div className="absolute inset-x-0 top-3 h-px bg-white" />
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-neutral-400">Journey · {stops[0]?.name.split(" (")[0]} to {stops[stops.length - 1]?.name}</p>
      <h2 className="mt-6 text-4xl font-bold leading-[0.95] tracking-tight sm:text-6xl">{v?.headline}</h2>
      <p className="mt-4 max-w-md text-lg text-neutral-300">{v?.subline}</p>
      <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
        <p className="text-sm font-bold uppercase tracking-[0.25em]">{(v?.words ?? []).join("  /  ")}</p>
        <div className="flex gap-1.5">{item.facts.summary.lines.map((l) => <LineBullet key={l} line={l} size={30} />)}</div>
      </div>
      <figcaption className="sr-only">AI-written trip poster</figcaption>
    </figure>
  );
}
