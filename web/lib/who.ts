import { WHO_WFA } from "./who-data";

// z-scores for the percentile lines drawn on the chart.
export const PERCENTILES: [string, number][] = [
  ["3rd", -1.8808], ["15th", -1.0364], ["50th", 0], ["85th", 1.0364], ["97th", 1.8808],
];

// WHO LMS method: weight (kg) at a given z-score.
const atZ = (L: number, M: number, S: number, z: number) =>
  L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);

// One row per month 0-24: { month, "3rd": kg, ... }.
export function percentileCurves(sex: "girl" | "boy") {
  return WHO_WFA[sex].map(([month, L, M, S]) => {
    const row: Record<string, number> = { month };
    for (const [name, z] of PERCENTILES) row[name] = Math.round(atZ(L, M, S, z) * 1000) / 1000;
    return row;
  });
}
