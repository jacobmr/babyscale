import { kgAtZ, zScore } from "./who";

const MONTH_MS = 30.4375 * 86_400_000;

export type Candidate = {
  id: string;
  name: string;
  sex: "girl" | "boy" | "unspecified";
  birth_date: string;
  last_grams: number | null;
  last_at: Date | null;
};

// Expected weight now. A baby keeps its percentile: take the z-score at the last weighing and
// read the weight at that z-score at today's age. Pets (no growth curve) and babies past 24
// months: the last weight.
export function expectedGrams(c: Candidate, at: Date): number | null {
  if (c.last_grams === null || c.last_at === null) return null;
  if (c.sex === "unspecified") return c.last_grams;
  const birth = Date.parse(c.birth_date + "T00:00:00Z");
  const thenMo = (c.last_at.getTime() - birth) / MONTH_MS;
  const nowMo = (at.getTime() - birth) / MONTH_MS;
  if (thenMo < 0 || nowMo > 24) return c.last_grams;
  const z = zScore(c.sex, thenMo, c.last_grams / 1000);
  return Math.round(kgAtZ(c.sex, nowMo, z) * 1000);
}

// Ranks who a reading probably belongs to. `pick` is set only for a clear winner: within 25% of
// its expected weight and at least 5 points closer than the runner-up (twins stay unpicked).
export function rankCandidates(grams: number, at: Date, candidates: Candidate[]) {
  const scored = candidates.map((c) => {
    const expected = expectedGrams(c, at);
    return { ...c, expected, err: expected ? Math.abs(grams - expected) / expected : Infinity };
  });
  scored.sort((a, b) => a.err - b.err);
  const [first, second] = scored;
  const clear = first && first.err < 0.25 && (!second || second.err - first.err > 0.05);
  return { ranked: scored, pick: clear ? first.id : null };
}
