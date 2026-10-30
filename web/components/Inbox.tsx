import LocalTime from "./LocalTime";
import LiveRefresh from "./LiveRefresh";
import type { Pending } from "@/lib/db";
import { rankCandidates, type Candidate } from "@/lib/guess";
import { formatWeight } from "@/lib/units";

// Scale readings waiting for "whose is this?". One tap on a name saves it to that chart.
// The likely one (by expected weight today) is first and highlighted; near-ties pick nobody.
export default function Inbox({
  items, candidates, units, onAssign, onDiscard,
}: {
  items: Pending[];
  candidates: Candidate[];
  units: "lb" | "kg";
  onAssign: (entryId: string, babyId: string) => Promise<void>;
  onDiscard: (entryId: string) => Promise<void>;
}) {
  return (
    <>
      <LiveRefresh ids={items.map((i) => i.id)} />
      {items.length > 0 && (
        <section className="card stack inbox">
          <h2>New from the scale</h2>
          {items.map((p) => {
            const w = formatWeight(p.grams, units);
            const { ranked, pick } = rankCandidates(p.grams, p.measured_at, candidates);
            const order = p.baby_id ? [...ranked].sort((a) => (a.id === p.baby_id ? -1 : 0)) : ranked;
            const chosen = p.baby_id ?? pick;
            return (
              <div key={p.id} className="inbox-item">
                <div>
                  <strong className="big-ish">{w.main}</strong> <span className="muted small">{w.sub}</span>
                  <div className="muted small"><LocalTime iso={p.measured_at.toISOString()} /></div>
                </div>
                <div className="inbox-actions">
                  {order.map((c) => (
                    <form key={c.id} action={onAssign.bind(null, p.id, c.id)}>
                      <button className={c.id === chosen ? undefined : "secondary"}>{c.name}</button>
                    </form>
                  ))}
                  <form action={onDiscard.bind(null, p.id)}>
                    <button className="link danger">Discard</button>
                  </form>
                </div>
              </div>
            );
          })}
          {candidates.length === 0 && <p className="muted small">Add a baby or pet below, then tap its name to save.</p>}
        </section>
      )}
    </>
  );
}
