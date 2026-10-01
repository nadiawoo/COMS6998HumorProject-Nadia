import { signInWithGoogle } from "../actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Log in</h1>
      {error && <p style={{ color: "red" }}>Login failed, please try again.</p>}
      <form action={signInWithGoogle}>
        <button>Continue with Google</button>
      </form>
    </main>
  );
}
