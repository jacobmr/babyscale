import Link from "next/link";
import type { Metadata } from "next";
import { CreateBabyForm } from "@/components/Forms";
import Inbox from "@/components/Inbox";
import LocalTime from "@/components/LocalTime";
import PushButton from "@/components/PushButton";
import { requireUser } from "@/lib/auth";
import {
  listArchivedForUser, listCandidates, listClaimableBridges, listInbox, listMyBabies, listMyBridges, type Bridge,
} from "@/lib/db";
import { formatWeight } from "@/lib/units";
import {
  assignReading, claimBridge, createBaby, discardReading, releaseBridge, restoreReading, signOut,
} from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your babies · Baby weight", robots: { index: false } };

export default async function HomePage() {
  const user = await requireUser("/home");
  const [babies, inbox, candidates, bridges, claimable, archived] = await Promise.all([
    listMyBabies(user.id), listInbox(user.id), listCandidates(user.id),
    listMyBridges(user.id), listClaimableBridges(user.id), listArchivedForUser(user.id),
  ]);
  const units = babies[0]?.units ?? "lb";
  const bridgeLine = (b: Bridge) => (
    <>
      Bridge <code>…{b.id.slice(-4)}</code>
      {b.last_seen_at && b.last_grams && (
        <span className="muted small">
          {" "}· last {formatWeight(b.last_grams, units).main}, <LocalTime iso={b.last_seen_at.toISOString()} />
        </span>
      )}
    </>
  );

  return (
    <>
      <Inbox items={inbox} candidates={candidates} units={units} onAssign={assignReading} onDiscard={discardReading} />

      <h1>Your babies</h1>
      {babies.length > 0 ? (
        <section className="card">
          <ul className="plain">
            {babies.map((b) => (
              <li key={b.id}>
                <Link href={`/b/${b.id}`}><strong>{b.name}</strong></Link>
                {b.last_grams && <span className="muted small"> · {formatWeight(b.last_grams, b.units).main}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="muted">Nothing here yet. Add a baby (or a pet) below.</p>
      )}

      <section className="card stack">
        <h2>Scale bridge</h2>
        {bridges.length > 0 && (
          <ul className="plain">
            {bridges.map((b) => (
              <li key={b.id}>
                {bridgeLine(b)}{" "}
                <form action={releaseBridge.bind(null, b.id)} className="inline">
                  <button className="link">Not mine</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {claimable.map((b) => (
          <div key={b.id} className="row-between">
            <span>{bridgeLine(b)}</span>
            <form action={claimBridge.bind(null, b.id)}>
              <button>This is my bridge</button>
            </form>
          </div>
        ))}
        {process.env.VAPID_PUBLIC_KEY && (bridges.length > 0 || inbox.length > 0) && (
          <PushButton publicKey={process.env.VAPID_PUBLIC_KEY} />
        )}
        {bridges.length === 0 && claimable.length === 0 && (
          <p className="muted small">
            To set up a bridge: weigh something, then reload this page and tap &ldquo;This is my bridge&rdquo;.
          </p>
        )}
      </section>

      <details className="card" open={babies.length === 0}>
        <summary>Add a baby or pet</summary>
        <CreateBabyForm action={createBaby} />
      </details>

      {archived.length > 0 && (
        <details className="card">
          <summary>Discarded scale readings ({archived.length})</summary>
          <ul className="plain">
            {archived.map((a) => (
              <li key={a.id}>
                {formatWeight(a.grams, units).main}{" "}
                <span className="muted small"><LocalTime iso={a.measured_at.toISOString()} /></span>{" "}
                <form action={restoreReading.bind(null, a.id)} className="inline">
                  <button className="link">Restore</button>
                </form>
              </li>
            ))}
          </ul>
          <p className="muted small">Unsaved readings also land here after 7 days.</p>
        </details>
      )}

      <form action={signOut} className="muted small">
        Signed in as {user.email}. <button className="link">Sign out</button>
      </form>
    </>
  );
}
