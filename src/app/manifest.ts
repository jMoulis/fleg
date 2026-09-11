import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "F&L Cockpit",
    short_name: "F&L",
    description: "Pilotage fruits et légumes et catalogue terrain préparé.",
    lang: "fr",
    start_url: "/offline",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#215b3c",
    icons: [192, 512].map((size) => ({
      src: `/pwa-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
