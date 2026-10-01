import { createClient } from "@/lib/supabase";

// Members-only page: proxy.ts redirects logged-out visitors to /login
export default async function Members() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).single();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Members only 🐱</h1>
      <p>Welcome, {profile?.first_name ?? user!.email}! Only logged-in users can see this page.</p>
      {profile?.profile_pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.profile_pic} alt="Profile photo" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover" }} />
      )}
    </main>
  );
}
