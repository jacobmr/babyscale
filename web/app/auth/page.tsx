import type { Metadata } from "next";
import { signInWithLink } from "@/app/actions";

export const metadata: Metadata = { title: "Sign in · Baby weight", robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string; next?: string }> };

// Opened from the emailed link. Signing in takes a click, so mail scanners that
// prefetch the link don't use it up.
export default async function AuthPage({ searchParams }: Props) {
  const { token = "", next = "/home" } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <form action={signInWithLink.bind(null, token, next)} className="card stack">
        <p>Tap to finish signing in on this device.</p>
        <button>Sign in</button>
      </form>
    </>
  );
}
