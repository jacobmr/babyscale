"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { PERCENTILES, percentileCurves } from "@/lib/who";
import { GRAMS_PER_LB } from "@/lib/units";

type Point = { grams: number; at: string };

const DAY_MS = 86_400_000;

export default function GrowthChart(props: {
  birthDate: string;
  sex: "girl" | "boy" | "unspecified";
  units: "lb" | "kg";
  points: Point[];
}) {
  const birth = Date.parse(props.birthDate + "T00:00:00Z");
  const toUnit = (kg: number) => (props.units === "kg" ? kg : kg * 1000 / GRAMS_PER_LB);
  const unitLabel = props.units === "kg" ? "kg" : "lb";

  const baby = props.points
    .map((p) => ({ month: (Date.parse(p.at) - birth) / DAY_MS / 30.4375, value: toUnit(p.grams / 1000) }))
    .filter((p) => p.month >= 0)
    .sort((a, b) => a.month - b.month);

  // Show the WHO curves out to a little past the latest point (at least 3 months, at most 24).
  const lastMonth = baby.length ? baby[baby.length - 1].month : 0;
  const maxMonth = Math.min(24, Math.max(3, Math.ceil(lastMonth + 1)));
  const curves =
    props.sex === "unspecified"
      ? []
      : percentileCurves(props.sex)
          .filter((r) => r.month <= maxMonth)
          .map((r) => {
            const row: Record<string, number> = { month: r.month };
            for (const [name] of PERCENTILES) row[name] = Math.round(toUnit(r[name]) * 100) / 100;
            return row;
          });

  if (!baby.length && !curves.length) return <p className="muted">No weights yet.</p>;

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis
            dataKey="month" type="number" domain={[0, maxMonth]} allowDuplicatedCategory={false} allowDecimals={false}
            tickCount={Math.min(maxMonth + 1, 13)} stroke="var(--muted)"
            label={{ value: "age (months)", position: "insideBottom", offset: -8, fill: "var(--muted)" }}
          />
          <YAxis
            dataKey="value" type="number" domain={["auto", "auto"]} allowDecimals={false} width={44} stroke="var(--muted)"
            tickFormatter={(v: number) => v.toFixed(0)}
            label={{ value: unitLabel, angle: -90, position: "insideLeft", fill: "var(--muted)" }}
          />
          {PERCENTILES.map(([name]) => (
            <Line
              key={name} data={curves} dataKey={name} name={`WHO ${name}`} dot={false} isAnimationActive={false}
              stroke={name === "50th" ? "var(--curve-mid)" : "var(--curve)"} strokeWidth={name === "50th" ? 1.5 : 1}
              strokeDasharray={name === "50th" ? undefined : "4 3"}
            />
          ))}
          <Line data={baby} dataKey="value" name="weight" stroke="var(--accent)" strokeWidth={2}
            dot={false} isAnimationActive={false} />
          <Scatter data={baby} dataKey="value" name="weight" fill="var(--accent)" isAnimationActive={false} />
          <Tooltip
            formatter={(v, n) => [`${Number(v).toFixed(2)} ${unitLabel}`, n]}
            labelFormatter={(m) => `${Number(m).toFixed(1)} months`}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {curves.length > 0 && (
        <p className="muted small">Dashed lines: WHO 3rd, 15th, 85th, 97th percentiles. Solid grey: 50th.</p>
      )}
    </div>
  );
}
