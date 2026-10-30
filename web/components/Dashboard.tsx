import GrowthChart from "./GrowthChart";
import LocalTime from "./LocalTime";
import type { Baby, Entry } from "@/lib/db";
import { ageLabel, formatWeight } from "@/lib/units";

// Shared by the editor page and the read-only share page.
export default function Dashboard({
  baby, entries, onDelete,
}: {
  baby: Baby;
  entries: Entry[];
  onDelete?: (entryId: string) => Promise<void>;
}) {
  const latest = entries[0];
  const w = latest && formatWeight(latest.grams, baby.units);
  return (
    <>
      <section className="card">
        {latest ? (
          <>
            <p className="muted">Latest</p>
            <p className="big">{w.main}</p>
            <p className="muted">
              {w.sub} · <LocalTime iso={latest.measured_at.toISOString()} /> · age{" "}
              {ageLabel(baby.birth_date, latest.measured_at)}
            </p>
          </>
        ) : (
          <p className="muted">No weights yet.</p>
        )}
      </section>

      <section className="card">
        <h2>{baby.sex === "unspecified" ? "Weight over time" : "Growth chart"}</h2>
        <GrowthChart
          birthDate={baby.birth_date} sex={baby.sex} units={baby.units}
          points={entries.map((e) => ({ grams: e.grams, at: e.measured_at.toISOString() }))}
        />
      </section>

      {entries.length > 0 && (
        <section className="card">
          <h2>All weights</h2>
          <table>
            <tbody>
              {entries.map((e) => {
                const ew = formatWeight(e.grams, baby.units);
                return (
                  <tr key={e.id}>
                    <td><LocalTime iso={e.measured_at.toISOString()} /></td>
                    <td>
                      <strong>{ew.main}</strong> <span className="muted small">{ew.sub}</span>
                      {e.note && <div className="muted small">{e.note}</div>}
                    </td>
                    <td className="muted small">{e.source === "device" ? "scale" : "manual"}</td>
                    {onDelete && (
                      <td>
                        <form action={onDelete.bind(null, e.id)}>
                          <button className="link danger" aria-label="Delete this weight">Delete</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
