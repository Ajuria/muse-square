// HARNAIS « photo de la carte famille » (11/09) — BQ RÉEL, compte owner Muse Square, sondes nettoyées.
// Le harnais EST la page : il appelle le VRAI GET du monitor et rend le VRAI script de pulse.astro + le VRAI
// public/js/action-cards.js dans happy-dom, comme tools/harness/pulse-render-harness.ts.
// Déroulé : (1) monitor sans sonde — les cartes famille du jour, aucune family_photo ; (2) sondes : UN pôle
// permanent (2 composants) + DEUX photos lues de la même famille — p1 (1 famille, plus ancienne) et p2
// (2 familles, plus récente) : la plus spécifique doit gagner ; (3) monitor avec sondes : la carte famille
// porte family_photo = variante « band » de p1, son nom, son N° sur le plan, sa date ; aucune autre carte ne
// la porte ; (4) rendu : .ab-media.photo avec l'image de p1 et sa légende ; (5) nettoyage (finally), relu à 0.
// Écrit dans analytics.action_commitments et analytics.dispositif_photos (préfixe probe-famphoto-), jamais
// dans le bucket : l'image n'est pas servie ici, seule son URL est vérifiée.
// Usage : npm run harness:family-photo
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";
import { insertPhotoRow } from "../../src/lib/dispositifs/dispositifPhotos";
import { listFamilyPhotos, FAMILY_PHOTO_CARD_TYPES } from "../../src/lib/dispositifs/familyPhotos";

const P = "muse-square-open-data";
const OWNER = process.env.HARNESS_LOC || "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const PFX = "probe-famphoto-";
const DISP = PFX + "d1";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
let failed = 0;
function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 220) : ""));
  if (!cond) { failed++; process.exitCode = 1; }
}

async function cleanup(bq: any): Promise<number> {
  await bq.query({ query: `DELETE FROM \`${P}.analytics.dispositif_photos\` WHERE location_id = @l AND STARTS_WITH(photo_id, @pfx)`, params: { l: OWNER, pfx: PFX }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE location_id = @l AND STARTS_WITH(commitment_id, @pfx)`, params: { l: OWNER, pfx: PFX }, location: "EU" });
  const [[c]] = await bq.query({ query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.dispositif_photos\` WHERE location_id = @l AND STARTS_WITH(photo_id, @pfx)) + (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE location_id = @l AND STARTS_WITH(commitment_id, @pfx)) AS n`, params: { l: OWNER, pfx: PFX }, location: "EU" });
  return Number(flat(c.n));
}

