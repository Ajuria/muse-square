// HARNAIS DE RENDU PULSE — le harnais EST la page. LECTURE SEULE côté données.
// Exécute le VRAI script inline de pulse.astro + le VRAI public/js/action-cards.js dans
// happy-dom, avec le payload monitor RÉEL du compte owner, puis rend le brief
// (renderDailyBrief → wireBriefHandlers → buildTriageLayout) et INSPECTE LE DOM :
// boutons présents ? visibles (pas de display:none hérité) ? styles CSS atteignables ?
// Né du 15/08 : deux fois j'ai déclaré « artefact de copie » sur la seule émission
// SOURCE alors que l'owner regardait sa page. Ce harnais tranche par le DOM.
// Usage : npx tsx tools/harness/pulse-render-harness.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = process.env.HARNESS_LOC || "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  // ── 1. Payload monitor réel (même invocation directe que agir-proto-harness). ──
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const today = new Date().toISOString().slice(0, 10);
  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
  const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`), locals } as any);
  const j = JSON.parse(await (res as any).text());
  console.log("monitor:", (res as any).status, "· candidates:", (j.action_candidates || []).length);

  // ── 2. happy-dom + scripts réels. ──
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const doc = win.document;
  doc.body.innerHTML = '<div id="ms-brief-root"></div>';
  // fetch stub : les appels annexes du wiring rendent vide/ok — le rendu ne doit pas en dépendre.
  win.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });

  const ac = readFileSync(new URL("../../public/js/action-cards.js", import.meta.url), "utf8");
  new Function("window", "document", ac)(win, win.document);

  const astro = readFileSync(new URL("../../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/);
  if (!m) throw new Error("script inline introuvable");
  // Globals que d'autres <script> de la page (define:vars…) posent avant le script principal.
  const prelude = `var location_id = ${JSON.stringify(OWNER)};\nvar fetch = window.fetch;\n`;
  // Export des fonctions internes : le script est UNE IIFE — l'export doit vivre DEDANS
  // (avant le dernier `})()`), sinon typeof renderDailyBrief y est undefined.
  const exportJs = `\n;window.__h = { renderDailyBrief: typeof renderDailyBrief !== 'undefined' ? renderDailyBrief : null, wireBriefHandlers: typeof wireBriefHandlers !== 'undefined' ? wireBriefHandlers : null, buildTriageLayout: typeof buildTriageLayout !== 'undefined' ? buildTriageLayout : null };\n`;
  const body = m[1];
  const tail = body.lastIndexOf("})();");
  if (tail < 0) throw new Error("fin d'IIFE introuvable");
  const src = prelude + body.slice(0, tail) + exportJs + body.slice(tail);
  try {
    new Function("window", "document", "localStorage", src)(win, doc, win.localStorage);
  } catch (e: any) {
    console.log("BOOT top-level a levé (souvent bénin si __h est posé) :", String(e && e.message).slice(0, 200));
  }
  const h = win.__h || {};
  if (!h.renderDailyBrief) throw new Error("renderDailyBrief non exporté — le script a planté avant sa définition");

  // ── 3. Rendu réel. ──
  win._lastActionCandidates = j.action_candidates || [];
  // Motifs structurels : le boot réel les stampe location_id/label en flatMap multi-sites.
  win._lastDayClassImpacts = (j.day_class_impacts || []).map((i: any) => ({ ...i, location_id: OWNER, location_label: process.env.HARNESS_LBL || "Muse Square" }));
  const days = j.days || [];
  const currentDay = days.filter((d: any) => String(d.date) === today)[0] || days[0] || {};
  const allFeed = j.feed || j.all_feed || [];
  const root = doc.getElementById("ms-brief-root");
  root.innerHTML = h.renderDailyBrief(allFeed, j.profile || {}, currentDay, today, OWNER, days, 0, null);
  try { h.wireBriefHandlers(root, OWNER, today); } catch (e: any) {
    console.log("wireBriefHandlers a levé :", String(e && e.message).slice(0, 200));
    try { h.buildTriageLayout(); } catch (e2: any) { console.log("buildTriageLayout a levé :", String(e2 && e2.message).slice(0, 200)); }
  }

  // ── 4. Inspection DOM — la seule vérité. ──
  const q = (sel: string) => Array.from(root.querySelectorAll(sel)) as any[];
  const cards = q(".ab-card[data-ab-card-idx]");
  const communiquer = q("[data-agir-comm], [data-agir-alert]");
  const gestes = q("[data-agir-commit]");
  const dispo = q("[data-ab-dispo-btn]");
  console.log("\n=== DOM RENDU (compte owner, aujourd'hui) ===");
  console.log("cartes datées:", cards.length);
  console.log("boutons Communiquer ([data-agir-comm|alert]):", communiquer.length);
  console.log("cartes structurelles pleines:", q("[data-struct-full]").length, "· leurs Communiquer:", q("[data-struct-comm]").length);
  console.log("boutons geste bleu ([data-agir-commit]):", gestes.length);
  console.log("boutons disposition (Déjà fait/Pas pour moi):", dispo.length);
  const hidden = (el: any): string | null => {
    for (let n = el; n && n.getAttribute; n = n.parentElement) {
      const s = String(n.getAttribute("style") || "");
      if (/display\s*:\s*none/.test(s)) return `<${n.tagName.toLowerCase()} ${String(n.className || "").split(" ")[0]}>`;
    }
    return null;
  };
  const masked = communiquer.concat(gestes).map((b) => hidden(b)).filter(Boolean);
  console.log("boutons CTA sous un display:none:", masked.length, masked.slice(0, 3));
  const sample = cards[0];
  if (sample) {
    const foot = sample.querySelector("[data-ab-draft-sub]");
    console.log("\npied de la 1re carte (texte):", String(foot ? foot.textContent : "—").replace(/\s+/g, " ").trim().slice(0, 160));
    console.log("pied 1re carte (boutons):", Array.from(foot ? foot.querySelectorAll("button") : []).map((b: any) => b.textContent.trim()));
  }
  // Styles atteignables ? (règle CLAUDE.md : le <style> scopé Astro n'atteint pas l'HTML injecté)
  const styleBlocks = astro.match(/<style[^>]*>/g) || [];
  console.log("\nblocs <style> de la page:", styleBlocks);
  const hasCta = /\.pls-cta-pri\b/.test(astro) && /\.pls-cta-sec\b/.test(astro);
  console.log("classes .pls-cta-* définies dans la page:", hasCta);

  // ── 5. Page visuelle : le DOM rendu + le VRAI <style is:inline> de pulse, servis tels
  //    quels — pour screenshot dans un vrai Chromium (le harnais EST la page). ──
  const styleM = astro.match(/<style is:inline>\n([\s\S]*?)\n\s*<\/style>/);
  const pageCss = styleM ? styleM[1] : "";
  // Pli forcé OUVERT pour voir toutes les cartes (le vrai pli s'ouvre au clic).
  q("[data-t-cards] .ab-card, .ab-card").forEach((c: any) => { const s = String(c.getAttribute("style") || "").replace(/display\s*:\s*none;?/, ""); c.setAttribute("style", s); });
  const { writeFileSync } = await import("node:fs");
  const dest = new URL("../harness/pulse-render-harness.html", import.meta.url).pathname;
  writeFileSync(dest, "<!doctype html><html><head><meta charset='utf-8'><title>Harnais rendu Pulse</title><style>" + pageCss + "\nbody{max-width:860px;margin:24px auto;font-family:-apple-system,system-ui,sans-serif;background:#FAFAFA;}</style></head><body>" + root.innerHTML + "</body></html>");
  console.log("page écrite:", dest);
})();
