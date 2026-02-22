import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import clerk from "@clerk/astro";
import { frFR } from "@clerk/localizations";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "http://localhost:4322",
  
  server: { host: true },
  
  devToolbar: { enabled: false },
  output: "server",
  adapter: vercel(),

  integrations: [
    tailwind(),
    mdx(),
    clerk({
      localization: frFR,
      afterSignOutUrl: "/",
    }),
  ],
});
