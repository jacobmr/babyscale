import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import { getBabyByShareToken, listEntries } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baby = await getBabyByShareToken((await params).token);
  return { title: baby ? `${baby.name}'s weight` : "Baby weight", robots: { index: false } };
}

export default async function SharePage({ params }: Props) {
  const baby = await getBabyByShareToken((await params).token);
  if (!baby) notFound();
  const entries = await listEntries(baby.id);
  return (
    <>
      <h1>{baby.name}&apos;s weight</h1>
      <Dashboard baby={baby} entries={entries} />
    </>
  );
}
