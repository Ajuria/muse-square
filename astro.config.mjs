import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://musesquare.vercel.app', // tu ajusteras après déploiement
  integrations: [tailwind(), mdx()],
});

