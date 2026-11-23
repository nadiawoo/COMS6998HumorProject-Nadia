"use client";

import Link from "next/link";
import { startTransition, useOptimistic } from "react";
import { vote } from "@/app/actions";
import { CheckIcon, DownIcon, UpIcon } from "./Icons";
import type { FeedItem } from "@/lib/routes";

type Kind = "intent" | "experience";
type State = { scores: FeedItem["scores"]; myVotes: FeedItem["myVotes"] };

// Which count each vote adds to
const COUNT: Record<Kind, Record<"1" | "-1", "want" | "pass" | "rode_yes" | "rode_no">> = {
  intent: { "1": "want", "-1": "pass" },
  experience: { "1": "rode_yes", "-1": "rode_no" },
};

// Same rules as the server: clicking your current vote again removes it
function apply(s: State, { kind, value }: { kind: Kind; value: 1 | -1 }): State {
  const scores = { ...s.scores };
  const prev = s.myVotes[kind];
  if (prev === 1 || prev === -1) scores[COUNT[kind][String(prev) as "1" | "-1"]] -= 1;
  const removing = prev === value;
  if (!removing) scores[COUNT[kind][String(value) as "1" | "-1"]] += 1;
  return { scores, myVotes: { ...s.myVotes, [kind]: removing ? undefined : value } };
}

// Small voting row for the cards on Explore. The count changes the moment you click;
// the vote is saved in the background (and undone on screen if saving fails).
export function CardVotes({ id, scores, myVotes, signedIn }: State & { id: string; signedIn: boolean }) {
  const [s, change] = useOptimistic<State, { kind: Kind; value: 1 | -1 }>({ scores, myVotes }, apply);
  const riders = s.scores.rode_yes + s.scores.rode_no;

  const cast = (kind: Kind, value: 1 | -1) => startTransition(async () => {
    change({ kind, value });
    const f = new FormData();
    f.set("route_id", id); f.set("kind", kind); f.set("value", String(value));
    try { await vote(f); } catch { /* the optimistic count rolls back on its own */ }
  });

  const btn = (kind: Kind, value: 1 | -1, label: React.ReactNode, title: string) => {
    const active = s.myVotes[kind] === value;
    const cls = `flex items-center gap-1 border px-2 py-1 text-xs font-medium ${active ? "border-black bg-black text-white" : "border-black/20 hover:border-black"}`;
    return signedIn
      ? <button type="button" onClick={() => cast(kind, value)} aria-pressed={active} title={title} className={cls}>{label}</button>
      : <Link href="/login" title="Log in to vote" className={cls}>{label}</Link>;
  };

  return (
    <div className="space-y-2 border-t border-black/10 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {btn("intent", 1, <><UpIcon size={13} /> Would ride <span className="tabular-nums">{s.scores.want}</span></>, "I'd take this trip")}
        {btn("intent", -1, <><DownIcon size={13} /> Pass <span className="tabular-nums">{s.scores.pass}</span></>, "Not for me")}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <span>Taken it?</span>
        {btn("experience", 1, <><CheckIcon size={13} /> Recommend</>, "I took it and recommend it")}
        {btn("experience", -1, <>Wouldn&apos;t</>, "I took it and wouldn't recommend it")}
        {riders > 0 && <span>{s.scores.rode_yes} of {riders} recommend</span>}
      </div>
    </div>
  );
}
