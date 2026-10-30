"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While the page is visible, checks every 5 s for new or removed scale readings and
// re-renders the page when the list changes. A weighing shows up without a reload.
export default function LiveRefresh({ ids }: { ids: string[] }) {
  const router = useRouter();
  const key = ids.join(",");
  useEffect(() => {
    const url = "/api/pending";
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { ids: now } = (await res.json()) as { ids: string[] };
        if (now.join(",") !== key) router.refresh();
      } catch {
        // offline for a moment; try again next tick
      }
    };
    const timer = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, router]);
  return null;
}
