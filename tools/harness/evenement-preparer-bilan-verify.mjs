// Vérité RENDU — LE RETOUR DE LA SAISIE (13/09, owner : « relu/repris est le mécanisme ; le gain, c'est ce que ça vous
// permet ») : le bilan écrit d'une occurrence passée se relit AU MOMENT où l'exploitant prépare la suivante. Le script
// inline RÉEL de evenement.astro (panneau « avant ») exécuté dans happy-dom sur le payload RÉEL de /api/insight/evenement
// pour une opération du compte de test qui porte un bilan (« Lancement SaaS », bilan du 19/06/2026, écrit le 10/08).
// L'ENTRÉE fabriquée par le harnais, et elle seule : la date à venir (`avant_date` + sa rangée `days`), parce qu'aucune
// opération du compte n'a à la fois un bilan et une occurrence future — le bilan affiché, lui, vient de la base.
// Usage : npm run harness:evenement-preparer
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as evGET } from "../../src/pages/api/insight/evenement.ts";

const P = "muse-square-open-data", LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const ITEM = "cdd37a0a-693c-46e1-a1d3-b8e4ab1164e1";   // « Lancement SaaS » — bilan réel du 19/06/2026
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + String(d).slice(0, 180) : "")); if (!c) fails++; };
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: LOC }, location: "EU" });
const locals = { clerk_user_id: String(flat(u.clerk_user_id)), location_id: LOC, all_location_ids: [LOC] };
const res = await evGET({ url: new URL(`http://l/api/insight/evenement?location_id=${LOC}&saved_item_id=${ITEM}`), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error(payload.error);
const rowB = (payload.apres?.rows || []).filter((r) => r.bilan)[0];
check("le payload réel porte un bilan écrit sur une occurrence passée", !!rowB, rowB && `${rowB.date} · ${JSON.stringify(rowB.bilan)}`);
if (!rowB) { console.log("\n1 échec — sans bilan en base, le reste n'a pas de sens."); process.exit(1); }

// L'ENTRÉE fabriquée : une occurrence à venir, pour que l'étape « Préparer » existe (le reste est réel).
const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const DOW = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
payload.avant_date = demain;
payload.stage = "avant";
payload.days = [{ date: demain, dow_fr: DOW[new Date(demain + "T12:00:00Z").getUTCDay()], present: true, score: 7, questions: [], objectif: { expected_eur: 1200 } }];

const astro = readFileSync(new URL("../../src/pages/app/insightevent/evenement.astro", import.meta.url), "utf8");
const blocks = [...astro.matchAll(/<script is:inline>\n([\s\S]*?)\n\s*<\/script>/g)].map((m) => m[1]).filter((b) => b.indexOf('data-ev-panel="avant"') >= 0);
if (blocks.length !== 1) throw new Error("script du dossier introuvable");

const win = new Window({ url: `https://app.local/app/insightevent/evenement?location_id=${LOC}&saved_item_id=${ITEM}` });
const doc = win.document;
doc.body.innerHTML = `<div id="evt-root" data-loc="${LOC}" data-item="${ITEM}"><div id="evt-toolbar"><a id="evt-back"></a></div><div id="evt-head"><div></div><div></div></div><div id="evt-body">Chargement…</div></div>`;
const fetchStub = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).indexOf("/api/insight/evenement") >= 0 ? payload : { ok: false }) });
new Function("window", "document", "fetch", blocks[0])(win, doc, fetchStub);
await new Promise((r) => setTimeout(r, 120));

const avant = doc.querySelector('[data-ev-panel="avant"]');
check("l'étape « Préparer » est rendue", !!avant);
if (!avant) { console.log(`\n${fails} échec(s).`); process.exit(1); }
const txt = avant.textContent.replace(/[  ]/g, " ");
const d = rowB.date, dFr = `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
check(`« Votre bilan du ${dFr} » ouvre l'étape Préparer`, txt.indexOf(`Votre bilan du ${dFr}`) >= 0, txt.slice(0, 160));
const VECU = { conforme: "météo conforme", mieux: "météo meilleure que prévu", pire: "météo pire que prévu" };
if (rowB.bilan.weather) check("le vécu écrit est relu tel quel (météo)", txt.indexOf(VECU[rowB.bilan.weather]) >= 0, VECU[rowB.bilan.weather]);
if (rowB.bilan.mobility) check("le vécu écrit est relu tel quel (accès)", /accès (fluide|difficile|fortement perturbé)/.test(txt));
if (rowB.bilan.comment) check("le commentaire de l'exploitant est cité entre guillemets", txt.indexOf(String(rowB.bilan.comment).slice(0, 30)) >= 0);
check("le rappel vient AVANT le jour préparé (c'est ce qu'on lit d'abord)", txt.indexOf("Votre bilan du") < txt.indexOf("Score prévu") || txt.indexOf("Score prévu") < 0, txt.slice(0, 200));
check("le mot « bilan » n'est pas une mécanique (ni « relu », ni « repris », ni « attaché »)", !/\b(relu|repris|attaché)\b/i.test(txt));

console.log(fails ? `\n${fails} échec(s).` : "\nTout vert.");
process.exit(fails ? 1 : 0);
