import Link from "next/link";
import { LineBullet } from "./LineBullet";
import { StarIcon, WalkIcon } from "./Icons";
import { hrs, outingMinutes, themeOf } from "@/lib/themes";
import { Votes } from "./Votes";
import { fitFor, type Prefs } from "@/lib/transit";
import type { FeedItem } from "@/lib/routes";

// Compact template card for feeds (durations, no clock times). `color` matches the route's line on the map.
export function RouteCard({ item, prefs, color, leave, compact = false }: { item: FeedItem; prefs: Prefs | null; color?: string; leave?: string; compact?: boolean }) {
  const { card, facts } = item;
  const s = facts.summary;
  const issues = prefs ? fitFor(facts.segments, prefs) : [];
  const legs = facts.segments.flatMap((seg) => seg.legs).filter((l) => l.type === "ride" || l.minutes >= 5);
  const href = `/routes/${item.id}${leave ? `?leave=${encodeURIComponent(leave)}` : ""}`;

  return (
    <article className="border border-black" style={color ? { borderLeft: `6px solid ${color}` } : undefined}>
      <Link href={href} className="sign flex items-center gap-2 px-4 pb-3 pt-4">
        {legs.map((l, i) => l.type === "ride"
          ? <LineBullet key={i} line={l.line} size={26} />
          : <WalkIcon key={i} size={20} className="text-white" />)}
        <span className="ml-auto text-sm font-medium tabular-nums">{s.minutes} min ride</span>
      </Link>
      <div className="space-y-3 p-4">
        <Link href={href} className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{themeOf(item)} · {hrs(outingMinutes(item))} out{leave ? "" : ` · ${facts.when}`}</p>
          <h2 className="mt-1 text-xl font-bold leading-tight tracking-tight">{card.title}</h2>
          <p className="mt-1 text-neutral-600">{card.hook}</p>
        </Link>
        {/* Every stop of the trip */}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {facts.stops.slice(1).map((st, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <StarIcon size={15} color={color ?? "#000"} />
              <span>{st.name}</span>
              {st.kind === "must" && st.time && <span className="text-neutral-500">by {st.time}</span>}
            </li>
          ))}
        </ol>
        {!compact && <p className="text-sm text-neutral-700">
          {[s.aboveGround ? `${s.aboveGround} stop${s.aboveGround > 1 ? "s" : ""} above ground` : s.bridges.length ? "" : "Underground", ...s.bridges, s.transfers ? `${s.transfers} transfer${s.transfers > 1 ? "s" : ""}` : "No transfers"].filter(Boolean).join("  ·  ")}
        </p>}
        {prefs && <p className="text-sm font-medium">{issues.length ? `Not your style: ${issues.join(", ")}` : "Fits how you ride"}</p>}
        {!compact && <Votes item={item} />}
      </div>
    </article>
  );
}
