import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { PinIcon } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Journey",
  description: "Because the journey is what matters. Real subway routes from 116 St, planned by code, written by AI, rated by students.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("first_name, profile_pic").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        {/* Header styled like a station sign; links change when logged in (gated UI) */}
        <header className="sign sticky top-0 z-[1000]">
          <div className="flex h-16 items-center gap-4 px-4 pt-1">
            <Link href="/" className="mr-auto text-xl font-bold tracking-tight">Journey <span className="text-sm font-normal text-neutral-400">from 116 St</span></Link>
            {user ? (
              <>
                <Link href="/my-routes" className="hidden text-sm sm:block">My routes</Link>
                <Link href="/plan" className="flex items-center gap-1.5 bg-white px-4 py-2 text-sm font-bold text-black"><PinIcon size={16} /> Plan a trip</Link>
                <Link href="/profile" aria-label="Profile">
                  {profile?.profile_pic
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={profile.profile_pic} alt="" className="h-9 w-9 rounded-full border border-white object-cover" />
                    : <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white text-sm font-bold">{(profile?.first_name ?? user.email ?? "?")[0].toUpperCase()}</span>}
                </Link>
              </>
            ) : (
              <Link href="/login" className="bg-white px-4 py-2 text-sm font-bold text-black">Log in</Link>
            )}
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
