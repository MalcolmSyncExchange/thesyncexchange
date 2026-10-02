import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Sync Exchange",
    short_name: "Sync Exchange",
    description: "Find and license music for film, ads, shows, and other creative work. Artists can share tracks and manage license details.",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#11161c",
    theme_color: "#11161c",
    icons: [
      {
        src: "/brand/the-sync-exchange/app/blue-s-v1/favicon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/the-sync-exchange/app/blue-s-v1/favicon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/the-sync-exchange/app/blue-s-v1/maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/brand/the-sync-exchange/app/blue-s-v1/maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
