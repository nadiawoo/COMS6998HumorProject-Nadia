import { createClient } from "@/lib/supabase";

// Members-only page: proxy.ts redirects logged-out visitors to /login
export default async function Members() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Your saved profile (from the "profiles" table)
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("*").eq("id", user!.id).maybeSingle();

  // 5 random cats (from "main_table")
  const { data: cats, error: catsError } = await supabase.from("main_table").select("*");
  const rows = [...(cats ?? [])].sort(() => Math.random() - 0.5).slice(0, 5);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Members only 🐱</h1>

      <h2>Your profile</h2>
      {profileError && <p style={{ color: "red" }}>Profile error: {profileError.message}</p>}
      {!profileError && !profile && <p style={{ color: "red" }}>No profile row found for your account.</p>}
      {profile && (
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {profile.profile_pic && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_pic} alt="Profile photo" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover" }} />
          )}
          <p>
            {profile.first_name} {profile.last_name}<br />
            <small>{user!.email}</small>
          </p>
        </div>
      )}

      <h2 style={{ marginTop: "2rem" }}>Cats you might run into</h2>
      {catsError && <p style={{ color: "red" }}>Error loading cats: {catsError.message}</p>}
      {rows.length > 0 && (
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>{columns.map((c) => <th key={c} style={{ border: "1px solid #ccc", padding: "0.5rem", textAlign: "left" }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((c) => <td key={c} style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{String(row[c] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
