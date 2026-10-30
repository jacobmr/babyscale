import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Dashboard from "@/components/Dashboard";
import { AddEntryForm, CopyField, DeleteForm, EmailForm, ImportForm } from "@/components/Forms";
import { getBaby, listEntries, listMembers } from "@/lib/db";
import { appOrigin, memberRole, requireUser } from "@/lib/auth";
import {
  addEntry, deleteBaby, deleteEntry, importCsv, inviteMember, removeMember, resetDeviceToken, resetShareLink,
} from "@/app/actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baby = await getBaby((await params).id);
  return { title: baby ? `${baby.name}'s weight` : "Baby weight", robots: { index: false } };
}

// One baby's (or pet's) page: chart, weights, sharing, people, settings.
// Scale readings are assigned in the inbox on /home.
export default async function BabyPage({ params }: Props) {
  const baby = await getBaby((await params).id);
  if (!baby) notFound();

  const user = await requireUser(`/b/${baby.id}`);
  const role = await memberRole(baby.id, user.id);
  if (!role) {
    return (
      <>
        <h1>{baby.name}&apos;s weight</h1>
        <div className="card stack">
          <p>You&apos;re signed in as {user.email}, which isn&apos;t on this page yet.</p>
          <p className="muted small">Ask whoever set it up to add your email under &ldquo;People who can edit&rdquo;.</p>
          <Link href="/home">Your babies</Link>
        </div>
      </>
    );
  }

  const origin = await appOrigin();
  const [entries, members] = await Promise.all([listEntries(baby.id), listMembers(baby.id)]);

  return (
    <>
      <p className="small"><Link href="/home">← Your babies</Link></p>
      <h1>{baby.name}&apos;s weight</h1>
      <Dashboard baby={baby} entries={entries} onDelete={deleteEntry.bind(null, baby.id)} />
      <AddEntryForm action={addEntry.bind(null, baby.id)} units={baby.units} />

      <section className="card stack">
        <h2>Share</h2>
        <p className="muted small">Anyone with this link can view the chart and weights, but not change them.</p>
        <CopyField value={`${origin}/s/${baby.share_token}`} />
        <form action={resetShareLink.bind(null, baby.id)}>
          <button className="link">Make a new link (the old one stops working)</button>
        </form>
      </section>

      <section className="card stack">
        <h2>People who can edit</h2>
        <ul className="plain">
          {members.map((m) => (
            <li key={m.user_id}>
              {m.email}
              {m.role === "owner" ? (
                <span className="muted small"> · owner</span>
              ) : (
                <form action={removeMember.bind(null, baby.id, m.user_id)} className="inline">
                  {" "}<button className="link">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <EmailForm action={inviteMember.bind(null, baby.id)} label="Add someone by email" button="Add" />
      </section>

      <details className="card">
        <summary>Settings</summary>
        <div className="stack">
          <ImportForm action={importCsv.bind(null, baby.id)} />
          <hr />
          <p className="muted small">
            Older bridge firmware posts to <code>{origin}/api/ingest</code> with this token:
          </p>
          <CopyField value={baby.device_token} />
          <form action={resetDeviceToken.bind(null, baby.id)}>
            <button className="link">New token (the old one stops working)</button>
          </form>
          {role === "owner" && (
            <>
              <hr />
              <DeleteForm action={deleteBaby.bind(null, baby.id)} name={baby.name} />
            </>
          )}
        </div>
      </details>
    </>
  );
}
