"use client";

import { useEffect, useState } from "react";

// Render in the viewer's time zone (the server doesn't know it).
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 16).replace("T", " ") + " UTC");
  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
