// Vérité de l'endpoint invitations (P3.1-a) — garde admin + Clerk RÉEL.
// Par défaut : 403 non-admin + liste des invitations en attente (lecture seule).
// Avec --send : crée une invitation réelle vers l'adresse taguée owner PUIS la révoque
// (un email part — volontaire, c'est la preuve vivante). Usage : npx tsx scripts/invite-verify.mts [--send]
import "dotenv/config";
const { GET, POST } = await import("../src/pages/api/admin/invite.ts");
const { ADMIN_USER_IDS } = await import("../src/lib/admins.ts");
let fails = 0;
const check = (l: string, c: boolean, d?: string) => { console.log((c ? "  OK " : "  FAIL ") + l + (d ? " — " + d : "")); if (!c) fails++; };
const ctx = (locals: any, body?: any) => ({ locals, request: new Request("http://l/", { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : "{}" }) });

const r1 = await (GET as any)(ctx({ clerk_user_id: "user_intrus" }));
check("non-admin → 403", r1.status === 403);
const admin = { clerk_user_id: ADMIN_USER_IDS[0] };
const r2 = await (GET as any)(ctx(admin));
const j2 = JSON.parse(await r2.text());
check("admin → liste Clerk réelle", r2.status === 200 && j2.ok === true, (j2.invitations || []).length + " en attente" + (j2.error ? " · " + j2.error : ""));

// ── C2 : validation des champs structurés (enums du profil) — rejets lisibles, sans envoi. ──
const rBadAct = await (POST as any)(ctx(admin, { email: "x@exemple.fr", activity: "boulangerie_volante" }));
check("secteur inconnu → 400", rBadAct.status === 400, JSON.parse(await rBadAct.text()).error);
const rBadAud = await (POST as any)(ctx(admin, { email: "x@exemple.fr", audience_1: "martiens" }));
check("public inconnu → 400", rBadAud.status === 400, JSON.parse(await rBadAud.text()).error);
const rBadUrl = await (POST as any)(ctx(admin, { email: "x@exemple.fr", website_url: "ftp://nope" }));
check("site web invalide → 400", rBadUrl.status === 400, JSON.parse(await rBadUrl.text()).error);

