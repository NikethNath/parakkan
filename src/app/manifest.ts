import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Next injects <link rel="manifest"> automatically.
// This is what makes Android Chrome offer "Install app" / "Add to Home Screen" and
// open the site fullscreen (no browser chrome) from the home-screen icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parakkan Petroleum",
    short_name: "Parakkan",
    description: "Daily collection & reconciliation for the HPCL outlet",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef1f6",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
