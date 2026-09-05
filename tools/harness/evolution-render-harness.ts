// Harnais de RENDU de la page évolution (le harnais EST la page) — LECTURE SEULE.
// Pour chaque engagement réel : GET /api/commitments/evolution DIRECT (vrai endpoint) →
// MSCardKit.renderEvolution RÉEL (happy-dom, EVOL_COPY réel) → assertions DOM (jauge
// tricolore, points pairs, ligne objectif, pas de courbe 1-point) + page screenshotable
// tools/harness/evolution-render-harness.html (7 documents rendus + styles réels).
// Usage : npx tsx tools/harness/evolution-render-harness.ts
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

const P = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = 'f10c3e58-326e-4e38-947c-d59fcbe51df5' LIMIT 1`, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [rows] = await bq.query({ query: `
    SELECT commitment_id, location_id FROM (
      SELECT commitment_id, location_id, status, created_at, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
      FROM \`${P}.analytics.action_commitments\`)
    WHERE rn = 1 AND status != 'cancelled' ORDER BY created_at DESC`, location: "EU" });
  const allLocs = Array.from(new Set((rows as any[]).map((r) => String(flat(r.location_id)))));

  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/engagement" });
  new Function("window", "document", readFileSync(new URL("../../public/js/card-kit.js", import.meta.url), "utf8"))(win, win.document);
  if (!win.MSCardKit || !win.MSCardKit.renderEvolution) throw new Error("card-kit non chargé");

  let fails = 0;
  const docs: string[] = [];
  for (const r of rows as any[]) {
    const id = String(flat(r.commitment_id));
    const res = await evoGET({ url: new URL(`http://l/api/commitments/evolution?commitment_id=${id}`), locals: { clerk_user_id: uid, location_id: String(flat(r.location_id)), all_location_ids: allLocs } } as any);
    const j = JSON.parse(await (res as any).text());
    if (!j.ok) { console.log("ENDPOINT KO", id, j.error); fails++; continue; }
    let html = "";
    try { html = win.MSCardKit.renderEvolution(j, EVOL_COPY); } catch (e: any) { console.log("RENDER THROW", id, String(e && e.message)); fails++; continue; }
    const k = j.kpi || {};
    const txt = String(j.commitment.committed_action_text || "").slice(0, 42).padEnd(44);
    const checks: string[] = [];
    const hasGauge = html.indexOf('viewBox="0 0 320 160"') >= 0;
    const hasDots = html.indexOf('viewBox="0 0 420 54"') >= 0;
    const hasGoalTick = html.indexOf(">objectif<") >= 0;
    const singleDayCurve = k.day_of && html.indexOf('viewBox="0 0 760 200"') >= 0;
    if (j.kpi && (k.realized != null || k.goal != null || k.baseline != null)) {
      if (!hasGauge) { checks.push("JAUGE ABSENTE"); }
      if (k.goal != null && !hasGoalTick) { checks.push("OBJECTIF ABSENT"); }
      if (k.day_of && (k.peers || []).length && !hasDots) { checks.push("PAIRS ABSENTS"); }
      if (singleDayCurve) { checks.push("COURBE 1 POINT"); }
    } else if (!j.kpi) { checks.push("kpi null (repli historique)"); }
    // Tricolore : la couleur d'arc attendue selon la règle owner.
    let expCol: string | null = null;
    if (k.realized != null) {
      expCol = (k.baseline != null && k.realized < k.baseline) ? "#b91c1c" : (k.goal != null ? (k.realized >= k.goal ? "#059669" : "#B45309") : "#059669");
      if (html.indexOf('stroke="' + expCol + '" stroke-width="20"') < 0) checks.push("COULEUR ARC FAUSSE (attendu " + expCol + ")");
    }
    if (checks.filter((c) => c !== "kpi null (repli historique)").length) fails++;
    console.log(txt, "| kpi:", String(k.metric || "—").padEnd(16), "| jauge:", hasGauge ? "oui" : "non", "| arc:", expCol || "—", "|", checks.length ? checks.join(" · ") : "OK");
    docs.push('<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px 26px;margin-bottom:26px;">' + html + "</div>");
  }
  // Page screenshotable : styles réels de la page évolution (eg-sec/eg-uc minimaux).
  const css = ".eg-sec{margin-top:26px;} .eg-uc{font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#6B7280;margin-bottom:10px;} body{margin:0;background:#FAFAFA;font-family:-apple-system,system-ui,sans-serif;color:#111827;} .wrap{max-width:860px;margin:26px auto 60px;padding:0 16px;}";
  const dest = new URL("../harness/evolution-render-harness.html", import.meta.url).pathname;
  writeFileSync(dest, "<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>Harnais rendu évolution</title><style>" + css + "</style></head><body><div class='wrap'>" + docs.map((d, i) => "<div data-doc='" + i + "'>" + d + "</div>").join("") + "</div><script>var sk=Number(new URLSearchParams(location.search).get('skip')||0);document.querySelectorAll('[data-doc]').forEach(function(el,i){if(i<sk)el.style.display='none';});</" + "script></body></html>");
  console.log(fails ? "ÉCHECS: " + fails : "TOUT VERT", "· page écrite:", dest);
  if (fails) process.exit(1);
})();
