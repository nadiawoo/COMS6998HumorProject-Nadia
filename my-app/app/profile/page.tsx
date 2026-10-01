import { createClient } from "@/lib/supabase";
import { updateProfile } from "../actions";

// Protected by proxy.ts
export default async function Profile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();

  const needsName = !profile?.first_name || !profile?.last_name;

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Profile</h1>
      {needsName && <p style={{ color: "orange" }}>Welcome! Please add your first and last name to continue.</p>}

      {profile?.profile_pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.profile_pic} alt="Profile photo" width={120} height={120} style={{ borderRadius: "50%", objectFit: "cover" }} />
      )}

      <form action={updateProfile} style={{ display: "grid", gap: "0.75rem", maxWidth: 320, marginTop: "1rem" }}>
        <label>First name <input name="first_name" defaultValue={profile?.first_name ?? ""} required /></label>
        <label>Last name <input name="last_name" defaultValue={profile?.last_name ?? ""} required /></label>
        <label>Photo <input name="photo" type="file" accept="image/*" /></label>
        <button>Save</button>
      </form>
    </main>
  );
}
