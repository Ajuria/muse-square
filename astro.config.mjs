import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import clerk from "@clerk/astro";
import { frFR } from "@clerk/localizations";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: import.meta.env.PROD
    ? "https://musesquare.com"
    : "http://localhost:4322",

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
