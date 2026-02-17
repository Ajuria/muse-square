import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import clerk from "@clerk/astro";
import { frFR } from "@clerk/localizations";
import node from "@astrojs/node";

export default defineConfig({
  site: import.meta.env.PROD
    ? "https://muse-square.vercel.app"
    : "http://localhost:4322",

  devToolbar: { enabled: false },

  output: "server",
  adapter: node({ mode: "standalone" }),

  integrations: [
    tailwind(),
    mdx(),
    clerk({
      localization: frFR,
      afterSignOutUrl: "/",
    }),
  ],
});
