import { lineColor } from "@/lib/transit";

// Round MTA-style line badge, e.g. (1) (J)
export function LineBullet({ line, size = 28 }: { line: string; size?: number }) {
  const { bg, fg } = lineColor(line);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ background: bg, color: fg, width: size, height: size, fontSize: size * 0.6, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
      aria-label={`${line} train`}
    >
      {line}
    </span>
  );
}
