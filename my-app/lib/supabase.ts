import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for server components, server actions and route handlers.
// It reads/writes the login session from cookies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components can't set cookies; proxy.ts refreshes the session instead.
          }
        },
      },
    }
  );
}
