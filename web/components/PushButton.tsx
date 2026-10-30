"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// "Notify me on this phone": a push notification for each new scale reading.
// iPhones allow web push only from the home-screen app, so they get that hint first.
export default function PushButton({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = async () => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    if ((await Notification.requestPermission()) !== "granted") return setState("denied");
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
    setState("on");
  };

  const turnOff = async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  };

  if (state === "loading") return null;
  if (state === "ios-install")
    return <p className="muted small">For a notification on each weighing: tap Share → Add to Home Screen, then open Baby weight from there.</p>;
  if (state === "unsupported") return <p className="muted small">This browser can&apos;t show notifications.</p>;
  if (state === "denied") return <p className="muted small">Notifications are blocked for this site in the browser settings.</p>;
  return state === "on" ? (
    <p className="small">Notifications on for this device. <button className="link" onClick={turnOff}>Turn off</button></p>
  ) : (
    <button onClick={turnOn}>Notify me on this device</button>
  );
}
