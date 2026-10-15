import { LoadingBar } from "@/components/LoadingBar";

// Shown while any page is loading (Next.js wraps every page in this automatically)
export default function Loading() {
  return (
    <div className="sticky top-16 z-[900]">
      <LoadingBar />
      <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>
    </div>
  );
}
