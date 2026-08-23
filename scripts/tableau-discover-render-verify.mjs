// Vérité RENDU amorçage veille (23/08) — le script inline réel de tableau.astro dans happy-dom
// sur le payload RÉEL du compte owner ; n_watched forcé à 0 (le cas des 10 sites sans suivi —
// Muse Square en a 3, la rangée n'y est pas) ; discover-competitors stubbé avec les 5 candidats
// RÉELS renvoyés par l'endpoint pour f10c3e58 le 23/08 (18,5 s, HTTP 200).
// Usage : npx tsx scripts/tableau-discover-render-verify.mjs
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";

const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 160) : "")); if (!cond) fails++; };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
const locals = { clerk_user_id: uid, all_location_ids: locRows.map((r) => String(flat(r.location_id))) };
const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("payload en erreur : " + payload.error);
const real = (payload.glance.watched_par_site || []).find((w) => w.location_id === OWNER_LOC);
check("payload réel : watched_par_site porte Muse Square avec n_watched = 3", real && real.n_watched === 3, JSON.stringify(real));
// Cas amorçage : 0 suivi.
payload.glance.watched_par_site = [{ location_id: OWNER_LOC, site_label: "Muse Square", n_watched: 0 }];

// Candidats RÉELS (sortie de discover-competitors du 23/08 pour f10c3e58).
const DISCOVERED = { ok: true, candidates: [
  { competitor_name: "Théâtre le Ranelagh", city: "Paris", address: "5 rue des Vignes, 75016 Paris", source_url: "https://theatre-ranelagh.com", source_sentence: "Théâtre à l'italienne du 16e arrondissement, programmation théâtre et concerts" },
  { competitor_name: "Théâtre de Passy", city: "Paris", address: "95 rue de Passy, 75016 Paris", source_url: "https://theatredepassy.fr", source_sentence: "Théâtre de 600 places dans le quartier de Passy" },
  { competitor_name: "La Clairière", city: "Paris", address: null, source_url: null, source_sentence: null },
  { competitor_name: "Pavillon Passy", city: "Paris", address: null, source_url: null, source_sentence: "Espace événementiel à Passy" },
  { competitor_name: "Le Passy", city: "Paris", address: null, source_url: null, source_sentence: null },
] };

const astro = readFileSync(new URL("../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const m = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/);
if (!m) throw new Error("script inline introuvable");
const win = new Window({ url: "https://app.local/app/insightevent/tableau" });
const doc = win.document;
doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
const posted = [];
const fetchStub = (url, opts) => {
  const s = String(url);
  if (s.indexOf("/api/insight/dashboard") >= 0) return Promise.resolve({ json: () => Promise.resolve(payload) });
  if (s.indexOf("/api/competitive/discover-competitors") >= 0) { posted.push(["discover", JSON.parse(opts.body)]); return Promise.resolve({ json: () => Promise.resolve(DISCOVERED) }); }
  if (s.indexOf("/api/competitive/add-competitor") >= 0) { posted.push(["add", JSON.parse(opts.body)]); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); }
  return Promise.resolve({ json: () => Promise.resolve({ ok: false }) });
};
new Function("window", "document", "fetch", "alert", m[1])(win, doc, fetchStub, () => {});
await tick();
const body = doc.getElementById("tb-body");
const txt = () => body.textContent;

check("rangée « Cherchez vos concurrents » présente", txt().indexOf("Cherchez vos concurrents") >= 0);
check("titre « Cherchez vos concurrents · aucun suivi » + sous-titre = bénéfice du verbe (BENEFICE.Chercher)", txt().indexOf("Cherchez vos concurrents · aucun suivi") >= 0 && txt().indexOf("3 à 5 concurrents de votre zone, trouvés sur le web — à suivre d'un clic") >= 0);
const btn = body.querySelector("[data-tb-discover]");
check("CTA « Chercher → » porte le location_id du site", btn && btn.textContent.trim() === "Chercher →" && btn.getAttribute("data-tb-discover") === OWNER_LOC, btn && btn.textContent);
check("AVANT clic : aucun « Suivez » (rien n'est inventé)", txt().indexOf("Suivez ") < 0);

btn.click(); await tick(60);
check("POST discover-competitors {location_id}", posted[0] && posted[0][0] === "discover" && posted[0][1].location_id === OWNER_LOC, JSON.stringify(posted[0]));
check("CTA devient « 5 trouvés »", btn.textContent.trim() === "5 trouvés", btn.textContent);
const follows = Array.from(body.querySelectorAll("[data-tb-follow]"));
check("5 rangées « Suivez X » insérées sous la rangée", follows.length === 5 && txt().indexOf("Suivez Théâtre le Ranelagh") >= 0 && txt().indexOf("Suivez Le Passy") >= 0, follows.length);
check("sous-titre candidat = bénéfice approuvé de Suivre (BENEFICE), pas une phrase à moi", (() => { const r = follows[0].closest(".tb-af"); return r && r.textContent.indexOf("sa page entre dans votre veille — événements, offres et tarifs lus chaque nuit") >= 0; })());
check("phrase de la page source en infobulle du titre (preuve de l'agent)", (() => { const t = follows[0].closest(".tb-af").querySelector(".t"); return t && t.getAttribute("title") === "Théâtre à l'italienne du 16e arrondissement, programmation théâtre et concerts"; })());
check("candidat sans phrase source → infobulle = ville", follows[2].closest(".tb-af").querySelector(".t").getAttribute("title") === "Paris");
check("l'ordre de l'agent est conservé (Ranelagh avant Le Passy)", txt().indexOf("Ranelagh") < txt().indexOf("Le Passy"));

follows[0].click(); await tick(60);
const add = posted.find((p) => p[0] === "add");
check("Suivre → POST add-competitor avec nom, ville, adresse, source_url, location_id du site, place_id vide", add && add[1].competitor_name === "Théâtre le Ranelagh" && add[1].city === "Paris" && add[1].address === "5 rue des Vignes, 75016 Paris" && add[1].source_url === "https://theatre-ranelagh.com" && add[1].location_id === OWNER_LOC && add[1].google_place_id === "", JSON.stringify(add && add[1]));
check("bouton → « Suivi ✓ »", follows[0].textContent.trim() === "Suivi ✓", follows[0].textContent);
check("un seul clic par bouton (le 2e ne reposte pas)", (() => { const n = posted.length; follows[0].click(); return posted.length === n; })());

const out = new URL("../shots/tableau-discover-render.html", import.meta.url);
writeFileSync(out, "<!doctype html><meta charset=utf-8><style>body{font-family:system-ui;max-width:900px;margin:24px auto}</style>" + body.innerHTML);
console.log(fails ? `\n${fails} FAIL` : "\nTOUT VERT", "— rendu écrit :", out.pathname);
process.exit(fails ? 1 : 0);
