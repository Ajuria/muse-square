import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import clerk from "@clerk/astro";
import { frFR } from "@clerk/localizations";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.APP_BASE_URL || "https://www.musesquare.com",

  server: { host: true },

  devToolbar: { enabled: false },
  output: "server",
  security: {
    checkOrigin: false,
  },
  adapter: vercel(),

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