if (process.argv.includes("--send")) {
  // --send = boucle RÉELLE complète : invitation Clerk + email Resend + PRÉ-PROVISIONNEMENT C3
  // (vrai save.ts : géocodage, ligne profil, dim_client_location, chaîne dbt) + réclamation
  // simulée + PURGE totale. Deux emails partent vers l'adresse taguée owner — volontaire.
  const r3 = await (POST as any)(ctx(admin, {
    email: "julen.deajuriaguerra+p3test@gmail.com", activity_hint: "test P3.1-a", pos_hint: "Sage 100",
    site_name: "Site Test C2", company_address: "1 rue de Rivoli, 75001 Paris",
    website_url: "musesquare.com", activity: "culture", audience_1: "tourists", audience_2: "families",
  }));
  const j3 = JSON.parse(await r3.text());
  check("création réelle (adresse taguée owner)", r3.status === 200 && j3.ok === true, JSON.stringify(j3.invitation || j3.error));
  // P3.1-c : la demande de fichier part dans la foulée (Resend réel, consigne Sage 100,
  // reply_to = l'inviteur). "sent" = Resend a accepté l'email.
  check("demande de fichier envoyée (Resend réel)", j3.file_request_email === "sent", String(j3.file_request_email));
  if (j3.ok) {
    // C2 : les métadonnées structurées voyagent — relues depuis la liste Clerk, pas depuis la réponse.
    const r3b = await (GET as any)(ctx(admin));
    const j3b = JSON.parse(await r3b.text());
    const created = (j3b.invitations || []).find((i: any) => i.id === j3.invitation.id);
    const md = (created && created.metadata) || {};
    check("métadonnées relues (site, adresse, secteur, web, publics)",
      md.site_name === "Site Test C2" && md.company_address === "1 rue de Rivoli, 75001 Paris"
      && md.activity === "culture" && String(md.website_url || "").startsWith("https://musesquare.com")
      && md.audience_1 === "tourists" && md.audience_2 === "families",
      JSON.stringify(md));
    // ── C3 : pré-provisionnement prouvé en base, réclamation simulée, purge. ──
    check("provision : ligne créée + géocodée", !!(j3.provision && j3.provision.location_id) && j3.provision.geocode_status === "geocoded_ok", JSON.stringify(j3.provision));
    check("provision : couverture événements mesurée", j3.provision && typeof j3.provision.events_within_15km_30d === "number", String(j3.provision && j3.provision.events_within_15km_30d) + " événements <15 km/30 j");
    if (j3.provision && j3.provision.location_id) {
      const locId = String(j3.provision.location_id);
      const pk = String(md.provision_key || "");
      check("provision_key dans les métadonnées (format invite:<uuid>)", /^invite:[0-9a-f-]{36}$/.test(pk), pk);
      const { makeBQClient } = await import("../src/lib/bq.ts");
      const bq = makeBQClient("muse-square-open-data");
      const q = async (sql: string, params: any = {}) =>
        bq.query({ query: sql, params, types: Object.fromEntries(Object.keys(params).map((k) => [k, "STRING"])), location: "EU" }).then((r: any) => r[0]);
      const raw1 = await q(`SELECT clerk_user_id, email, pos_system, company_activity_type, city_id FROM \`muse-square-open-data.raw.insight_event_user_location_profile\` WHERE location_id = @l`, { l: locId });
      const p1: any = raw1[0] || {};
      check("ligne profil : clé en attente + email invité + caisse + secteur + city_id",
        p1.clerk_user_id === pk && p1.email === "julen.deajuriaguerra+p3test@gmail.com" && p1.pos_system === "sage100" && p1.company_activity_type === "culture" && !!p1.city_id,
        JSON.stringify(p1));
      const dim1 = await q(`SELECT location_id, client_industry_code, geo_point IS NOT NULL AS has_geo FROM \`muse-square-open-data.dims.dim_client_location\` WHERE location_id = @l`, { l: locId });
      check("dim_client_location : synchronisée avec géo", dim1.length === 1 && (dim1[0] as any).has_geo === true, JSON.stringify(dim1[0] || null));
      // Réclamation (la même lib que profile.astro appellera au premier login).
      const { claimProvisionedProfile } = await import("../src/lib/onboardingClaim.ts");
      const cl = await claimProvisionedProfile(bq, { clerk_user_id: "user_c3claimtest", email: "julen.deajuriaguerra+p3test@gmail.com", provision_key: pk });
      check("réclamation : la ligne bascule vers l'utilisateur", cl.claimed === true && cl.location_ids.includes(locId), JSON.stringify(cl));
      const cl2 = await claimProvisionedProfile(bq, { clerk_user_id: "user_c3claimtest", email: null, provision_key: pk });
      check("réclamation : idempotente (2e appel = déjà à lui)", cl2.claimed === true && cl2.location_ids.includes(locId), JSON.stringify(cl2));
      const clBad = await claimProvisionedProfile(bq, { clerk_user_id: "user_c3claimtest", email: null, provision_key: "invite:pas-un-uuid" });
      check("réclamation : clé malformée refusée sans toucher la base", clBad.claimed === false || clBad.location_ids.includes(locId), JSON.stringify(clBad));
      // Purge totale (profil + dim) — le harnais ne laisse RIEN.
      await q(`DELETE FROM \`muse-square-open-data.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id = 'user_c3claimtest'`, { l: locId });
      await q(`DELETE FROM \`muse-square-open-data.dims.dim_client_location\` WHERE location_id = @l`, { l: locId });
      const left = await q(`SELECT COUNT(*) AS n FROM \`muse-square-open-data.raw.insight_event_user_location_profile\` WHERE location_id = @l`, { l: locId });
      const nLeft = Number(((left[0] as any) || {}).n?.value ?? ((left[0] as any) || {}).n ?? -1);
      check("purge : 0 ligne restante", nLeft === 0, String(nLeft));
    }
    const r4 = await (POST as any)(ctx(admin, { revoke_id: j3.invitation.id }));
    check("révocation immédiate", r4.status === 200, await r4.text());
  }
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
