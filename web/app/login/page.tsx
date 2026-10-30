import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { EmailForm } from "@/components/Forms";
import { getUser } from "@/lib/auth";
import { requestLink } from "@/app/actions";

export const metadata: Metadata = { title: "Sign in · Baby weight" };

type Props = { searchParams: Promise<{ next?: string; expired?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, expired } = await searchParams;
  if (await getUser()) redirect(next?.startsWith("/") ? next : "/home");
  return (
    <>
      <h1>Sign in</h1>
      <div className="card stack">
        {expired && <p className="error">That link was already used or has expired. Ask for a new one.</p>}
        <p className="muted small">
          We&apos;ll email you a link. No password. This browser then stays signed in.
        </p>
        <EmailForm action={requestLink} label="Email" button="Email me a link" next={next} />
      </div>
    </>
  );
}
