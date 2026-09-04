// Harnais proto « Piloter PAGE ENTIÈRE » (17/08, validé owner : 3 variantes de carte). LECTURE SEULE.
// Capture RÉELLE : (1) le rendu tableau réel (happy-dom) → tuiles héros, rangées À faire,
// résumés des volets radar ; (2) la série JOUR réelle du Coupon (conversion, 7 j) via le vrai
// endpoint évolution — tronquée à 4 j pour l'état « Jour 4/7 », étiquetée rejouée ; (3) la
// frise réelle de la série Corner (occurrences + verdicts par saved_item_id).
// Usage : npx tsx tools/generators/piloter-full-proto-data.ts
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: (locRows as any[]).map((r) => String(flat(r.location_id))) };

  // ── 1. Rendu tableau RÉEL → textes structurés. ──
  const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals } as any);
  const payload = JSON.parse(await (res as any).text());
  const astro = readFileSync(new URL("../../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
  const m = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/);
  if (!m) throw new Error("script inline introuvable");
  const win: any = new Window({ url: "https://app.local/app/insightevent/tableau" });
  const doc = win.document;
  doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
  const fetchStub = (url: any) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? payload : { ok: false }) });
  new Function("window", "document", "fetch", "alert", m[1])(win, doc, fetchStub, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const body = doc.getElementById("tb-body");
  const tiles = Array.from(body.querySelectorAll(".tb-tile")).map((t: any) => ({
    k: (t.querySelector(".tb-eb") || {}).textContent || "", n: (t.querySelector(".n") || {}).textContent || "", s: (t.querySelector(".s") || {}).textContent || "",
  }));
  const afaire = Array.from(body.querySelectorAll(".tb-af")).slice(0, 6).map((r: any) => {
    const sp = r.querySelectorAll(":scope > span");
    // Rangée non datée : la vraie page marque l'état par une PUCE colorée — capturer sa couleur.
    let dot: string | null = null;
    if (sp[0]) {
      const d = sp[0].querySelector('span[style*="border-radius:50%"]');
      const dm = d ? String(d.getAttribute("style") || "").match(/background:\s*([^;]+)/) : null;
      dot = dm ? dm[1].trim() : null;
    }
    return {
      quand: sp[0] ? sp[0].textContent.trim() : "", dot,
      titre: (r.querySelector(".t") || {}).textContent || "",
      sub: (r.querySelector(".u") || {}).textContent || "", droite: sp[2] ? sp[2].textContent.trim() : "",
      geste: sp[3] ? sp[3].textContent.trim() : "",
    };
  });
  const volets = Array.from(body.querySelectorAll(".tb-rv")).map((v: any) => {
    const dotEl = v.querySelector("span span");
    const dotStyle = dotEl ? String(dotEl.getAttribute("style") || "") : "";
    const dotM = dotStyle.match(/background:\s*([^;]+)/);
    const vid = String(v.getAttribute("data-tb-volet") || "");
    const bodyEl = body.querySelector('[data-tb-body="' + vid + '"]');
    return {
      id: vid,
      label: ((v.querySelector(".l") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      resume: ((v.querySelector(".r") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      dot: dotM ? dotM[1].trim() : "#9CA3AF",
      // Le CORPS RÉEL du volet (markup de la vraie page) — la maquette combinée l'ouvre en place.
      body_html: bodyEl ? bodyEl.innerHTML : "",
    };
  });

  // ── 2. Série jour réelle du Coupon (conversion 7 j) via le VRAI endpoint évolution. ──
  const [cc] = await bq.query({ query: `
    SELECT commitment_id FROM (SELECT commitment_id, measured_metric, status, created_at,
      ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
      FROM \`${P}.analytics.action_commitments\`)
    WHERE rn = 1 AND measured_metric = 'conversion' AND status = 'resolved' ORDER BY created_at DESC LIMIT 1`, location: "EU" });
  let coupon: any = null;
  if ((cc as any[]).length) {
    const cid = String(flat((cc as any[])[0].commitment_id));
    const er = await evoGET({ url: new URL(`http://l/api/commitments/evolution?commitment_id=${cid}`), locals } as any);
    const ej = JSON.parse(await (er as any).text());
    if (ej.ok && ej.kpi) coupon = { commitment_id: cid, texte: ej.commitment.committed_action_text, kpi: ej.kpi, site: ej.site_name || "Occitanie" };
  }

  // ── 3. Frise réelle de la série Corner : les occurrences viennent du VRAI endpoint dossier
  //    (les dates d'une série y sont générées — pas de colonne dates en base). ──
  const { GET: evtGET } = await import("../../src/pages/api/insight/evenement");
  const [si] = await bq.query({ query: `
    SELECT saved_item_id, title, kpi_family, kpi_target_eur
    FROM \`${P}.raw.saved_items\` WHERE location_id = @l AND recurrence != 'none'
    ORDER BY created_at DESC LIMIT 1`, params: { l: OWNER }, location: "EU" });
  let serie: any = null;
  if ((si as any[]).length) {
    const it0 = (si as any[])[0];
    const sid = String(flat(it0.saved_item_id));
    const dr = await evtGET({ url: new URL(`http://l/api/insight/evenement?location_id=${OWNER}&saved_item_id=${sid}`), locals } as any);
    const dj = JSON.parse(await (dr as any).text());
    const it = { title: flat(it0.title), kpi_family: flat(it0.kpi_family), kpi_target_eur: flat(it0.kpi_target_eur), dates: ((dj.item || {}).dates || []) };
    const [vs] = await bq.query({ query: `
      SELECT CAST(window_start AS STRING) d, verdict, status, kpi_window_value FROM (
        SELECT window_start, verdict, status, kpi_window_value, saved_item_id,
          ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
        FROM \`${P}.analytics.action_commitments\`)
      WHERE rn = 1 AND saved_item_id = @s AND status != 'cancelled'`, params: { s: sid }, location: "EU" });
    const byDate: Record<string, any> = {};
    for (const v of vs as any[]) byDate[String(flat(v.d))] = { verdict: flat(v.verdict), status: String(flat(v.status)), val: flat(v.kpi_window_value) != null ? Number(flat(v.kpi_window_value)) : null };
    serie = {
      titre: String(it.title), famille: it.kpi_family, cible: it.kpi_target_eur != null ? Number(it.kpi_target_eur) : null,
      occ: (it.dates as any[]).map((d: any) => ({ d: String(d).slice(0, 10), ...(byDate[String(d).slice(0, 10)] || {}) })),
    };
  }

  const out = { captured_at: new Date().toISOString(), tiles, afaire, volets, mesures: ((payload.glance || {}).mesures) || [], coupon, serie };
  writeFileSync(new URL("../proto/piloter-full-proto-data.js", import.meta.url).pathname, "window.PILOTER_FULL = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("tuiles:", tiles.length, "· à faire:", afaire.length, "· volets:", volets.length,
    "· coupon jours:", coupon ? (coupon.kpi.daily || []).length : 0, "· série occ:", serie ? serie.occ.length : 0);
})();
