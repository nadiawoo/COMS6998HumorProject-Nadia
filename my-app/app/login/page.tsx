import { signInWithGoogle } from "../actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-5 px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Log in</h1>
      <p className="text-neutral-600">Search places, plan scenic trips around how you ride, and vote on other students&apos; routes.</p>
      {error && <p className="border-l-4 border-black bg-neutral-100 p-3 text-sm">{error === "not_allowed" ? "Journey is open to a limited group right now, and this account isn't on the list. If you think it should be, ask the site owner." : "Login failed, please try again."}</p>}
      <form action={signInWithGoogle}>
        <button className="w-full bg-black px-5 py-4 font-bold text-white">Continue with Google</button>
      </form>
    </main>
  );
}
