"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { PERCENTILES, percentileCurves } from "@/lib/who";
import { GRAMS_PER_LB, ageLabel, formatWeight } from "@/lib/units";

type Point = { grams: number; at: string };
type Plotted = { x: number; value: number; grams: number; at: string };

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.4375;

// Babies: age on the x axis with WHO curves. Pets ("no percentile curves"): date on the x axis.
export default function GrowthChart(props: {
  birthDate: string;
  sex: "girl" | "boy" | "unspecified";
  units: "lb" | "kg";
  points: Point[];
}) {
  const byAge = props.sex !== "unspecified";
  const birth = Date.parse(props.birthDate + "T00:00:00Z");
  const toUnit = (kg: number) => (props.units === "kg" ? kg : kg * 1000 / GRAMS_PER_LB);
  const unitLabel = props.units === "kg" ? "kg" : "lb";

  const series: Plotted[] = props.points
    .map((p) => {
      const t = Date.parse(p.at);
      return { x: byAge ? (t - birth) / DAY_MS / MONTH_DAYS : t, value: toUnit(p.grams / 1000), grams: p.grams, at: p.at };
    })
    .filter((p) => !byAge || p.x >= 0)
    .sort((a, b) => a.x - b.x);

  // Babies: WHO curves out to a little past the latest point (at least 3 months, at most 24).
  const lastMonth = byAge && series.length ? series[series.length - 1].x : 0;
  const maxMonth = Math.min(24, Math.max(3, Math.ceil(lastMonth + 1)));
  const curves = !byAge
    ? []
    : percentileCurves(props.sex as "girl" | "boy")
        .filter((r) => r.month <= maxMonth)
        .map((r) => {
          const row: Record<string, number> = { x: r.month };
          for (const [name] of PERCENTILES) row[name] = Math.round(toUnit(r[name]) * 100) / 100;
          return row;
        });

  if (!series.length && !curves.length) return <p className="muted">No weights yet.</p>;

  const dateLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          {byAge ? (
            <XAxis
              dataKey="x" type="number" domain={[0, maxMonth]} allowDuplicatedCategory={false} allowDecimals={false}
              tickCount={Math.min(maxMonth + 1, 13)} stroke="var(--muted)"
              label={{ value: "age (months)", position: "insideBottom", offset: -8, fill: "var(--muted)" }}
            />
          ) : (
            <XAxis
              dataKey="x" type="number" scale="time" domain={["dataMin - 86400000", "dataMax + 86400000"]}
              tickFormatter={dateLabel} stroke="var(--muted)" allowDuplicatedCategory={false}
            />
          )}
          <YAxis
            dataKey="value" type="number" domain={["auto", "auto"]} allowDecimals={false} width={44} stroke="var(--muted)"
            tickFormatter={(v: number) => v.toFixed(0)}
            label={{ value: unitLabel, angle: -90, position: "insideLeft", fill: "var(--muted)" }}
          />
          {curves.length > 0 && PERCENTILES.map(([name]) => (
            <Line
              key={name} data={curves} dataKey={name} name={`WHO ${name}`} dot={false} isAnimationActive={false}
              stroke={name === "50th" ? "var(--curve-mid)" : "var(--curve)"} strokeWidth={name === "50th" ? 1.5 : 1}
              strokeDasharray={name === "50th" ? undefined : "4 3"} activeDot={false}
            />
          ))}
          <Line data={series} dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={false}
            isAnimationActive={false} />
          <Scatter data={series} dataKey="value" fill="var(--accent)" isAnimationActive={false} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const p = payload?.find((x) => (x.payload as Plotted)?.grams !== undefined)?.payload as Plotted | undefined;
              if (!active || !p) return null;
              const w = formatWeight(p.grams, props.units);
              return (
                <div className="tip">
                  <div>{byAge ? `Age ${ageLabel(props.birthDate, new Date(p.at))}` : dateLabel(Date.parse(p.at))}</div>
                  <strong>{w.main}</strong> <span className="muted small">{w.sub}</span>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {curves.length > 0 && (
        <p className="muted small">Dashed lines: WHO 3rd, 15th, 85th, 97th percentiles. Solid grey: 50th.</p>
      )}
    </div>
  );
}
