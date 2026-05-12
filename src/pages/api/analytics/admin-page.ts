import type { APIRoute } from "astro";

export const prerender = false;

const ADMIN_USER_ID = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";

export const GET: APIRoute = async ({ locals }) => {
  const userId = (locals as any)?.clerk_user_id;
  if (userId !== ADMIN_USER_ID) {
    return new Response("Forbidden", { status: 403 });
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin - Muse Square</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:#f8f9fb;color:#111827;font-size:13px}
.wrap{max-width:980px;margin:0 auto;padding:24px}
.hdr h1{font-size:20px;font-weight:700;color:#1D3BB3}
.hdr p{font-size:12px;color:#6b7280;margin-bottom:20px}
.sum{display:flex;gap:10px;margin-bottom:20px}
.sc{flex:1;background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e5e7eb}
.sc.al{border-color:#fca5a5}
.sc .lb{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em}
.sc .vl{font-size:22px;font-weight:700}
.sc .vl.rd{color:#dc2626}
.fl{display:flex;gap:8px;margin-bottom:12px}
.fl input,.fl select{padding:7px 12px;border-radius:6px;border:1px solid #e5e7eb;font-size:12px;font-family:inherit;outline:none}
.fl input{flex:1}
.tb{background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden}
.tb table{width:100%;border-collapse:collapse}
.tb th{padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;border-bottom:2px solid #e5e7eb}
.tb td{padding:8px 12px;border-bottom:1px solid #f3f4f6}
.tb tr.rw:hover{background:#f9fafb;cursor:pointer}
.bg{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600}
.bg .dt{width:6px;height:6px;border-radius:50%}
.bg-active{background:#dcfce7;color:#166534}.bg-active .dt{background:#22c55e}
.bg-cooling{background:#fef3c7;color:#92400e}.bg-cooling .dt{background:#f59e0b}
.bg-declining{background:#fee2e2;color:#991b1b}.bg-declining .dt{background:#ef4444}
.bg-inactive{background:#f3f4f6;color:#6b7280}.bg-inactive .dt{background:#9ca3af}
.det{display:none}.det.op{display:block}
.bk{background:none;border:none;color:#1D3BB3;cursor:pointer;font-size:13px;font-weight:600;margin-bottom:20px;padding:0;font-family:inherit}
.uh{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.av{width:42px;height:42px;border-radius:50%;background:#1D3BB3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}
.pg{background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;font-size:12px}
.pg .k{color:#9ca3af;min-width:85px}
.pg .v{color:#374151;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ct{display:grid;grid-template-columns:repeat(9,1fr);gap:6px;margin-bottom:16px}
.cb{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 6px;text-align:center}
.cb .nm{font-size:18px;font-weight:700}
.cb .nm.zr{color:#d1d5db}
.cb .ll{font-size:9px;color:#6b7280;margin-top:2px;line-height:1.2}
.ts{display:flex;border-bottom:2px solid #e5e7eb}
.tn{background:none;border:none;border-bottom:2px solid transparent;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;color:#6b7280;font-family:inherit;margin-bottom:-2px;position:relative}
.tn.ac{color:#1D3BB3;border-bottom-color:#1D3BB3}
.tn .ad{position:absolute;top:6px;right:4px;width:6px;height:6px;border-radius:50%;background:#ef4444}
.tc{background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:4px 16px;max-height:400px;overflow-y:auto}
.lr{padding:10px 0;border-bottom:1px solid #f3f4f6;display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:start}
.lr:last-child{border-bottom:none}
.lt{font-size:11px;color:#6b7280}
.le{font-size:10px;color:#9ca3af;margin-top:2px}
.lg{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:4px;margin-bottom:4px}
.lm{font-size:12px;color:#374151;line-height:1.4}
.fq{font-size:12px;color:#374151;line-height:1.5;background:#f9fafb;border-radius:6px;padding:8px 10px}
.em{padding:24px;text-align:center;color:#9ca3af;font-size:13px}
.rd{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0}
.ld{padding:40px;text-align:center;color:#9ca3af}
</style>
</head>
<body>
<div class="wrap">
<div class="hdr"><h1>Admin</h1><p>Support client & suivi beta</p></div>
<div id="lv">
<div class="sum" id="sm"></div>
<div class="fl"><input type="text" id="sr" placeholder="Rechercher nom, email, site..."><select id="sf"><option value="all">Tous</option><option value="active">Active</option><option value="cooling">Cooling</option><option value="declining">Declining</option><option value="inactive">Inactive</option></select></div>
<div class="tb" id="tw"></div>
</div>
<div class="det" id="dv"></div>
<div class="ld" id="lo">Chargement...</div>
</div>
<script>
var D=[],S=null;
function fm(d){if(!d)return"\\u2014";var t=new Date(d);return t.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})+" "+t.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
function fd(d){if(!d)return"\\u2014";return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}
function ag(d){if(d==null)return"\\u2014";if(d===0)return"Aujourd'hui";if(d===1)return"Hier";return d+"j"}
function bh(s){return'<span class="bg bg-'+s+'"><span class="dt"></span>'+s+'</span>'}
function es(s){if(!s)return"";var d=document.createElement("div");d.textContent=s;return d.innerHTML}
fetch("/api/analytics/admin-dashboard").then(function(r){return r.json()}).then(function(j){document.getElementById("lo").style.display="none";if(!j.ok){document.getElementById("lo").textContent="Erreur: "+(j.error||"");document.getElementById("lo").style.display="block";return}D=j.data||[];rS();rT()}).catch(function(e){document.getElementById("lo").textContent="Erreur reseau";console.error(e)});
function rS(){var us={},si=0,ac=0,pr=0,fb=0;for(var i=0;i<D.length;i++){var u=D[i];us[u.user_id]=1;si++;if(u.activity_status==="active")ac++;pr+=(u.errors_last_7d||0)+(u.failed_crawls||0);fb+=(u.unread_feedback_text_7d||0)}var it=[{l:"Utilisateurs",v:Object.keys(us).length,a:false},{l:"Sites",v:si,a:false},{l:"Actifs",v:ac,a:false},{l:"Problemes 7j",v:pr,a:pr>0},{l:"Feedback non lu",v:fb,a:fb>0}];var h="";for(var i=0;i<it.length;i++){var m=it[i];h+='<div class="sc'+(m.a?" al":"")+'"><div class="lb">'+m.l+'</div><div class="vl'+(m.a?" rd":"")+'">'+m.v+"</div></div>"}document.getElementById("sm").innerHTML=h}
function gF(){var q=(document.getElementById("sr").value||"").toLowerCase();var s=document.getElementById("sf").value;return D.filter(function(u){var mt=!q||(u.first_name+" "+u.last_name+" "+u.company_name+" "+u.email).toLowerCase().indexOf(q)>=0;var st=s==="all"||u.activity_status===s;return mt&&st})}
function rT(){var rows=gF();var h='<table><thead><tr>';var cols=["Utilisateur","Site","Statut","Vu","Probl.","Feedback"];for(var i=0;i<cols.length;i++)h+="<th>"+cols[i]+"</th>";h+="</tr></thead><tbody>";for(var i=0;i<rows.length;i++){var u=rows[i];var p=(u.errors_last_7d||0)+(u.failed_crawls||0);h+='<tr class="rw" data-i="'+i+'">';h+='<td><div style="font-weight:600">'+es(u.first_name)+" "+es(u.last_name)+'</div><div style="font-size:11px;color:#9ca3af">'+es(u.email)+"</div></td>";h+="<td><div>"+es(u.company_name)+'</div><div style="font-size:11px;color:#9ca3af">'+es(u.company_activity_type)+"</div></td>";h+="<td>"+bh(u.activity_status)+"</td>";h+='<td style="color:#6b7280">'+ag(u.days_since_last_action)+"</td>";h+="<td>"+(p>0?'<span style="color:#dc2626;font-weight:700">'+p+"</span>":'<span style="color:#d1d5db">0</span>')+"</td>";h+='<td><div style="display:flex;align-items:center;gap:4px">';if(u.has_unread_feedback_text)h+='<span class="rd"></span>';h+='<span style="color:'+(u.feedback_with_text_count>0?"#111827":"#d1d5db")+'">'+(u.feedback_with_text_count||0)+"</span></div></td></tr>"}h+="</tbody></table>";document.getElementById("tw").innerHTML=h;var trs=document.querySelectorAll(".rw");for(var i=0;i<trs.length;i++){trs[i].addEventListener("click",function(){var idx=parseInt(this.getAttribute("data-i"));oD(gF()[idx])})}}
document.getElementById("sr").addEventListener("input",rT);document.getElementById("sf").addEventListener("change",rT);
function oD(u){S=u;document.getElementById("lv").style.display="none";var dv=document.getElementById("dv");dv.classList.add("op");var cn=[["Actions totales",u.total_actions],["Actions 7j",u.actions_last_7d],["Actions 30j",u.actions_last_30d],["Pages vues",u.page_views],["Drafts generes",u.drafts_generated],["Drafts copies",u.drafts_copied],["Drafts sauves",u.drafts_saved],["Drafts publies",u.drafts_published],["Templates",u.templates_created],["Automations",u.automations_enabled],["Envois auto",u.total_auto_sent],["Concurrents suivis",u.competitors_followed],["Dates sauvees",u.dates_saved],["Confirmations",u.total_confirmations],["Positif",u.positive_feedback],["Negatif",u.negative_feedback],["Crawls OK",u.successful_crawls],["Crawls KO",u.failed_crawls]];var h='<button class="bk" id="bb">\\u2190 Retour</button>';h+='<div class="uh"><div class="av">'+(u.first_name?u.first_name[0].toUpperCase():"?")+'</div><div style="flex:1"><div style="font-size:18px;font-weight:700">'+es(u.first_name)+" "+es(u.last_name)+'</div><div style="font-size:12px;color:#6b7280">'+es(u.email)+(u.position?" \\u00B7 "+es(u.position):"")+"</div></div>"+bh(u.activity_status)+"</div>";var fi=[["Site",u.site_name||u.company_name],["Adresse",u.company_address],["Industrie",u.company_activity_type],["Type lieu",u.location_type],["Geocodage",u.company_geocode_status],["Objectif",u.main_event_objective||"\\u2014"],["Meteo","sensibilite "+(u.weather_sensitivity||0)+"/5"],["Saisonnalite",u.seasonality],["Site web",u.website_url||"non renseigne"],["Compte","cree "+fd(u.account_created_at)+" ("+(u.account_age_days||0)+"j)"],["Profil maj",fd(u.profile_updated_at)],["Derniere action",ag(u.days_since_last_action)]];h+='<div class="pg">';for(var i=0;i<fi.length;i++){h+='<div style="display:flex;gap:6px"><span class="k">'+fi[i][0]+'</span><span class="v">'+es(String(fi[i][1]||"\\u2014"))+"</span></div>"}h+="</div>";h+='<div class="ct">';for(var i=0;i<cn.length;i++){var v=cn[i][1]||0;h+='<div class="cb"><div class="nm'+(v===0?" zr":"")+'">'+v+'</div><div class="ll">'+cn[i][0]+"</div></div>"}h+="</div>";h+='<div class="ts"><button class="tn ac" data-t="pr">Problemes'+((u.errors_last_7d||0)+(u.failed_crawls||0)>0?' <span class="ad"></span>':"")+'</button><button class="tn" data-t="fb">Feedback'+(u.has_unread_feedback_text?' <span class="ad"></span>':"")+"</button></div>";h+='<div class="tc" id="tp"><div class="ld">Chargement...</div></div><div class="tc" id="tf" style="display:none"><div class="ld">Chargement...</div></div>';dv.innerHTML=h;document.getElementById("bb").addEventListener("click",cD);var tb=dv.querySelectorAll(".tn");for(var i=0;i<tb.length;i++){tb[i].addEventListener("click",function(){for(var j=0;j<tb.length;j++)tb[j].classList.remove("ac");this.classList.add("ac");var t=this.getAttribute("data-t");document.getElementById("tp").style.display=t==="pr"?"block":"none";document.getElementById("tf").style.display=t==="fb"?"block":"none"})}lE(u);lF(u)}
function cD(){S=null;document.getElementById("dv").classList.remove("op");document.getElementById("dv").innerHTML="";document.getElementById("lv").style.display="block"}
var TC={geocode_low_score:"#b45309",geocode_failed:"#dc2626",crawl_failed:"#dc2626",extraction_failed:"#dc2626",dim_sync_failed:"#7c3aed",dbt_trigger_failed:"#0369a1",besttime_failed:"#b45309",unhandled_exception:"#dc2626"};
var CC={positive:{bg:"#dcfce7",text:"#166534"},negative:{bg:"#fee2e2",text:"#991b1b"},confirmed:{bg:"#dbeafe",text:"#1e40af"},dismissed:{bg:"#f3f4f6",text:"#6b7280"}};
function lE(u){fetch("/api/analytics/admin-errors?user_id="+encodeURIComponent(u.user_id)+"&location_id="+encodeURIComponent(u.location_id)).then(function(r){return r.json()}).then(function(j){var el=document.getElementById("tp");if(!j.ok||!j.data||j.data.length===0){el.innerHTML='<div class="em">Aucun probleme enregistre</div>';return}var h="";for(var i=0;i<j.data.length;i++){var e=j.data[i];var c=TC[e.error_type]||"#6b7280";h+='<div class="lr"><div><div class="lt">'+fm(e.created_at)+'</div><div class="le">'+es(e.endpoint)+'</div></div><div><span class="lg" style="background:'+c+'18;color:'+c+'">'+es(e.error_type)+'</span><div class="lm">'+es(e.error_message)+"</div></div></div>"}el.innerHTML=h}).catch(function(){document.getElementById("tp").innerHTML='<div class="em">Erreur chargement</div>'})}
function lF(u){fetch("/api/analytics/admin-feedback?user_id="+encodeURIComponent(u.user_id)+"&location_id="+encodeURIComponent(u.location_id)).then(function(r){return r.json()}).then(function(j){var el=document.getElementById("tf");if(!j.ok||!j.data||j.data.length===0){el.innerHTML='<div class="em">Aucun feedback texte</div>';return}var h="";for(var i=0;i<j.data.length;i++){var f=j.data[i];var cc=CC[f.confirmation]||CC.dismissed;h+='<div class="lr"><div><div class="lt">'+fm(f.created_at)+'</div><div class="le">'+es(f.signal_type)+'</div></div><div><span class="lg" style="background:'+cc.bg+';color:'+cc.text+'">'+es(f.confirmation)+'</span><div class="fq" style="border-left:3px solid '+cc.text+'">'+es(f.feedback_text)+"</div></div></div>"}el.innerHTML=h}).catch(function(){document.getElementById("tf").innerHTML='<div class="em">Erreur chargement</div>'})}
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};