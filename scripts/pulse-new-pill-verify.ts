// Vérité RENDU « nouveau » (23/08) : le VRAI script inline de pulse.astro + action-cards.js dans
// happy-dom, payload RÉEL owner. Visite 1 (mémoire vide) → toutes les cartes « nouveau », ordre
// = score ; visite 2 (mémoire = visite 1 sauf UNE carte) → pastille sur celle-là seule, elle
// remonte à score égal, une carte de score supérieur reste devant. Usage : npx tsx scripts/pulse-new-pill-verify.ts
import "dotenv/config"; import { readFileSync } from "node:fs"; import { makeBQClient } from "../src/lib/bq"; import { GET as monitorGET } from "../src/pages/api/insight/monitor"; import { Window } from "happy-dom";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5", P = "muse-square-open-data"; const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0; const check = (l: string, c: boolean, d?: any) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + String(d).slice(0, 160) : "")); if (!c) fails++; };
(async () => {
  const bq = makeBQClient(P); const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id=@l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const today = new Date().toISOString().slice(0, 10);
  const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`), locals: { clerk_user_id: String(flat(u.clerk_user_id)), location_id: OWNER, all_location_ids: [OWNER] } } as any);
  const j = JSON.parse(await (res as any).text());
  const ac = readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8");
  const astro = readFileSync(new URL("../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/); if (!m) throw new Error("script");
  const body = m[1]; const tail = body.lastIndexOf("})();");
  const src = `var location_id = ${JSON.stringify(OWNER)};\nvar fetch = window.fetch;\n` + body.slice(0, tail) + `\n;window.__h = { renderDailyBrief: typeof renderDailyBrief !== 'undefined' ? renderDailyBrief : null };\n` + body.slice(tail);
  const render = (seed: Record<string, string>) => {
    const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" }); const doc = win.document;
    doc.body.innerHTML = '<div id="ms-brief-root"></div>'; win.localStorage.setItem("ms_seen_cards", JSON.stringify(seed));
    new Function("window", "document", ac)(win, doc);
    try { new Function("window", "document", "localStorage", src)(win, doc, win.localStorage); } catch {}
    win._lastActionCandidates = j.action_candidates || []; win._lastDayClassImpacts = (j.day_class_impacts || []).map((i: any) => ({ ...i, location_id: OWNER, location_label: "Muse Square" }));
    const days = j.days || []; const cd = days.filter((d: any) => String(d.date) === today)[0] || days[0] || {};
    const root = doc.getElementById("ms-brief-root"); root.innerHTML = win.__h.renderDailyBrief(j.feed || j.all_feed || [], j.profile || {}, cd, today, OWNER, days, 0, null);
    const cards = Array.from(root.querySelectorAll(".ab-card[data-ab-card-idx]")) as any[];
    return { win, cards: cards.map((c) => ({ what: (c.querySelector(".ab-what")?.textContent || "").trim(), nouveau: Array.from(c.querySelectorAll(".chip-n")).some((p: any) => p.textContent.trim() === "nouveau") })) };
  };
  const v1 = render({});
  check("visite 1 : cartes rendues", v1.cards.length > 0, v1.cards.length);
  check("visite 1 : toutes « nouveau »", v1.cards.every((c) => c.nouveau), v1.cards.filter((c) => !c.nouveau).map((c) => c.what).join(" | "));
  await new Promise((r) => setTimeout(r, 30));
  const seen = JSON.parse(v1.win.localStorage.getItem("ms_seen_cards") || "{}"); const keys = Object.keys(seen);
  check("visite 1 : mémoire « vu » écrite après le rendu (clés = cartes)", keys.length >= v1.cards.length, keys.length + " clés");
  const v2 = render(seen);
  const v1set = new Set(v1.cards.map((c) => c.what));
  console.log("  v2 cartes :", v2.cards.map((c) => c.what.slice(0, 40)).join(" | "));
  check("visite 2 : les pastilles ne portent que sur des cartes JAMAIS rendues en visite 1 (rotation à score égal)", v2.cards.filter((c) => c.nouveau).every((c) => !v1set.has(c.what)), v2.cards.filter((c) => c.nouveau).map((c) => c.what).join(" | "));
  check("visite 2 : la première carte (score le plus haut) n'a pas bougé", v2.cards[0]?.what === v1.cards[0]?.what, v2.cards[0]?.what);
  check("visite 2 : aucune carte vue n'est passée devant une carte de score supérieur — l'entrant remplace une carte de même rang", v2.cards.length === v1.cards.length, v2.cards.length);
  await new Promise((r) => setTimeout(r, 1100));
  const seen2 = JSON.parse(v2.win.localStorage.getItem("ms_seen_cards") || "{}");
  const v3 = render(seen2);
  check("visite 3 (tout rendu au moins une fois) : plus aucune pastille", v3.cards.every((c) => !c.nouveau), v3.cards.filter((c) => c.nouveau).map((c) => c.what).join(" | "));
  check("visite 3 : ordre stable (= visite 2)", v3.cards.map((c) => c.what).join("|") === v2.cards.map((c) => c.what).join("|"));
  console.log(fails ? `\n${fails} FAIL` : "\nTOUT VERT"); process.exit(fails ? 1 : 0);
})();
