// Harnais incréments 9a-9c (vue équipe) — onglet Pôles + APIs de gestion.
// Endpoints RÉELS (BQ + Slack réels, compte f10c3e58) ; sondes nettoyées.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OTHER_LOC = "ff2aeb35-084f-4bbf-915c-94faf7be8785";
const P = "muse-square-open-data";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 220) : ""));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = rawKey ? new BigQuery({ projectId: P, credentials: JSON.parse(rawKey) }) : new BigQuery({ projectId: P });
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC, OTHER_LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const memberLocals = { clerk_user_id: "user_m9", real_clerk_user_id: "user_m9", all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [] }, role: "member" };

  async function get(mod: any, path: string, locals: any) {
    const r: Response = await (mod as any)({ url: new URL("http://localhost" + path), locals });
    return { status: r.status, body: await r.json() };
  }
  async function send(fn: any, locals: any, body: any, method = "POST") {
    const r: Response = await fn({ request: new Request("http://localhost/x", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }), locals });
    return { status: r.status, body: await r.json() };
  }

  // ── slack-directory (réel) ──
  const dirMod = await import("../src/pages/api/channels/slack-directory");
  const dir = await get(dirMod.GET, "/api/channels/slack-directory?location_id=" + LOC, ownerLocals);
  assert("directory 200", dir.status === 200 && dir.body.ok === true);
  assert("directory : canaux où le bot est membre (muse_square_app présent)", (dir.body.channels || []).some((c: any) => c.name === "muse_square_app"), dir.body.channels);
  assert("directory : humains avec email", (dir.body.users || []).length >= 5 && (dir.body.users || []).every((u: any) => u.id), { n: (dir.body.users || []).length });
  const dirM = await get(dirMod.GET, "/api/channels/slack-directory?location_id=" + LOC, memberLocals);
  assert("directory : membre refusé (403 — geste owner)", dirM.status === 403);

  // ── members API : cycle complet ──
  const memMod = await import("../src/pages/api/channels/members");
  const created = await send(memMod.POST, ownerLocals, { location_id: LOC, member_id: "probe-inc9-m1", member_email: "probe9@example.invalid", pole_dispositif_ids: ["pole-a"] });
  assert("members POST création", created.status === 200 && created.body.member_id === "probe-inc9-m1", created.body);
  let listed = await get(memMod.GET, "/api/channels/members?location_id=" + LOC, ownerLocals);
  let row = (listed.body.items || []).find((m: any) => m.member_id === "probe-inc9-m1");
  assert("members GET : email + pôles + non connecté", row && row.member_email === "probe9@example.invalid" && JSON.stringify(row.pole_dispositif_ids) === '["pole-a"]' && row.connected === false, row);
  const upd = await send(memMod.POST, ownerLocals, { location_id: LOC, member_id: "probe-inc9-m1", slack_user_id: "U_PROBE9" });
  assert("members POST maj identité Slack", upd.status === 200);
  listed = await get(memMod.GET, "/api/channels/members?location_id=" + LOC, ownerLocals);
  row = (listed.body.items || []).find((m: any) => m.member_id === "probe-inc9-m1");
  assert("copy-forward : email ET pôles CONSERVÉS, slack posé", row && row.member_email === "probe9@example.invalid" && JSON.stringify(row.pole_dispositif_ids) === '["pole-a"]' && row.slack_user_id === "U_PROBE9", row);
  const memberTry = await send(memMod.POST, memberLocals, { location_id: LOC, member_email: "x@y.z" });
  assert("members POST : membre refusé (403)", memberTry.status === 403);
  const del = await send(memMod.DELETE, ownerLocals, { location_id: LOC, member_id: "probe-inc9-m1" }, "DELETE");
  assert("members DELETE tombstone", del.status === 200);
  listed = await get(memMod.GET, "/api/channels/members?location_id=" + LOC, ownerLocals);
  assert("members GET : tombstoné invisible", !(listed.body.items || []).some((m: any) => m.member_id === "probe-inc9-m1"));

  // ── forward GET (adresses de canal) ──
  const fwdMod = await import("../src/pages/api/channels/forward");
  await send(fwdMod.PUT, ownerLocals, { location_id: LOC, dispositif_id: "probe-inc9-pole", slack_channel_id: "C0PROBE9" }, "PUT");
  let fg = await get(fwdMod.GET, "/api/channels/forward?location_id=" + LOC, ownerLocals);
  assert("forward GET : canal posé visible", fg.status === 200 && (fg.body.items || []).some((i: any) => i.dispositif_id === "probe-inc9-pole" && i.slack_channel_id === "C0PROBE9"), fg.body.items);
  await send(fwdMod.PUT, ownerLocals, { location_id: LOC, dispositif_id: "probe-inc9-pole", slack_channel_id: null }, "PUT");
  fg = await get(fwdMod.GET, "/api/channels/forward?location_id=" + LOC, ownerLocals);
  assert("forward GET : canal retiré invisible", !(fg.body.items || []).some((i: any) => i.dispositif_id === "probe-inc9-pole"));

  // ── Modules client (vm) : le partagé existe, event-form n'a plus sa copie ──
  const ctx: any = { console }; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync("public/pole-form.js", "utf8"), ctx);
  assert("MSPoleForm exposé par le module partagé", typeof ctx.MSPoleForm === "object" && typeof ctx.MSPoleForm.render === "function");
  const ef = readFileSync("public/event-form.js", "utf8");
  assert("event-form : plus de copie du panneau (délégué au module)", !ef.includes("data-ef-pole-submit") && ef.includes("MSPoleForm.render"));
  const pf = readFileSync("public/pole-form.js", "utf8");
  assert("libellé owner 28/08 : Familles de produits & services", pf.includes("Familles de produits &amp; services"));
  assert("garde une famille = un pôle présente", pf.includes("une famille vit dans un seul pôle"));

  // ── Nettoyage ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE member_id LIKE 'probe-inc9-%'`, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.dispositif_channels\` WHERE dispositif_id = 'probe-inc9-pole'`, location: "EU" });
  const [cnt] = await bq.query({ query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.location_members\`) + (SELECT COUNT(*) FROM \`${P}.analytics.dispositif_channels\`) n`, location: "EU" });
  assert("sondes nettoyées", Number((cnt as any[])[0].n) === 0, (cnt as any[])[0]);
}

