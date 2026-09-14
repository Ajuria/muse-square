// Config vitest DÉDIÉE : rendre un composant .astro exige le pipeline Vite d'Astro
// (getViteConfig) — la config vitest du dépôt ne l'a pas. `npm run harness:bottombar`.
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
const root = fileURLToPath(new URL("../..", import.meta.url));
// 14/09 — `tools/` entre dans tsc : `getViteConfig` type son entrée en UserConfig de Vite, qui ne
// connaît pas la clé `test` de Vitest (elle est pourtant lue à l'exécution). Le cast dit ce fait.
export default getViteConfig({ root, test: { root, include: ["tools/harness/bottombar-render-verify.ts"] } } as any);
