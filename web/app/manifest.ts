import type { MetadataRoute } from "next";

// Lets phones "Add to Home Screen" as an app; iPhones need that for web push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baby weight",
    short_name: "Baby weight",
    start_url: "/home",
    display: "standalone",
    background_color: "#161615",
    theme_color: "#d4573b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
