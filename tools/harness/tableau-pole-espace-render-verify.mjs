// Vérité RENDU — l'espace du pôle sur le tableau de bord (11/09, docs/espace-et-pole.md E4-E6).
// Le script inline RÉEL de tableau.astro, exécuté dans happy-dom, sur le payload RÉEL du compte owner
// (aucun pôle) auquel on greffe les pôles d'Épices et Tout tels que LA lecture serveur les rend
// (listPoleSpace sur a3b442c2 : mètres et Part de linéaire réels, aucune vente → « Pôle en projet »), puis
// le même pôle avec CA et marge par mètre injectés. Le harnais EST la page.
// Usage : npm run harness:tableau-espace
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";
import { makeBQClient } from "../../src/lib/bq";
import { listPoleSpace, listPoles, poleProjectState, POLE_PROJECT_FR } from "../../src/lib/dispositifs/poleReading";

const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const EPICES_LOC = "a3b442c2-e7e5-43e8-b969-7b78e6c24bb0";
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 160) : "")); if (!cond) fails++; };
const tick = () => new Promise((r) => setTimeout(r, 40));

const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365&location_id=" + OWNER_LOC), locals: { clerk_user_id: "harness", all_location_ids: [OWNER_LOC], role: "owner" } });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("payload en erreur : " + payload.error);
check("payload réel du compte owner : aucun pôle", (payload.poles || []).length === 0, (payload.poles || []).length);

// Les pôles d'Épices et Tout, par LES foyers serveur (mêmes chiffres que le payload d'un owner d'Épices).
const bq = makeBQClient("muse-square-open-data");
const [poles, space] = await Promise.all([listPoles(bq, EPICES_LOC, 50), listPoleSpace(bq, EPICES_LOC)]);
check("Épices et Tout : 7 pôles lus", poles.length === 7, poles.length);
const cave = poles.find((p) => p.name === "Cave");
const caveSpace = space.find((r) => r.grain === "pole" && r.pole_id === cave.dispositif_id);
check("espace du pôle Cave : 23,62 m, Part de linéaire 11,7 %", caveSpace && Math.abs(caveSpace.linear_m - 23.62) < 0.01 && Math.abs(caveSpace.linear_share - 0.117) < 0.001, JSON.stringify(caveSpace));
check("sans vente : aucun € par mètre (space_30d vide, mètres présents)", caveSpace && caveSpace.revenue_per_m == null && caveSpace.linear_m != null);
const projet = poleProjectState(cave.families, []);
check("état : Pôle en projet — Aucune vente importée", projet === "aucune_vente");

function polePayload(p, sp, extra) {
  return {
    dispositif_id: p.dispositif_id, location_id: EPICES_LOC, site_label: null, commitment_id: p.commitment_id,
    name: p.name, lever: p.lever, families: p.families, responsable: p.responsable, components: [], operations: [],
    reading: { rev30_eur: null, share_pct: null, delta_pct: null, n30: 0, families: [] }, week: null, ops_open: 0, historique: [], prouves: 0,
    projet, projet_fr: POLE_PROJECT_FR[projet],
    space: sp ? { linear_m: sp.linear_m, linear_share: sp.linear_share, surface_m2: sp.surface_m2, revenue_per_m: sp.revenue_per_m, margin_per_m: sp.margin_per_m,
      revenue_per_m2: sp.revenue_per_m2, margin_per_m2: sp.margin_per_m2, revenue_share: sp.revenue_share, margin_share: sp.margin_share, coverage_pct: sp.coverage_pct, ...(extra || {}) } : null,
  };
}

const astro = readFileSync(new URL("../../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const src = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/)[1];
async function render(p) {
  const win = new Window({ url: "https://app.local/app/insightevent/tableau?location_id=" + OWNER_LOC });
  const doc = win.document;
  doc.body.innerHTML = '<div id="tb-root" data-loc="' + OWNER_LOC + '"><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
  const fetchStub = (url) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? p : { ok: true, items: [] }) });
  new Function("window", "document", "fetch", "alert", "FormData", src)(win, doc, fetchStub, () => {}, win.FormData);
  await tick(); await tick();
  return { doc, body: doc.getElementById("tb-body") };
}

// 1. Le pôle Cave tel qu'il est en base : mètres, Part de linéaire, en projet ; aucun € par mètre.
{
  const p1 = JSON.parse(JSON.stringify(payload));
  p1.poles = [polePayload(cave, caveSpace)];
  const { body } = await render(p1);
  const card = body.querySelector("[data-tb-pole]");
  check("carte Vos pôles rendue", !!card);
  const ct = card ? card.textContent : "";
  check("carte : « 23,6 m de linéaire · Part de linéaire 11,7 % »", ct.indexOf("23,6 m de linéaire · Part de linéaire 11,7 %") >= 0, ct);
  check("carte : « Pôle en projet — Aucune vente importée »", ct.indexOf("Pôle en projet — Aucune vente importée") >= 0);
  card.click(); await tick();
  const pan = body.querySelector("#tb-pole-panel");
  const pt = pan ? pan.textContent : "";
  check("volet : chip « Pôle en projet » à côté de « Dispositif en continu » (ADD)", pt.indexOf("Dispositif en continu") >= 0 && pt.indexOf("Pôle en projet — Aucune vente importée") >= 0);
  check("volet : bloc « Espace — 30 derniers jours » avec les mètres", pt.indexOf("Espace — 30 derniers jours") >= 0 && pt.indexOf("23,6 m de linéaire · Part de linéaire 11,7 %") >= 0);
  check("volet : aucun € par mètre sans vente, aucune part de marge", pt.indexOf("par mètre") < 0 && pt.indexOf("Part de marge") < 0);
}
// 2. Le même pôle quand le site vend : € par mètre, part de marge contre Part de linéaire, surface.
{
  const p2 = JSON.parse(JSON.stringify(payload));
  p2.poles = [polePayload(cave, caveSpace, { surface_m2: 18.5, revenue_per_m: 412.4, margin_per_m: 160.2, revenue_per_m2: 526.1, revenue_share: 0.152, margin_share: 0.171 })];
  const { body } = await render(p2);
  body.querySelector("[data-tb-pole]").click(); await tick();
  const pt = body.querySelector("#tb-pole-panel").textContent;
  check("volet : « 18,5 m² de surface de vente »", pt.indexOf("18,5 m² de surface de vente") >= 0);
  check("volet : « 412 € de CA par mètre · 160 € de marge brute par mètre · 526 € de CA par m² »", pt.indexOf("412 € de CA par mètre · 160 € de marge brute par mètre · 526 € de CA par m²") >= 0, pt);
  check("volet : « Part de marge 17,1 % contre Part de linéaire 11,7 % »", pt.indexOf("Part de marge 17,1 % contre Part de linéaire 11,7 %") >= 0);
}
// 3. Un pôle sans mesure : l'absence se dit.
{
  const p3 = JSON.parse(JSON.stringify(payload));
  p3.poles = [polePayload(cave, null)];
  const { body } = await render(p3);
  const card = body.querySelector("[data-tb-pole]");
  check("carte sans mesure : aucun « m de linéaire »", card.textContent.indexOf("m de linéaire") < 0);
  card.click(); await tick();
  check("volet sans mesure : « Aucune mesure d’espace pour l’instant. »", body.querySelector("#tb-pole-panel").textContent.indexOf("Aucune mesure d’espace pour l’instant.") >= 0);
}
console.log(fails ? `\n${fails} échec(s).` : "\nTout vert.");
process.exit(fails ? 1 : 0);
