import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Pawarna Video Factory", short_name: "Pawarna", lang: "ms-MY",
    description: "Gambar produk jadi video affiliate. Cipta, semak dan simpan video dalam satu app.",
    start_url: "/?source=pwa", scope: "/", display: "standalone",
    background_color: "#fafbf7", theme_color: "#fafbf7", categories: ["productivity", "photo"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Cipta video", short_name: "Cipta", url: "/#create", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Projects", short_name: "Projects", url: "/#projects", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
