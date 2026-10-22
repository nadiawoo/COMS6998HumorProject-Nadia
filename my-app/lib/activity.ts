import type { SupabaseClient } from "@supabase/supabase-js";

// Anonymous-safe usage log for the admin dashboard (table: activity, see supabase/activity.sql).
// Write-only from Journey: nobody but superadmins can read it. Never blocks or breaks a page.
export async function logActivity(supabase: SupabaseClient, row: { kind: "view" | "search" | "plan" | "lucky"; route_id?: string; term?: string }) {
  try {
    await supabase.from("activity").insert({ ...row, term: row.term?.trim().toLowerCase().slice(0, 80) || null });
  } catch { /* logging is best-effort */ }
}
