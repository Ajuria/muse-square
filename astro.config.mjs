import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import clerk from "@clerk/astro";
import { frFR } from "@clerk/localizations";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.APP_BASE_URL || "https://www.musesquare.com",

  redirects: {
    "/cgu": { status: 301, destination: "/conditions-generales" },
    "/privacy": { status: 301, destination: "/politique-de-confidentialite" },
  },

  server: { host: true },

  devToolbar: { enabled: false },
  output: "server",
  security: {
    checkOrigin: false,
  },
  // Durée max des fonctions (03/09, lecture des photos ≈ 8 s) : 60 s tient sur le plan Hobby
  // dans les deux régimes — 60 s max en serverless classique, 300 s avec Fluid compute (docs
  // Vercel du 24/08/2026). L'adaptateur ne sait pas la poser par route : elle vaut pour toutes.
  adapter: vercel({ maxDuration: 60 }),

  integrations: [
    tailwind(),
    mdx(),
    sitemap({
      filter: (page) =>
        !page.includes("/app/") &&
        !page.includes("/locations/") &&
        !page.includes("/dashboard") &&
        !page.includes("/notifications") &&
        !page.includes("/onboarding") &&
        !page.includes("/profile") &&
        !page.includes("/sign-in") &&
        !page.includes("/sign-up"),
    }),
    clerk({
      localization: frFR,
      afterSignOutUrl: "/",
    }),
  ],
});