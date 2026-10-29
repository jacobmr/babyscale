import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import { AddEntryForm, CopyField, PasswordForm } from "@/components/Forms";
import { getBaby, listEntries } from "@/lib/db";
import { isEditor } from "@/lib/auth";
import { addEntry, changePassword, deleteEntry, login, resetDeviceToken, resetShareLink } from "@/app/actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baby = await getBaby((await params).id);
  return { title: baby ? `${baby.name}'s weight` : "Baby weight", robots: { index: false } };
}

export default async function BabyPage({ params }: Props) {
  const baby = await getBaby((await params).id);
  if (!baby) notFound();

  if (!(await isEditor(baby.id, baby.password_hash))) {
    return (
      <>
        <h1>{baby.name}&apos;s weight</h1>
        <div className="card">
          <PasswordForm action={login.bind(null, baby.id)} label="Password" button="Sign in" />
          <p className="muted small">You stay signed in on this device.</p>
        </div>
      </>
    );
  }

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const entries = await listEntries(baby.id);

  return (
    <>
      <h1>{baby.name}&apos;s weight</h1>
      <AddEntryForm action={addEntry.bind(null, baby.id)} units={baby.units} />
      <Dashboard baby={baby} entries={entries} onDelete={deleteEntry.bind(null, baby.id)} />

      <section className="card stack">
        <h2>Share</h2>
        <p className="muted small">Anyone with this link can view the chart and weights, but not change them.</p>
        <CopyField value={`${origin}/s/${baby.share_token}`} />
        <form action={resetShareLink.bind(null, baby.id)}>
          <button className="link">Make a new link (the old one stops working)</button>
        </form>
      </section>

      <details className="card">
        <summary>Scale bridge and settings</summary>
        <div className="stack">
          <p className="muted small">
            A bridge (for example the ESP32 firmware in this project) posts readings to{" "}
            <code>{origin}/api/ingest</code> with this token:
          </p>
          <CopyField value={baby.device_token} />
          <form action={resetDeviceToken.bind(null, baby.id)}>
            <button className="link">New token (the bridge must be updated)</button>
          </form>
          <PasswordForm action={changePassword.bind(null, baby.id)} label="New password" button="Change password" />
        </div>
      </details>
    </>
  );
}
