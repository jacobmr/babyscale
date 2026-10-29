"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql, getBaby } from "@/lib/db";
import { hashPassword, isEditor, randomId, setEditorCookie, verifyPassword } from "@/lib/auth";
import { GRAMS_PER_LB } from "@/lib/units";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createBaby(_: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name");
  const birthDate = str(f, "birth_date");
  const sex = str(f, "sex");
  const units = str(f, "units") === "kg" ? "kg" : "lb";
  const password = str(f, "password");
  if (!name || name.length > 60) return { error: "Enter a name (up to 60 characters)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { error: "Enter the birth date." };
  if (!["girl", "boy", "unspecified"].includes(sex)) return { error: "Pick an option for the growth chart." };
  if (password.length < 4) return { error: "Choose a password of at least 4 characters." };

  const id = randomId(8);
  const passwordHash = hashPassword(password);
  await sql`
    insert into babies (id, name, birth_date, sex, units, password_hash, share_token, device_token)
    values (${id}, ${name}, ${birthDate}, ${sex}, ${units}, ${passwordHash}, ${randomId(16)}, ${randomId(24)})`;
  await setEditorCookie(id, passwordHash);
  redirect(`/b/${id}`);
}

export async function login(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const baby = await getBaby(babyId);
  if (!baby || !verifyPassword(str(f, "password"), baby.password_hash)) return { error: "Wrong password." };
  await setEditorCookie(baby.id, baby.password_hash);
  redirect(`/b/${baby.id}`);
}

async function requireEditor(babyId: string) {
  const baby = await getBaby(babyId);
  if (!baby || !(await isEditor(baby.id, baby.password_hash))) throw new Error("Not signed in");
  return baby;
}

export async function addEntry(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const baby = await requireEditor(babyId);
  let grams: number;
  if (baby.units === "kg") {
    grams = Math.round(Number(str(f, "kg")) * 1000);
  } else {
    grams = Math.round((Number(str(f, "lb") || 0) + Number(str(f, "oz") || 0) / 16) * GRAMS_PER_LB);
  }
  const measuredAt = new Date(str(f, "measured_at"));
  if (!Number.isFinite(grams) || grams <= 0 || grams >= 50000) return { error: "Enter a weight." };
  if (Number.isNaN(measuredAt.getTime())) return { error: "Enter the date and time." };
  const note = str(f, "note").slice(0, 200) || null;
  await sql`
    insert into entries (baby_id, grams, measured_at, source, note)
    values (${baby.id}, ${grams}, ${measuredAt}, 'manual', ${note})`;
  revalidatePath(`/b/${baby.id}`);
  return { ok: "Saved." };
}

export async function deleteEntry(babyId: string, entryId: string) {
  const baby = await requireEditor(babyId);
  await sql`delete from entries where id = ${entryId} and baby_id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}

export async function changePassword(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const baby = await requireEditor(babyId);
  const password = str(f, "password");
  if (password.length < 4) return { error: "At least 4 characters." };
  const passwordHash = hashPassword(password);
  await sql`update babies set password_hash = ${passwordHash} where id = ${baby.id}`;
  await setEditorCookie(baby.id, passwordHash); // other devices must sign in again
  return { ok: "Password changed. Other devices need the new password." };
}

export async function resetShareLink(babyId: string) {
  const baby = await requireEditor(babyId);
  await sql`update babies set share_token = ${randomId(16)} where id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}

export async function resetDeviceToken(babyId: string) {
  const baby = await requireEditor(babyId);
  await sql`update babies set device_token = ${randomId(24)} where id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}
