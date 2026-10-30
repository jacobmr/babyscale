export const GRAMS_PER_LB = 453.59237;

export function formatWeight(grams: number, units: "lb" | "kg"): { main: string; sub: string } {
  if (units === "kg") return { main: `${(grams / 1000).toFixed(2)} kg`, sub: `${grams} g` };
  const totalOz = grams / (GRAMS_PER_LB / 16);
  let lb = Math.floor(totalOz / 16);
  let oz = Math.round((totalOz - lb * 16) * 10) / 10;
  if (oz >= 16) { lb += 1; oz = 0; }
  return { main: `${lb} lb ${oz.toFixed(1)} oz`, sub: `${grams} g` };
}

export function ageLabel(birthDate: string, at: Date): string {
  const days = Math.floor((at.getTime() - Date.parse(birthDate + "T00:00:00Z")) / 86_400_000);
  if (days < 0) return "before birth";
  if (days < 14) return `${days} d`;
  if (days < 120) return `${Math.floor(days / 7)} wk ${days % 7} d`;
  const months = Math.floor(days / 30.4375);
  if (months < 24) return `${months} mo`;
  return `${Math.floor(months / 12)} y ${months % 12} mo`;
}
