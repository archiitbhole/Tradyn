import type { MetadataRoute } from "next";

/**
 * Lets Tradyn be installed from the browser (Chrome "Install app", Android home screen). Every icon is
 * the original Tradyn emblem on its dark tile, made by scripts/build-brand.py.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tradyn",
    short_name: "Tradyn",
    description: "Indian stock market dashboard with a separate market simulator.",
    start_url: "/",
    display: "standalone",
    background_color: "#070c18",
    theme_color: "#070c18",
    icons: [
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
