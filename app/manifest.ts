import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Sync Exchange",
    short_name: "Sync Exchange",
    description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    icons: [
      {
        src: "/brand/the-sync-exchange/app/AppIcon_256.png",
        sizes: "256x256",
        type: "image/png"
      },
      {
        src: "/brand/the-sync-exchange/app/AppIcon_512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