main().then(() => phase9d()).catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });

// ── Phase 9d : copie d'invitation (mots owner, élision) + envoi RÉEL à l'owner ──
export async function phase9d() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = rawKey ? new BigQuery({ projectId: P, credentials: JSON.parse(rawKey) }) : new BigQuery({ projectId: P });
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, first_name: "Julen", all_location_ids: [LOC, OTHER_LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const { invitationEmailFr } = await import("../src/lib/channels/slackMessagesFr");

  const inv1 = invitationEmailFr({ senderName: "Julen", companyName: "Épices et Tout" });
  assert("invitation : élision d'Épices et Tout", inv1.subject === "Julen vous invite à rejoindre Muse Square"
    && inv1.body.startsWith("Julen d'Épices et Tout vous invite à rejoindre Muse Square, la plateforme de l'intrapreneuriat commercial.")
    && inv1.body.includes("Pour rejoindre un des pôles d'Épices et Tout, créez votre compte ici : https://"), { body: inv1.body });
  const inv2 = invitationEmailFr({ senderName: "Julen", companyName: "Muse Square" });
  assert("invitation : « de Muse Square » (pas d'élision)", inv2.body.includes("Julen de Muse Square vous invite") && inv2.body.includes("pôles de Muse Square"), { body: inv2.body });
  assert("invitation : aucun mot banni", !/attendu|la normale/i.test(inv1.body + inv2.body));

  const memMod = await import("../src/pages/api/channels/members");
  async function send(fn: any, locals: any, body: any, method = "POST") {
    const r: Response = await fn({ request: new Request("http://localhost/x", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }), locals });
    return { status: r.status, body: await r.json() };
  }
  // Sans email sur la fiche → 400 honnête.
  await send(memMod.POST, ownerLocals, { location_id: LOC, member_id: "probe-inc9d-noemail", member_email: "x@y.z" });
  await bq.query({ query: `UPDATE \`${P}.analytics.location_members\` SET member_email = NULL WHERE member_id = 'probe-inc9d-noemail'`, location: "EU" });
  const ko = await send(memMod.PUT, ownerLocals, { location_id: LOC, member_id: "probe-inc9d-noemail" }, "PUT");
  assert("invitation sans email → 400", ko.status === 400, ko.body);
  // Envoi RÉEL : fiche-sonde avec l'email de l'owner — l'email d'invitation part vraiment.
  await send(memMod.POST, ownerLocals, { location_id: LOC, member_id: "probe-inc9d-real", member_email: "julen@musesquare.com" });
  const okSend = await send(memMod.PUT, ownerLocals, { location_id: LOC, member_id: "probe-inc9d-real" }, "PUT");
  assert("invitation ENVOYÉE (réel, à l'owner)", okSend.status === 200 && okSend.body.sent_to === "julen@musesquare.com", okSend.body);

  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE member_id LIKE 'probe-inc9d-%'`, location: "EU" });
  const [cnt] = await bq.query({ query: `SELECT COUNT(*) n FROM \`${P}.analytics.location_members\` WHERE member_id LIKE 'probe-inc9d-%'`, location: "EU" });
  assert("sondes 9d nettoyées", Number((cnt as any[])[0].n) === 0);
}
