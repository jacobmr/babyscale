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

// LMS for an age in months (0-24), interpolated between the monthly WHO rows.
function lmsAt(sex: "girl" | "boy", months: number): [number, number, number] {
  const rows = WHO_WFA[sex];
  const m = Math.max(0, Math.min(rows.length - 1, months));
  const i = Math.min(rows.length - 2, Math.floor(m));
  const f = m - i;
  const [, L0, M0, S0] = rows[i];
  const [, L1, M1, S1] = rows[i + 1];
  return [L0 + (L1 - L0) * f, M0 + (M1 - M0) * f, S0 + (S1 - S0) * f];
}

// z-score of a weight (kg) at an age, and the weight at a z-score: the WHO LMS formulas.
export function zScore(sex: "girl" | "boy", months: number, kg: number): number {
  const [L, M, S] = lmsAt(sex, months);
  return L === 0 ? Math.log(kg / M) / S : (Math.pow(kg / M, L) - 1) / (L * S);
}

export function kgAtZ(sex: "girl" | "boy", months: number, z: number): number {
  const [L, M, S] = lmsAt(sex, months);
  return atZ(L, M, S, z);
}
