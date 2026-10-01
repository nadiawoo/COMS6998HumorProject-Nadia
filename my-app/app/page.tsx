import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Hello World :)</h1>
      <p>Log in to see the cats you might run into.</p>
      <Link href="/members">Go to the members page →</Link>
    </main>
  );
}
