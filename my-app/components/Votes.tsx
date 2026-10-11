import { vote } from "@/app/actions";
import { CheckIcon, DownIcon, UpIcon } from "./Icons";
import type { FeedItem } from "@/lib/routes";

function VoteButton({ id, kind, value, active, children }: { id: string; kind: string; value: number; active: boolean; children: React.ReactNode }) {
  return (
    <form action={vote}>
      <input type="hidden" name="route_id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={value} />
      <button className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium ${active ? "border-black bg-black text-white" : "border-black/20 hover:border-black"}`}>
        {children}
      </button>
    </form>
  );
}

// Main vote: would you take it? Smaller: did you take it?
export function Votes({ item }: { item: FeedItem }) {
  const { scores, myVotes } = item;
  const riders = scores.rode_yes + scores.rode_no;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <VoteButton id={item.id} kind="intent" value={1} active={myVotes.intent === 1}><UpIcon /> Would ride <span className="tabular-nums">{scores.want}</span></VoteButton>
        <VoteButton id={item.id} kind="intent" value={-1} active={myVotes.intent === -1}><DownIcon /> Pass <span className="tabular-nums">{scores.pass}</span></VoteButton>
      </div>
      <details className="summary-inline text-sm" open={myVotes.experience !== undefined}>
        <summary className="cursor-pointer text-neutral-500 underline-offset-2 hover:underline">
          Taken this route?{riders > 0 && <span> · {scores.rode_yes} of {riders} riders recommend</span>}
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <VoteButton id={item.id} kind="experience" value={1} active={myVotes.experience === 1}><CheckIcon /> I recommend it</VoteButton>
          <VoteButton id={item.id} kind="experience" value={-1} active={myVotes.experience === -1}>Wouldn&apos;t recommend</VoteButton>
        </div>
      </details>
    </div>
  );
}
