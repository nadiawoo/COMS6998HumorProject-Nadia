import { createClient } from "@supabase/supabase-js";

// Fetch fresh rows on every request instead of freezing them at build time
export const dynamic = "force-dynamic";

// Change this to the name of the table you created in Supabase
const TABLE_NAME = "main_table";

export default async function Home() {
  // Read the URL and anon key from environment variables (.env.local locally, Vercel settings in production)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.from(TABLE_NAME).select("*");

  // Shuffle the rows (Fisher-Yates) and keep only the first 5
  const shuffled = [...(data ?? [])];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rows = shuffled.slice(0, 5);

  // Use the first row's keys as the table's column headers
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Hello World :)</h1>
      <p>Here is a set of cats that you potentially might run into</p>

      {error && <p style={{ color: "red" }}>Error loading data: {error.message}</p>}

      {!error && rows?.length === 0 && <p>No rows found.</p>}

      {rows && rows.length > 0 && (
        <table style={{ borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} style={{ border: "1px solid #ccc", padding: "0.5rem", textAlign: "left" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((col) => (
                  <td key={col} style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
