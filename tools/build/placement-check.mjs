// Garde de PLACEMENT — CLAUDE.md § Placement des fichiers (owner 04/09/2026).
// Vérifie que chaque fichier suivi par git est à sa place. Un fichier hors de sa place = une
// faute listée + exit 1. Aucune règle ici qui ne soit écrite dans CLAUDE.md ; si une règle
// change, elle change là d'abord, ici ensuite.
//
//   node tools/build/placement-check.mjs            → tout le dépôt (npm run placement:check)
//   node tools/build/placement-check.mjs --staged   → seulement l'index git (hook de commit)
import { execSync } from "node:child_process";

const staged = process.argv.includes("--staged");
const cmd = staged ? "git diff --cached --name-only --diff-filter=ACR" : "git ls-files";
const files = execSync(cmd, { encoding: "utf8" }).split("\n").filter(Boolean);

const RACINE_OK = new Set(["CLAUDE.md", "README.md", "package.json", "package-lock.json", "astro.config.mjs",
  "tailwind.config.cjs", "tsconfig.json", "vitest.config.ts", ".gitignore", ".env.example"]);
const PROTO = /-proto(-data)?(-v\d+)?\.(html|js)$|-proto-[a-z0-9-]+\.(html|js)$/;
const HARNESS = /-harness\.(html|ts|mjs|mts)$|-verify\.(ts|mjs|mts)$|-dump\.(mjs|ts)$/;
const TEST = /\.(test|spec)\.(ts|mts|mjs|js)$/;
const NATURE = /— (DÉFINITIF|SPEC DE TRAVAIL)\s*$/m;
const ONEOFF_NOM = /^\d{4}-\d{2}-\d{2}-/;

const fautes = [];
const faute = (f, why) => fautes.push(`${f}\n    → ${why}`);
const base = (f) => f.slice(f.lastIndexOf("/") + 1);

for (const f of files) {
  const b = base(f);
  const depth = f.split("/").length;
  // 1. la racine ne reçoit que la configuration
  if (depth === 1 && !RACINE_OK.has(f)) faute(f, "la racine ne reçoit aucun fichier hors configuration — data/, tools/, docs/ ?");
  // 2. brouillons
  if (/(^|\/)_tmp[^/]*$/.test(f)) faute(f, "un brouillon ne vit jamais dans le dépôt — scratchpad de session");
  // 3. protos et harnais hors tools/
  if (PROTO.test(b) && !f.startsWith("tools/proto/")) faute(f, "un proto vit dans tools/proto/");
  if (b.endsWith("-harness.html") && !f.startsWith("tools/harness/")) faute(f, "un harnais vit dans tools/harness/");
  if (HARNESS.test(b) && !TEST.test(b) && /^(scripts|src|public)\//.test(f)) faute(f, "un harnais/verify vit dans tools/harness/");
  // 4. public/ = livré : rien d'outillage, aucun .md/.ts
  if (f.startsWith("public/") && /\.(ts|mts|md|test\.js)$/.test(b)) faute(f, "public/ ne contient que ce qui est servi");
  // 5. scripts/, python/, shots/, sample-data/ n'existent plus
  if (/^(scripts|python|shots|sample-data)\//.test(f)) faute(f, "dossier retiré le 04/09 — tools/ ou data/");
  // 6. tests : co-localisés dans src/, sinon tests/ ; jamais __tests__/, jamais dans tools/
  if (TEST.test(b)) {
    if (f.includes("/__tests__/")) faute(f, "aucun __tests__/ : co-localiser x.test.ts à côté de x.ts");
    if (f.startsWith("tools/")) faute(f, "un test ne vit pas dans tools/ — tests/ ou co-localisé dans src/");
    if (!f.startsWith("src/") && !f.startsWith("tests/")) faute(f, "un test vit co-localisé dans src/ ou dans tests/");
  }
  // 7. one-offs datés
  if (f.startsWith("tools/oneoff/") && !ONEOFF_NOM.test(b)) faute(f, "un one-off porte son préfixe AAAA-MM-JJ-");
  // 8. versions côte à côte dans tools/proto
  if (f.startsWith("tools/proto/") && /-v\d+\.(html|js)$/.test(b)) {
    const v1 = f.replace(/-v\d+(\.(html|js))$/, "$1"), v1data = f.replace(/-v\d+-data\.js$/, "-data.js");
    if (files.includes(v1) || (b.endsWith("-data.js") && files.includes(v1data))) faute(f, "jamais -vN à côté de la version précédente : une version REMPLACE");
  }
}
// 9. docs/ : tout .md porte sa nature en titre (sauf sous-dossiers de passation/site/archive, et README)
for (const f of files) {
  if (!f.startsWith("docs/") || !f.endsWith(".md")) continue;
  if (/^docs\/(dbt-handoff|site|archive|pack-copie-site)\//.test(f)) continue;
  let head = "";
  try { head = execSync(`head -1 "${f}"`, { encoding: "utf8" }); } catch { continue; }
  if (!NATURE.test(head)) faute(f, "le titre d'un document dit sa nature : — DÉFINITIF ou — SPEC DE TRAVAIL");
}

if (fautes.length) {
  console.error(`placement-check: ${fautes.length} fichier(s) hors de leur place (CLAUDE.md § Placement) :\n` + fautes.join("\n"));
  process.exit(1);
}
console.log(`placement-check: OK — ${files.length} fichier(s) ${staged ? "indexé(s)" : "suivi(s)"}, tous à leur place.`);
