// Vérité RENDU mémoire 30 j par suivi (23/08, point 2) — script inline réel de tableau.astro,
// payload RÉEL owner (handler direct). Usage : npx tsx tools/harness/tableau-memoire-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";
const PROJECT = "muse-square-open-data", OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 200) : "")); if (!cond) fails++; };
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: String(flat(u.clerk_user_id)) }, location: "EU" });
const locals = { clerk_user_id: String(flat(u.clerk_user_id)), all_location_ids: locRows.map((r) => String(flat(r.location_id))) };
const t0 = Date.now();
const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals });
const payload = JSON.parse(await res.text());
console.log("  payload en", Date.now() - t0, "ms");
const fiches = (payload.glance.fiches || []).filter((f) => f.location_id === OWNER_LOC);
check("5 fiches Muse Square (competitor_tracking)", fiches.length === 5, fiches.map((f) => f.nom).join(" | "));
check("chaque fiche porte une mémoire de lecture quasi-quotidienne (nuits_30j ≥ 25)", fiches.every((f) => Number(f.nuits_30j) >= 25 && Number(f.nuits_30j) <= 31), fiches.map((f) => f.nuits_30j).join(","));
const guimet = fiches.find((f) => /Guimet/.test(f.nom));
check("Guimet : prochain événement nommé et daté dans le futur", guimet && guimet.prochain_nom && guimet.prochain_date >= new Date().toISOString().slice(0, 10) && Number(guimet.evts_a_venir) >= 1, JSON.stringify({ n: guimet && guimet.prochain_nom, d: guimet && guimet.prochain_date, a: guimet && guimet.evts_a_venir }));
// Invariant DATA-INDÉPENDANT (l'ancienne version codait en dur « Orangerie sans événement »
// et a cassé quand la donnée réelle a bougé, 24/08) : prochain nommé ⟺ au moins un à venir.
check("prochain_nom ⟺ evts_a_venir ≥ 1 (absence dite, jamais inventée)", fiches.every((f) => (f.prochain_nom != null) === (Number(f.evts_a_venir) > 0)), JSON.stringify(fiches.map((f) => ({ nom: f.nom.slice(0, 18), p: f.prochain_nom != null, a: f.evts_a_venir }))));

const astro = readFileSync(new URL("../../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const m = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/);
const win = new Window({ url: "https://app.local/app/insightevent/tableau" }); const doc = win.document;
doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
new Function("window", "document", "fetch", "alert", m[1])(win, doc, (url) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? payload : { ok: false }) }), () => {});
await new Promise((r) => setTimeout(r, 30));
const txt = doc.getElementById("tb-body").textContent;
check("ligne tarifs : « N tarifs · N nuits » aux valeurs DU payload", fiches.filter((f) => f.n_tarifs).every((f) => txt.indexOf(f.n_tarifs + " tarifs · " + f.nuits_30j + " nuits") >= 0), (txt.match(/\d+ tarifs[^<]{0,40}/g) || []).slice(0, 3).join(" | "));
check("prochain événement rendu : « prochain événement : … le JJ/MM »", /prochain événement : .+ le \d{2}\/\d{2}/.test(txt));
check("Guimet : « · 24 à venir »", txt.indexOf("· 24 à venir") >= 0);
// L'en-tête veille suit l'état RÉEL : changements détectés OU prix stables — les deux
// formes sont approuvées, l'assertion suit la branche du payload.
check("en-tête veille = la branche du payload (changements / prix stables)",
  (payload.glance.offres || []).length
    ? new RegExp((payload.glance.offres || []).length + " changements? détectés?").test(txt)
    : /Prix stables chez vos \d+ suivis/.test(txt));
check("★ infobulle : « N avis · +N sur 30 j » (Guimet)", (() => { const t = Array.from(doc.querySelectorAll("span[title*=' avis']")).map((e) => e.getAttribute("title")); return t.some((x) => /^\d[\d\u202f\u00a0 ]* avis · \+\d+ sur 30 j$/.test(x)); })(), Array.from(doc.querySelectorAll("span[title*=' avis']")).map((e) => e.getAttribute("title")).slice(0, 3).join(" | "));
check("rien d'inventé : aucun « prochain événement » sur une fiche sans événement (2 fiches avec, 3 sans)", (txt.match(/prochain événement/g) || []).length === fiches.filter((f) => f.prochain_nom).length, (txt.match(/prochain événement/g) || []).length);
console.log(fails ? `\n${fails} FAIL` : "\nTOUT VERT"); process.exit(fails ? 1 : 0);
