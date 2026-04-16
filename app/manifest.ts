import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Sync Exchange",
    short_name: "Sync Exchange",
    description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#11161c",
    theme_color: "#11161c",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
