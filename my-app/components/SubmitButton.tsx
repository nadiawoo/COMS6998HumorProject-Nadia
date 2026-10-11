"use client";
import { useFormStatus } from "react-dom";

// Big black button that shows a loading label while its form's server action runs
export function SubmitButton({ children, pending }: { children: React.ReactNode; pending: string }) {
  const status = useFormStatus();
  return (
    <button disabled={status.pending} className="w-full bg-black px-5 py-4 text-lg font-bold text-white disabled:opacity-60">
      {status.pending ? pending : children}
    </button>
  );
}
