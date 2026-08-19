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

if (process.argv.includes("--send")) {
  const r3 = await (POST as any)(ctx(admin, { email: "julen.deajuriaguerra+p3test@gmail.com", activity_hint: "test P3.1-a", pos_hint: "Sage 100" }));
  const j3 = JSON.parse(await r3.text());
  check("création réelle (adresse taguée owner)", r3.status === 200 && j3.ok === true, JSON.stringify(j3.invitation || j3.error));
  // P3.1-c : la demande de fichier part dans la foulée (Resend réel, consigne Sage 100,
  // reply_to = l'inviteur). "sent" = Resend a accepté l'email.
  check("demande de fichier envoyée (Resend réel)", j3.file_request_email === "sent", String(j3.file_request_email));
  if (j3.ok) {
    const r4 = await (POST as any)(ctx(admin, { revoke_id: j3.invitation.id }));
    check("révocation immédiate", r4.status === 200, await r4.text());
  }
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
