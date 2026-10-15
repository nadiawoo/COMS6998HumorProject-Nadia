// Thin bar that slides across the top while a page loads (pure CSS, see .loading-bar in globals.css)
export function LoadingBar({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="loading-bar relative h-1 w-full overflow-hidden bg-neutral-200">
      <span className="absolute inset-y-0 w-1/3 bg-black" />
    </div>
  );
}
