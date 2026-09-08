// Config vitest DÉDIÉE : rendre un composant .astro exige le pipeline Vite d'Astro
// (getViteConfig) — la config vitest du dépôt ne l'a pas. `npm run harness:bottombar`.
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
const root = fileURLToPath(new URL("../..", import.meta.url));
export default getViteConfig({ root, test: { root, include: ["tools/harness/bottombar-render-verify.ts"] } });