async function monitor(uid: string, today: string): Promise<any> {
  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
  const t = Date.now();
  const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`), locals } as any);
  const j = JSON.parse(await (res as any).text());
  console.log(`monitor: ${(res as any).status} en ${Date.now() - t} ms · candidates: ${(j.action_candidates || []).length}`);
  return j;
}
const familyCards = (j: any) => (j.action_candidates || []).filter((c: any) => FAMILY_PHOTO_CARD_TYPES.includes(String(c.action_type)) && c.data_payload && c.data_payload.item_category);

async function render(j: any, today: string): Promise<any> {
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const doc = win.document;
  doc.body.innerHTML = '<div id="ms-brief-root"></div>';
  win.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
  new Function("window", "document", readFileSync(new URL("../../public/js/action-cards.js", import.meta.url), "utf8"))(win, doc);
  const astro = readFileSync(new URL("../../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/);
  if (!m) throw new Error("script inline introuvable");
  const body = m[1]; const tail = body.lastIndexOf("})();");
  const src = `var location_id = ${JSON.stringify(OWNER)};\nvar fetch = window.fetch;\n` + body.slice(0, tail)
    + `\n;window.__h = { renderDailyBrief: typeof renderDailyBrief !== 'undefined' ? renderDailyBrief : null, wireBriefHandlers: typeof wireBriefHandlers !== 'undefined' ? wireBriefHandlers : null, buildTriageLayout: typeof buildTriageLayout !== 'undefined' ? buildTriageLayout : null };\n` + body.slice(tail);
  try { new Function("window", "document", "localStorage", src)(win, doc, win.localStorage); } catch (e: any) { console.log("BOOT a levé (souvent bénin) :", String(e && e.message).slice(0, 160)); }
  const h = win.__h || {};
  if (!h.renderDailyBrief) throw new Error("renderDailyBrief non exporté");
  win._lastActionCandidates = j.action_candidates || [];
  win._lastDayClassImpacts = (j.day_class_impacts || []).map((i: any) => ({ ...i, location_id: OWNER, location_label: "Muse Square" }));
  const days = j.days || []; const currentDay = days.filter((d: any) => String(d.date) === today)[0] || days[0] || {};
  const root = doc.getElementById("ms-brief-root");
  root.innerHTML = h.renderDailyBrief(j.feed || j.all_feed || [], j.profile || {}, currentDay, today, OWNER, days, 0, null);
  try { h.wireBriefHandlers(root, OWNER, today); } catch { try { h.buildTriageLayout(); } catch { /* rendu déjà posé */ } }
  return root;
}

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const today = new Date().toISOString().slice(0, 10);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  console.log("nettoyage préalable, sondes restantes :", await cleanup(bq));

  // (1) Sans sonde.
  const j0 = await monitor(uid, today);
  const fam0 = familyCards(j0);
  console.log("cartes famille du jour :", fam0.map((c: any) => `${c.action_type}/${c.data_payload.item_category}`));
  if (!fam0.length) { console.log("Aucune carte famille aujourd'hui : rien à vérifier."); return; }
  assert("(1) sans sonde, aucune carte ne porte family_photo", (j0.action_candidates || []).every((c: any) => !c.data_payload?.family_photo));
  const fam = String(fam0[0].data_payload.item_category);

  try {
    // (2) Sondes.
    const now = Date.now();
    await bq.query({
      query: `INSERT INTO \`${P}.analytics.action_commitments\`
        (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
         dispositif_id, version_no, dispositif_nature, committed_action_text, components)
        VALUES (@c, @u, @l, 'open', 'user', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), 'create', @d, 1, 'permanent', 'Pôle sonde — photo famille', @comp)`,
      params: { c: PFX + "c1", u: uid, l: OWNER, d: DISP, comp: JSON.stringify([
        { key: "c1", type: "lineaire", role: null, label: "Sonde linéaire" },
        { key: "c2", type: "table_ilot", role: null, label: "Sonde îlot" },
      ]) }, location: "EU",
    });
    const base = { location_id: OWNER, dispositif_id: DISP, version_no: 1, walk_id: null, seq: null, t_offset_s: null, gcs_uri: "gs://ms-dispositif-photo/probe", dispositif_role: null, status: "read" as const, checklist: null, items_matched: null, items_confirmed: null, prices_seen: null, coverage_flag: "entier", model: "probe", prompt_version: "probe", created_by: uid, levels: null };
    await insertPhotoRow(bq, { ...base, photo_id: PFX + "p1", component_key: "c1", dispositif_type: "lineaire", exposition: "rayonnage", families_present: [fam], fixture_no: 7, created_at: new Date(now - 3600_000).toISOString() });
    await insertPhotoRow(bq, { ...base, photo_id: PFX + "p2", component_key: "c2", dispositif_type: "table_ilot", exposition: "ilot", families_present: [fam, "Famille sonde"], fixture_no: 9, created_at: new Date(now).toISOString() });

    const t = Date.now(); const rows = await listFamilyPhotos(bq, OWNER); const dt = Date.now() - t;
    const probeRows = rows.filter((r) => r.photo_id.startsWith(PFX));
    assert("(2) la lecture semantic voit les deux photos sonde, composant nommé", probeRows.length === 2 && probeRows.every((r) => !!r.component_label), probeRows.map((r) => [r.photo_id, r.component_label, r.families_present]));
    console.log(`listFamilyPhotos seule : ${dt} ms`);

    // (3) Monitor avec sondes.
    const j1 = await monitor(uid, today);
    const fam1 = familyCards(j1).filter((c: any) => String(c.data_payload.item_category) === fam);
    const dp = fam1[0]?.data_payload || {};
    assert("(3) la carte famille porte la variante band de la photo la plus spécifique (p1)", String(dp.family_photo || "").includes(`file=${PFX}p1`) && String(dp.family_photo || "").endsWith("&variant=band"), dp.family_photo);
    assert("(3) nom du composant, N° sur le plan, date de la photo", dp.family_photo_label === "Sonde linéaire" && dp.family_photo_fixture_no === 7 && dp.family_photo_date === new Date(now - 3600_000).toISOString().slice(0, 10), [dp.family_photo_label, dp.family_photo_fixture_no, dp.family_photo_date]);
    assert("(3) toutes les cartes de cette famille la portent", fam1.length > 0 && fam1.every((c: any) => String(c.data_payload.family_photo || "").includes(PFX + "p1")), fam1.length);
    const leaks = (j1.action_candidates || []).filter((c: any) => c.data_payload?.family_photo && !FAMILY_PHOTO_CARD_TYPES.includes(String(c.action_type)));
    assert("(3) aucune carte hors des quatre types famille ne la porte", leaks.length === 0, leaks.map((c: any) => c.action_type));

    // (4) Rendu réel.
    const root = await render(j1, today);
    const imgs = Array.from(root.querySelectorAll(".ab-media.photo img")).filter((i: any) => String(i.getAttribute("src")).includes(PFX + "p1")) as any[];
    const cap = imgs[0] ? String(imgs[0].parentElement.querySelector(".cap")?.textContent || "").replace(/\s+/g, " ").trim() : "";
    const dFr = (() => { const d = new Date(now - 3600_000).toISOString().slice(0, 10); return d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4); })();
    assert("(4) Pulse rend l'image de p1 dans .ab-media.photo", imgs.length > 0, imgs.map((i: any) => i.getAttribute("src")));
    assert("(4) légende : « Sonde linéaire · N° sur le plan : 7 » et la date JJ/MM/AAAA", cap === `Sonde linéaire · N° sur le plan : 7${dFr}` || (cap.startsWith("Sonde linéaire · N° sur le plan : 7") && cap.endsWith(dFr)), cap);
    if (imgs[0]) console.log("\nHTML du média :", String(imgs[0].parentElement.outerHTML).slice(0, 400));
    // HARNESS_DUMP=<fichier> : écrit la CARTE rendue (hors dépôt) pour une capture dans un vrai navigateur.
    if (imgs[0] && process.env.HARNESS_DUMP) { const card = imgs[0].closest(".ab-card"); (await import("node:fs")).writeFileSync(process.env.HARNESS_DUMP, String(card ? card.outerHTML : imgs[0].parentElement.outerHTML)); console.log("carte écrite :", process.env.HARNESS_DUMP); }
  } finally {
    const left = await cleanup(bq);
    assert("(5) sondes effacées, relu à 0", left === 0, left);
    console.log(failed ? `\n${failed} échec(s)` : "\nTout vert.");
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
