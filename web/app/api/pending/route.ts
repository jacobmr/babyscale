import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listInbox } from "@/lib/db";

// Polled by the inbox while /home is open: the ids of waiting scale readings, so the page
// refreshes when one arrives.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const rows = await listInbox(user.id);
  return NextResponse.json({ ids: rows.map((r) => r.id) }, { headers: { "cache-control": "no-store" } });
}
