import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase";

// Google sends the user back here with a ?code= after they sign in
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const supabase = await createClient();

  if (!code || (await supabase.auth.exchangeCodeForSession(code)).error) {
    return NextResponse.redirect(`${origin}/login?error=1`);
  }

  // Signup rules from the admin area (allowed domains + whitelisted emails). If the check isn't
  // installed yet (no week6.sql), everyone is let in, as before.
  const { data: allowed, error: ruleError } = await supabase.rpc("signup_allowed");
  if (!ruleError && allowed === false) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  // Missing first or last name? Send them to fill it in first.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user!.id)
    .maybeSingle();

  const needsName = !profile?.first_name || !profile?.last_name;
  return NextResponse.redirect(`${origin}${needsName ? "/profile" : "/"}`);
}
