import { BigQuery } from "@google-cloud/bigquery";
import { r as runAIPackagerClaude } from "../../../chunks/runPackager_C4sSBN-g.mjs";
import { renderers } from "../../../renderers.mjs";
function toNum$1(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function ymdFromAnyDate$2(v) {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}
function regimeRank(v) {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "A") return 0;
  if (s === "B") return 1;
  if (s === "C") return 2;
  return 9;
}
function fmtScore(x) {
  return Number.isFinite(x) ? String(Math.round(x)) : "ND";
}
function fmtNum(x) {
  return Number.isFinite(x) ? String(x) : "ND";
}
function getScore(r) {
  return toNum$1(r?.opportunity_score_final_local);
}
function getRegime(r) {
  return typeof r?.opportunity_regime === "string" ? r.opportunity_regime : "";
}
function getWeatherRisk(r) {
  const a = toNum$1(r?.alert_level_max);
  if (Number.isFinite(a)) return a;
  const b = toNum$1(r?.weather_alert_level);
  if (Number.isFinite(b)) return b;
  return NaN;
}
function getCompetition10km(r) {
  const c10 = toNum$1(r?.events_within_10km_count);
  return Number.isFinite(c10) ? c10 : NaN;
}
function getCompetition50km(r) {
  const c50 = toNum$1(r?.events_within_50km_count);
  return Number.isFinite(c50) ? c50 : NaN;
}
function getEvidenceComplete(r) {
  if (typeof r?.evidence_completeness_flag === "boolean") return r.evidence_completeness_flag;
  return null;
}
function getPrimaryDriverFr(r) {
  const label_fr = typeof r?.primary_score_driver_label_fr === "string" ? r.primary_score_driver_label_fr : null;
  const confidence_fr = typeof r?.primary_driver_confidence_fr === "string" ? r.primary_driver_confidence_fr : null;
  return { label_fr, confidence_fr };
}
function stableUniq(arr) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x ?? "").trim();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
function isTieOnDeterministicCriteria(a, b) {
  const ra = regimeRank(a?.opportunity_regime);
  const rb = regimeRank(b?.opportunity_regime);
  if (ra !== rb) return false;
  const sa = getScore(a), sb = getScore(b);
  if (Number.isFinite(sa) !== Number.isFinite(sb)) return false;
  if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return false;
  const wa = getWeatherRisk(a), wb = getWeatherRisk(b);
  if (Number.isFinite(wa) !== Number.isFinite(wb)) return false;
  if (Number.isFinite(wa) && Number.isFinite(wb) && wa !== wb) return false;
  const ca = getCompetition10km(a), cb = getCompetition10km(b);
  if (Number.isFinite(ca) !== Number.isFinite(cb)) return false;
  if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return false;
  return true;
}
function buildFactsForRowV1(r) {
  const d = ymdFromAnyDate$2(r?.date);
  const facts = [];
  const regime = getRegime(r) || "ND";
  const score = getScore(r);
  facts.push({
    fact_id: `F.governance.verdict.${d}`,
    date: d,
    dimension: "governance",
    label_fr: `Régime ${regime}, score ${fmtScore(score)}`,
    source_fields: ["opportunity_regime", "opportunity_score_final_local"]
  });
  const wx = getWeatherRisk(r);
  facts.push({
    fact_id: `F.weather.alert_max.${d}`,
    date: d,
    dimension: "weather",
    label_fr: `Alerte météo max ${fmtNum(wx)}`,
    source_fields: ["alert_level_max", "weather_alert_level"]
  });
  const c10 = getCompetition10km(r);
  const c50 = getCompetition50km(r);
  facts.push({
    fact_id: `F.competition.count_10km.${d}`,
    date: d,
    dimension: "competition",
    label_fr: `Événements ≤10km: ${fmtNum(c10)}`,
    source_fields: ["events_within_10km_count"]
  });
  facts.push({
    fact_id: `F.competition.count_50km.${d}`,
    date: d,
    dimension: "competition",
    label_fr: `Événements ≤50km: ${fmtNum(c50)}`,
    source_fields: ["events_within_50km_count"]
  });
  const ev = getEvidenceComplete(r);
  if (ev !== null) {
    facts.push({
      fact_id: `F.governance.evidence_completeness.${d}`,
      date: d,
      dimension: "governance",
      label_fr: ev ? "Preuves complètes" : "Preuves incomplètes",
      source_fields: ["evidence_completeness_flag"]
    });
  }
  const drv = getPrimaryDriverFr(r);
  if (drv.label_fr || drv.confidence_fr) {
    facts.push({
      fact_id: `F.governance.primary_driver.${d}`,
      date: d,
      dimension: "governance",
      label_fr: `Driver principal: ${drv.label_fr ?? "ND"} (${drv.confidence_fr ?? "ND"})`,
      source_fields: ["primary_score_driver_label_fr", "primary_driver_confidence_fr"]
    });
  }
  return facts;
}
function buildCoverageFromRowsLocalV1(rows) {
  const required = {
    governance: ["opportunity_regime", "opportunity_score_final_local", "evidence_completeness_flag"],
    weather: ["alert_level_max", "weather_alert_level"],
    competition: ["events_within_10km_count", "events_within_50km_count"]
  };
  const dims = ["governance", "weather", "competition"];
  const by_dimension = [];
  for (const dim of dims) {
    const fields = required[dim];
    const present = /* @__PURE__ */ new Set();
    const missing = /* @__PURE__ */ new Set();
    for (const f of fields) {
      let anyPresent = false;
      for (const r of rows) {
        if (r && r[f] !== null && r[f] !== void 0 && String(r[f]).trim() !== "") {
          anyPresent = true;
          break;
        }
      }
      if (anyPresent) present.add(f);
      else missing.add(f);
    }
    let status = "full";
    if (present.size === 0) status = "none";
    else if (missing.size > 0) status = "partial";
    if (status === "full" && dim === "governance") {
      for (const r of rows) {
        const ev = getEvidenceComplete(r);
        if (ev === false) {
          status = "partial";
          break;
        }
      }
    }
    by_dimension.push({
      dimension: dim,
      status,
      present_fields: [...present],
      missing_fields: [...missing]
    });
  }
  by_dimension.push({
    dimension: "envelope_7d",
    status: "none",
    present_fields: [],
    missing_fields: [],
    note_fr: "Fenêtre 7 jours indisponible"
  });
  return { v: 1, by_dimension };
}
function compareDatesDeterministicV1(input) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const used_dates = stableUniq(rows.map((r) => ymdFromAnyDate$2(r?.date)));
  const coverage = buildCoverageFromRowsLocalV1(rows);
  const facts_by_date = {};
  for (const r of rows) {
    const d = ymdFromAnyDate$2(r?.date);
    facts_by_date[d] = buildFactsForRowV1(r);
  }
  if (rows.length < 2) {
    const d0 = used_dates[0] ?? "(date inconnue)";
    const f0 = facts_by_date[d0]?.[0]?.fact_id ?? `F.meta.rows_count.${d0}`;
    if (!facts_by_date[d0]) {
      facts_by_date[d0] = [
        {
          fact_id: f0,
          date: d0,
          dimension: "meta",
          label_fr: `Nombre de dates reçues: ${rows.length}`,
          source_fields: ["rows.length"]
        }
      ];
    }
    return {
      ok: true,
      used_dates,
      winner_date: null,
      tie_flag: false,
      coverage,
      facts_by_date,
      line_items: [
        {
          kind: "headline",
          template_id: "HEADLINE_COMPARE",
          fact_ids: [f0],
          params: { mode: "missing_dates" }
        }
      ]
    };
  }
  const cmp = (a, b) => {
    const ra = regimeRank(a?.opportunity_regime);
    const rb = regimeRank(b?.opportunity_regime);
    if (ra !== rb) return ra - rb;
    const sa = getScore(a);
    const sb = getScore(b);
    const saOk = Number.isFinite(sa);
    const sbOk = Number.isFinite(sb);
    if (saOk !== sbOk) return saOk ? -1 : 1;
    if (saOk && sbOk && sa !== sb) return sb - sa;
    const wa = getWeatherRisk(a);
    const wb = getWeatherRisk(b);
    const waOk = Number.isFinite(wa);
    const wbOk = Number.isFinite(wb);
    if (waOk !== wbOk) return waOk ? -1 : 1;
    if (waOk && wbOk && wa !== wb) return wa - wb;
    const ca = getCompetition10km(a);
    const cb = getCompetition10km(b);
    const caOk = Number.isFinite(ca);
    const cbOk = Number.isFinite(cb);
    if (caOk !== cbOk) return caOk ? -1 : 1;
    if (caOk && cbOk && ca !== cb) return ca - cb;
    return ymdFromAnyDate$2(a?.date).localeCompare(ymdFromAnyDate$2(b?.date));
  };
  const sorted = [...rows].sort(cmp);
  const best = sorted[0];
  const second = sorted[1];
  const bestDate = ymdFromAnyDate$2(best?.date);
  const tie_flag = second ? isTieOnDeterministicCriteria(best, second) : false;
  const bestFacts = facts_by_date[bestDate] ?? [];
  const fidVerdict = bestFacts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id ?? bestFacts[0]?.fact_id ?? `F.governance.verdict.${bestDate}`;
  const fidWx = bestFacts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${bestDate}`;
  const fidC10 = bestFacts.find((f) => f.source_fields.includes("events_within_10km_count"))?.fact_id ?? `F.competition.count_10km.${bestDate}`;
  const fidC50 = bestFacts.find((f) => f.source_fields.includes("events_within_50km_count"))?.fact_id ?? `F.competition.count_50km.${bestDate}`;
  const fidDrv = bestFacts.find((f) => f.source_fields.includes("primary_score_driver_label_fr"))?.fact_id;
  const fidEv = bestFacts.find((f) => f.source_fields.includes("evidence_completeness_flag"))?.fact_id;
  const line_items = [];
  line_items.push({
    kind: "headline",
    template_id: "HEADLINE_COMPARE",
    fact_ids: [fidVerdict],
    params: { winner_date: bestDate }
  });
  if (tie_flag) {
    line_items.push({
      kind: "caveat",
      template_id: "TIE_EQUIVALENT_DATES",
      fact_ids: [fidVerdict],
      params: { default_choice_date: bestDate }
    });
  }
  line_items.push({
    kind: "fact",
    template_id: "WINNER_VERDICT",
    fact_ids: [fidVerdict],
    params: { date: bestDate }
  });
  const bestWx = getWeatherRisk(best);
  line_items.push({
    kind: "fact",
    template_id: "WINNER_WEATHER_ALERT",
    fact_ids: [fidWx],
    params: {
      date: bestDate,
      alert_level_max: Number.isFinite(bestWx) ? bestWx : null
    }
  });
  const bestC10 = getCompetition10km(best);
  const bestC50 = getCompetition50km(best);
  line_items.push({
    kind: "fact",
    template_id: "WINNER_COMPETITION_LOCAL_REGIONAL",
    fact_ids: [fidC10, fidC50],
    params: {
      date: bestDate,
      local_radius_km: 10,
      regional_radius_km: 50,
      c10: Number.isFinite(bestC10) ? bestC10 : null,
      c50: Number.isFinite(bestC50) ? bestC50 : null
    }
  });
  if (fidDrv) {
    line_items.push({
      kind: "fact",
      template_id: "WINNER_PRIMARY_DRIVER",
      fact_ids: [fidDrv],
      params: { date: bestDate }
    });
  }
  if (fidEv) {
    const ev = getEvidenceComplete(best);
    if (ev === false) {
      line_items.push({
        kind: "caveat",
        template_id: "EVIDENCE_INCOMPLETE",
        fact_ids: [fidEv],
        params: { date: bestDate }
      });
    }
  }
  const runnerUps = sorted.slice(1, 3);
  for (const r of runnerUps) {
    const d = ymdFromAnyDate$2(r?.date);
    const facts = facts_by_date[d] ?? [];
    const fVerd = facts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id ?? facts[0]?.fact_id ?? `F.governance.verdict.${d}`;
    const fWx = facts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${d}`;
    const fC10 = facts.find((f) => f.source_fields.includes("events_within_10km_count"))?.fact_id ?? `F.competition.count_10km.${d}`;
    const altReg = getRegime(r) || "ND";
    const altScore = getScore(r);
    const altWx = getWeatherRisk(r);
    const altC10 = getCompetition10km(r);
    line_items.push({
      kind: "fact",
      template_id: "ALTERNATIVE_SUMMARY",
      fact_ids: [fVerd, fWx, fC10],
      params: {
        date: d,
        regime: altReg,
        score: Number.isFinite(altScore) ? altScore : null,
        alert_level_max: Number.isFinite(altWx) ? altWx : null,
        c10: Number.isFinite(altC10) ? altC10 : null,
        local_radius_km: 10
      }
    });
  }
  return {
    ok: true,
    used_dates,
    winner_date: bestDate,
    tie_flag,
    coverage,
    facts_by_date,
    line_items
  };
}
function buildFactsIndex$1(facts_by_date) {
  const idx = /* @__PURE__ */ new Map();
  for (const date of Object.keys(facts_by_date)) {
    for (const f of facts_by_date[date] ?? []) {
      idx.set(f.fact_id, f);
    }
  }
  return idx;
}
function assertLineItemsWellFormed(line_items, factsIndex) {
  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i];
    if (!li || typeof li.template_id !== "string") {
      throw new Error(`LineItem[${i}] missing template_id`);
    }
    if (!Array.isArray(li.fact_ids) || li.fact_ids.length < 1) {
      throw new Error(`LineItem[${i}] has no fact_ids`);
    }
    for (const fid of li.fact_ids) {
      if (!factsIndex.has(fid)) {
        throw new Error(
          `LineItem[${i}] references unknown fact_id: ${fid}`
        );
      }
    }
  }
}
function safeNum$1(v) {
  if (v === null || v === void 0) return "ND";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "ND";
}
function safeRounded(v) {
  if (v === null || v === void 0) return "ND";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "ND";
}
function renderLineItemsFrV1(args) {
  const { line_items, facts_by_date } = args;
  const factsIndex = buildFactsIndex$1(facts_by_date);
  assertLineItemsWellFormed(line_items, factsIndex);
  const lines = [];
  for (const li of line_items) {
    const facts = li.fact_ids.map((id) => factsIndex.get(id)).filter(Boolean);
    const textOverride = typeof li.params?.text_override === "string" ? li.params.text_override.trim() : "";
    if (textOverride.length > 0) {
      lines.push({
        kind: li.kind ?? "fact",
        text_fr: textOverride,
        fact_ids: li.fact_ids
      });
      continue;
    }
    switch (li.template_id) {
      // -------------------------------------------------
      // HEADLINE
      // -------------------------------------------------
      case "HEADLINE_COMPARE": {
        if (li.params?.mode === "missing_dates") {
          lines.push({
            kind: "headline",
            text_fr: "Comparaison impossible",
            fact_ids: li.fact_ids
          });
        } else {
          lines.push({
            kind: "headline",
            text_fr: `Meilleure date: ${String(
              li.params?.winner_date ?? "ND"
            )}`,
            fact_ids: li.fact_ids
          });
        }
        break;
      }
      // -------------------------------------------------
      // TIE
      // -------------------------------------------------
      case "TIE_EQUIVALENT_DATES": {
        lines.push({
          kind: "caveat",
          text_fr: `Jours équivalents sur les signaux disponibles; choix par défaut: ${String(
            li.params?.default_choice_date ?? "ND"
          )}.`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // WINNER VERDICT
      // -------------------------------------------------
      case "WINNER_VERDICT": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: `Meilleur choix: ${String(
            li.params?.date ?? "ND"
          )} (${f?.label_fr ?? "Verdict ND"})`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // WINNER WEATHER (numeric from params)
      // -------------------------------------------------
      case "WINNER_WEATHER_ALERT": {
        const alert = li.params?.alert_level_max;
        lines.push({
          kind: "fact",
          text_fr: `Risque météo: alerte max ${safeNum$1(alert)}`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // WINNER COMPETITION (numeric from params)
      // -------------------------------------------------
      case "WINNER_COMPETITION_LOCAL_REGIONAL": {
        const localR = li.params?.local_radius_km ?? 10;
        const regionalR = li.params?.regional_radius_km ?? 50;
        const c10 = li.params?.c10;
        const c50 = li.params?.c50;
        lines.push({
          kind: "fact",
          text_fr: `Concurrence: ${safeNum$1(c10)} événement(s) ≤${String(
            localR
          )}km, ${safeNum$1(c50)} dans un rayon de ${String(regionalR)}km.`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // WINNER PRIMARY DRIVER
      // -------------------------------------------------
      case "WINNER_PRIMARY_DRIVER": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: f?.label_fr ?? "Driver principal: ND",
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // EVIDENCE INCOMPLETE
      // -------------------------------------------------
      case "EVIDENCE_INCOMPLETE": {
        lines.push({
          kind: "caveat",
          text_fr: "Preuves incomplètes: certaines dimensions peuvent être absentes; rester prudent dans l’interprétation.",
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // ALTERNATIVE SUMMARY (numeric from params)
      // -------------------------------------------------
      case "ALTERNATIVE_SUMMARY": {
        const date = String(li.params?.date ?? "ND");
        const regime = String(li.params?.regime ?? "ND").replace(/^R(é|e)gime\s*/i, "");
        const score = li.params?.score;
        const alert = li.params?.alert_level_max;
        const c10 = li.params?.c10;
        const localR = li.params?.local_radius_km ?? 10;
        lines.push({
          kind: "fact",
          text_fr: `Alternative: ${date} (Régime ${regime}, score ${safeRounded(score)}, météo ${safeNum$1(alert)}, concurrence ≤${String(localR)}km ${safeNum$1(c10)})`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // LOOKUP EVENT FOUND
      // -------------------------------------------------
      case "LOOKUP_EVENT_FOUND": {
        const label = String(li.params?.event_label ?? "Événement");
        const date = String(li.params?.event_date ?? "");
        const city = String(li.params?.city_name ?? "");
        const distM = li.params?.distance_m;
        const source = String(li.params?.source_system ?? "");
        const parts = [];
        if (date) parts.push(date);
        if (city) parts.push(city);
        if (typeof distM === "number" && Number.isFinite(distM)) {
          parts.push(`${Math.round(distM)} m`);
        }
        if (source) parts.push(source);
        const suffix = parts.length ? ` — ${parts.join(" · ")}` : "";
        lines.push({
          kind: "headline",
          text_fr: `Événement trouvé : ${label}${suffix}`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // LOOKUP EVENT NOT FOUND
      // -------------------------------------------------
      case "LOOKUP_EVENT_NOT_FOUND": {
        lines.push({
          kind: "headline",
          text_fr: `Aucun événement correspondant n’a été trouvé.`,
          fact_ids: li.fact_ids
        });
        break;
      }
      // -------------------------------------------------
      // Default fallback (hardened)
      // -------------------------------------------------
      default: {
        const kind = li.kind ?? "fact";
        lines.push({
          kind,
          text_fr: facts[0]?.label_fr ?? "ND",
          fact_ids: li.fact_ids
        });
        break;
      }
    }
  }
  return lines;
}
function cleanLine(s) {
  return String(s ?? "").trim().replace(/^[•\-\u2022]\s*/, "").trim();
}
function normKey(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/[•·-]/g, "").trim();
}
function assertValidInput(items) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) throw new Error(`PointInputItem[${i}] undefined`);
    if (!Array.isArray(it.fact_ids) || it.fact_ids.length < 1) {
      throw new Error(`PointInputItem[${i}] has no fact_ids`);
    }
  }
}
function renderPointsClesV1(args) {
  const max = args.max_points ?? 5;
  const raw = args.items ?? [];
  assertValidInput(raw);
  const prepared = [];
  for (const it of raw) {
    if (!it.text) continue;
    const cleaned = cleanLine(it.text);
    if (!cleaned) continue;
    prepared.push({
      kind: it.kind,
      text: cleaned,
      fact_ids: [...new Set(it.fact_ids)]
    });
  }
  const seen = /* @__PURE__ */ new Map();
  for (const line of prepared) {
    const key = normKey(line.text);
    if (!seen.has(key)) {
      seen.set(key, { ...line });
    } else {
      const existing = seen.get(key);
      const merged = /* @__PURE__ */ new Set([
        ...existing.fact_ids,
        ...line.fact_ids
      ]);
      existing.fact_ids = Array.from(merged);
    }
  }
  const deduped = Array.from(seen.values());
  const action = deduped.filter((x) => x.kind === "action");
  const nonAction = deduped.filter((x) => x.kind !== "action");
  const ordered = [...nonAction, ...action];
  return ordered.slice(0, max);
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function toNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function deriveCompetitionNearTotal(r) {
  const near = (toNum(r?.events_within_500m_count) ?? 0) + (toNum(r?.events_within_5km_count) ?? 0) + (toNum(r?.events_within_10km_count) ?? 0);
  const total = near + (toNum(r?.events_within_50km_count) ?? 0);
  return { near, total };
}
function renderDayWhyV1(input) {
  const date = input?.date?.slice(0, 10);
  if (!date || !ISO_DATE_RE.test(date)) return null;
  const r = input?.day_row;
  const facts = [];
  if (!r) {
    return {
      v: 1,
      date,
      headline_fr: `Pourquoi ce jour ? — ${date}`,
      facts: [
        {
          fact_id: "day.data.missing",
          dimension: "OTHER",
          label: "Disponibilité des données",
          value: "missing",
          coverage: "none"
        }
      ],
      line_items: [
        {
          fact_id: "day.data.missing",
          kind: "risk",
          text_fr: "Données du jour indisponibles."
        }
      ]
    };
  }
  const items = [];
  const regime = String(r?.opportunity_regime ?? "").toUpperCase();
  const verdictText = regime === "A" ? "Jour globalement favorable (catégorie A)." : regime === "B" ? "Jour correct mais non optimal (catégorie B)." : regime === "C" ? "Jour défavorable (catégorie C)." : null;
  facts.push({
    fact_id: "day.score.verdict",
    dimension: "SCORE",
    label: "Régime",
    value: regime || null,
    coverage: "observed"
  });
  if (verdictText) {
    items.push({
      fact_ids: ["day.score.verdict"],
      text: verdictText,
      kind: "verdict"
    });
  }
  const { near, total } = deriveCompetitionNearTotal(r);
  facts.push({
    fact_id: "day.competition.summary",
    dimension: "NEARBY_EVENTS",
    label: "Concurrence",
    value: total,
    coverage: "observed"
  });
  const competitionText = near > 0 ? "Risque de cannibalisation directe ce jour-là." : total > 0 ? "Concurrence présente, mais peu susceptible d’impacter directement votre événement." : "Aucune pression concurrentielle significative.";
  items.push({
    fact_ids: ["day.competition.summary"],
    text: competitionText,
    kind: near > 0 ? "primary" : "secondary"
  });
  const alert = toNum(r?.alert_level_max);
  const pp = toNum(r?.precipitation_probability_max_pct);
  facts.push({
    fact_id: "day.weather.summary",
    dimension: "WEATHER",
    label: "Alerte météo max",
    value: alert,
    coverage: "forecast"
  });
  const weatherText = alert && alert >= 3 ? "Risque météo élevé : prévoir un plan B." : pp && pp >= 60 ? "Probabilité de précipitations élevée." : "Pas de signal météo critique.";
  items.push({
    fact_ids: ["day.weather.summary"],
    text: weatherText,
    kind: alert && alert >= 3 ? "primary" : "secondary"
  });
  let actionText = null;
  if (alert && alert >= 3) {
    actionText = "Action : sécuriser une option de repli (format indoor ou report).";
  } else if (near > 0) {
    actionText = "Action : renforcer la différenciation (angle, horaires, communication).";
  } else if (regime === "C") {
    actionText = "Action : envisager une date alternative ou compenser par un levier fort.";
  }
  if (actionText) {
    items.push({
      fact_ids: ["day.score.verdict"],
      text: actionText,
      kind: "action"
    });
  }
  const rendered = renderPointsClesV1({
    items,
    max_points: 5
  });
  const finalLineItems = rendered.map((ln) => ({
    fact_id: ln.fact_ids[0],
    text_fr: ln.text,
    kind: ln.kind === "action" ? "action" : ln.kind === "primary" ? "risk" : "fact"
  }));
  if (finalLineItems.length === 0) {
    facts.push({
      fact_id: "day.other.no_signal",
      dimension: "OTHER",
      label: "Signal exploitable",
      value: "none",
      coverage: "observed"
    });
    finalLineItems.push({
      fact_id: "day.other.no_signal",
      text_fr: "Aucun signal exploitable.",
      kind: "risk"
    });
  }
  return {
    v: 1,
    date,
    headline_fr: `Pourquoi ce jour ? — ${date}`,
    facts,
    line_items: finalLineItems
  };
}
function ymdFromAnyDate$1(v) {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}
function toFiniteNumberOrNull$1(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function windowTopDaysDeterministic(input) {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache",
      summary: "Aucune date ne ressort clairement comme choix prioritaire sur cette période.",
      key_facts: [
        "Décision : élargissez la période ou ajustez vos contraintes.",
        "Décision : analysez un jour précis pour arbitrer manuellement."
      ],
      caveat: "Shortlist vide après application des exclusions hard et/ou absence de jours éligibles dans la fenêtre."
    };
  }
  const top = rows.slice(0, 3);
  const dates = top.map((r) => ymdFromAnyDate$1(r?.date));
  const key_facts = [];
  key_facts.push(`Décision : concentrez-vous en priorité sur ${dates.join(", ")}.`);
  const triAny2 = (vals, pred) => {
    const known = vals.filter((x) => x !== null);
    if (known.length === 0) return "unknown";
    return known.some(pred) ? "some" : "none";
  };
  const wxTri = triAny2(
    top.map((r) => toFiniteNumberOrNull$1(r?.weather_alert_level)),
    (a) => a > 0
  );
  key_facts.push(
    wxTri === "unknown" ? "Météo : signal indisponible sur ces dates (donnée manquante)." : wxTri === "none" ? "Météo : aucune alerte météo signalée sur ces dates." : "Météo : signaux météo présents sur certaines dates (à surveiller selon le format)."
  );
  const compTri = triAny2(
    top.map((r) => {
      const c5 = toFiniteNumberOrNull$1(r?.events_within_5km_count);
      const c10 = toFiniteNumberOrNull$1(r?.events_within_10km_count);
      return c5 !== null ? c5 : c10;
    }),
    (c) => c > 0
  );
  key_facts.push(
    compTri === "unknown" ? "Concurrence : signal indisponible sur ces dates (donnée manquante)." : compTri === "none" ? "Concurrence : aucune concurrence directe détectée à proximité sur ces dates." : "Concurrence : concurrence présente sur certaines dates (stratégie à adapter)."
  );
  const calKnown = top.some(
    (r) => r?.is_weekend !== null && r?.is_weekend !== void 0 || r?.is_public_holiday_fr_flag !== null && r?.is_public_holiday_fr_flag !== void 0 || r?.is_school_holiday_flag !== null && r?.is_school_holiday_flag !== void 0
  );
  const calSome = top.some(
    (r) => Boolean(r?.is_weekend) || Boolean(r?.is_public_holiday_fr_flag) || Boolean(r?.is_school_holiday_flag)
  );
  if (!calKnown) {
    key_facts.push("Calendrier : signal indisponible sur ces dates (donnée manquante).");
  } else if (calSome) {
    key_facts.push("Calendrier : contexte particulier sur au moins une date (horaires/communication à ajuster si besoin).");
  }
  if (key_facts.length > 4) key_facts.length = 4;
  return {
    ok: true,
    headline: "Jours à privilégier sur la période",
    summary: "Ces dates ressortent comme les options les plus favorables sur la fenêtre analysée.",
    key_facts,
    caveat: null
  };
}
function ymdFromAnyDate(v) {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}
function toFiniteNumberOrNull(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function getAlertLevel(r) {
  const a = toFiniteNumberOrNull(r?.alert_level_max);
  if (a !== null) return a;
  return toFiniteNumberOrNull(r?.weather_alert_level);
}
function toBoolOrNull(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  }
  return null;
}
const triAny = (vals, pred) => {
  const known = vals.filter((x) => x !== null);
  if (known.length === 0) return "unknown";
  return known.some(pred) ? "some" : "none";
};
function windowWorstDaysDeterministic(input) {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache (côté risques)",
      summary: "Aucune date n’est clairement ressortie comme “à éviter” sur cette période.",
      key_facts: [
        "Décision : vérifiez un jour précis si vous suspectez un risque non capté par les signaux disponibles."
      ],
      caveat: "Worstlist vide après application des critères et/ou absence de jours dans la fenêtre."
    };
  }
  const worst = rows.slice(0, 3);
  const dates = worst.map((r) => ymdFromAnyDate(r?.date));
  const key_facts = [];
  key_facts.push(`Décision : évitez en priorité ${dates.join(", ")}.`);
  const wxTri = triAny(worst.map((r) => getAlertLevel(r)), (a) => a > 0);
  if (wxTri === "unknown") {
    key_facts.push("Météo : signal indisponible sur ces dates (donnée manquante).");
  } else if (wxTri === "none") {
    key_facts.push("Météo : aucune alerte météo signalée sur ces dates.");
  } else {
    key_facts.push("Météo : signaux météo présents sur certaines dates (à surveiller selon le format).");
  }
  const compTri = triAny(
    worst.map((r) => {
      const c5 = toFiniteNumberOrNull(r?.events_within_5km_count);
      const c10 = toFiniteNumberOrNull(r?.events_within_10km_count);
      return c5 !== null ? c5 : c10;
    }),
    (c) => c > 0
  );
  key_facts.push(
    compTri === "unknown" ? "Concurrence : signal indisponible sur ces dates (donnée manquante)." : compTri === "none" ? "Concurrence : aucune concurrence directe détectée à proximité sur ces dates." : "Concurrence : concurrence présente sur certaines dates (stratégie à adapter)."
  );
  const wk = worst.map((r) => toBoolOrNull(r?.is_weekend));
  const ph = worst.map((r) => toBoolOrNull(r?.is_public_holiday_fr_flag));
  const sc = worst.map((r) => toBoolOrNull(r?.is_school_holiday_flag));
  const calKnown = [...wk, ...ph, ...sc].some((v) => v !== null);
  const calSome = [...wk, ...ph, ...sc].some((v) => v === true);
  if (!calKnown) {
    key_facts.push("Calendrier : signal indisponible sur ces dates (donnée manquante).");
  } else if (calSome) {
    key_facts.push("Calendrier : contexte particulier sur au moins une date (horaires/communication à ajuster si besoin).");
  }
  return {
    ok: true,
    headline: "Jours à éviter sur la période",
    summary: "Ces dates ressortent comme les plus défavorables sur la fenêtre analysée.",
    key_facts,
    caveat: null
  };
}
function ymd(v) {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  return "";
}
function numOrNull(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function truthBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}
function fmtList(xs) {
  return xs.filter(Boolean).join(", ");
}
function commercialEventNames(r) {
  const a = Array.isArray(r?.commercial_events) ? r.commercial_events : [];
  return a.map((x) => typeof x?.event_name === "string" ? x.event_name : "").map((s) => s.trim()).filter(Boolean);
}
function buildUiPackagingV3Month(args) {
  const intent = args.intent;
  const used = (Array.isArray(args.used_dates) ? args.used_dates : []).map((d) => String(d).slice(0, 10));
  const idx = /* @__PURE__ */ new Map();
  for (const r of Array.isArray(args.month_days) ? args.month_days : []) {
    const d = ymd(r?.date);
    if (d) idx.set(d, r);
  }
  const timeframe_label = typeof args.month_window?.display_label === "string" ? args.month_window.display_label : void 0;
  const headerTitle = intent === "WINDOW_WORST_DAYS" ? "Jours les moins favorables sur la période" : "Jours les plus favorables sur la période";
  const dates = used.map((d) => {
    const r = idx.get(d) ?? null;
    const date_label = r && typeof r?.display_label === "string" && r.display_label.trim() ? r.display_label : d;
    const regimeRaw = typeof r?.opportunity_regime === "string" ? r.opportunity_regime.trim().toUpperCase() : "";
    const regime = regimeRaw === "A" || regimeRaw === "B" || regimeRaw === "C" ? regimeRaw : null;
    const score = numOrNull(r?.opportunity_score_final_local);
    const weather_alert = numOrNull(r?.weather_alert_level);
    const precip = numOrNull(r?.precipitation_probability_max_pct);
    const wind = numOrNull(r?.wind_speed_10m_max);
    const weather_code = numOrNull(r?.weather_code);
    const meteoFacts = [];
    if (weather_alert !== null) meteoFacts.push(`Alerte météo: niveau ${weather_alert}`);
    if (precip !== null) meteoFacts.push(`Pluie (probabilité max): ${Math.round(precip)}%`);
    if (wind !== null) meteoFacts.push(`Vent (max): ${Math.round(wind)}`);
    if (weather_code !== null) meteoFacts.push(`Code météo: ${Math.round(weather_code)}`);
    const c5 = numOrNull(r?.events_within_5km_count);
    const c10 = numOrNull(r?.events_within_10km_count);
    const c50 = numOrNull(r?.events_within_50km_count);
    const compFacts = [];
    if (c5 !== null) compFacts.push(`Événements ≤5km: ${Math.round(c5)}`);
    if (c10 !== null) compFacts.push(`Événements ≤10km: ${Math.round(c10)}`);
    if (c50 !== null) compFacts.push(`Événements ≤50km: ${Math.round(c50)}`);
    const isWeekend = truthBool(r?.is_weekend);
    const isSchool = truthBool(r?.is_school_holiday_flag);
    const isHoliday = truthBool(r?.is_public_holiday_fr_flag);
    const isCommercial = truthBool(r?.is_commercial_event_flag);
    const calFacts = [];
    if (isWeekend !== null) calFacts.push(`Week-end: ${isWeekend ? "oui" : "non"}`);
    if (isSchool !== null) calFacts.push(`Vacances scolaires: ${isSchool ? "oui" : "non"}`);
    if (isHoliday !== null) calFacts.push(`Jour férié: ${isHoliday ? "oui" : "non"}`);
    if (isCommercial !== null) calFacts.push(`Événement commercial: ${isCommercial ? "oui" : "non"}`);
    const cNames = commercialEventNames(r);
    if (cNames.length) calFacts.push(`Temps fort(s) commercial(aux): ${fmtList(cNames.slice(0, 3))}`);
    const scoreFacts = [];
    if (regime) scoreFacts.push(`Classement: ${regime}`);
    if (score !== null) scoreFacts.push(`Score: ${Math.round(score)}`);
    const sections = [
      { id: "autre", title: "Score", facts: scoreFacts, implications: [] },
      { id: "meteo_faisabilite", title: "Météo", facts: meteoFacts, implications: [] },
      { id: "concurrence", title: "Concurrence", facts: compFacts, implications: [] },
      { id: "calendrier", title: "Calendrier", facts: calFacts, implications: [] }
    ].filter((s) => s.facts.length > 0);
    return {
      date: d,
      date_label,
      score: regime ? { regime, ...score !== null ? { score: Math.round(score) } : {} } : void 0,
      sections
    };
  });
  const out = {
    v: 3,
    header: {
      title: headerTitle,
      ...timeframe_label ? { timeframe_label } : {},
      summary_bullets: []
      // keep empty (truth-first). later you can generate deterministically or via LLM on top.
    },
    dates
  };
  return out;
}
function safeStr(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}
function safeNum(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function factId(eventUid, field) {
  return `F.lookup.${field}.${eventUid}`;
}
function buildLookupIRV1FromRow(row) {
  const r = row?.event ?? row ?? null;
  const uid = r ? safeStr(r.event_uid) : null;
  if (!r || !uid) {
    const facts2 = [
      {
        fact_id: "F.lookup.not_found",
        date: "",
        dimension: "governance",
        label_fr: "Aucun événement correspondant n’a été trouvé.",
        source_fields: []
      }
    ];
    return {
      kind: "lookup",
      facts_by_date: { _lookup: facts2 },
      line_items: [
        {
          kind: "headline",
          template_id: "LOOKUP_EVENT_NOT_FOUND",
          fact_ids: ["F.lookup.not_found"],
          params: {}
        }
      ]
    };
  }
  const eventUid = uid;
  const facts = [];
  const eventDate = safeStr(r.event_date);
  const factDate = eventDate ?? "";
  function pushFact(field, label_fr, source_fields) {
    facts.push({
      fact_id: factId(eventUid, field),
      date: factDate,
      dimension: "governance",
      label_fr,
      source_fields
    });
  }
  const eventLabel = safeStr(r.event_label);
  if (eventLabel) {
    pushFact("event_label", `Nom : ${eventLabel}`, ["event_label"]);
  }
  if (eventDate) {
    pushFact("event_date", `Date : ${eventDate}`, ["event_date"]);
  }
  const cityName = safeStr(r.city_name);
  if (cityName) {
    pushFact("city_name", `Ville : ${cityName}`, ["city_name"]);
  }
  let distanceM = safeNum(r.distance_m) ?? safeNum(r.distance_meters) ?? (safeNum(r.distance_km) !== null ? safeNum(r.distance_km) * 1e3 : null);
  if (distanceM !== null) {
    pushFact(
      "distance_m",
      `Distance : ${Math.round(distanceM)} m`,
      ["distance_m"]
    );
  }
  const sourceSystem = safeStr(r.source_system);
  if (sourceSystem) {
    pushFact("source_system", `Source : ${sourceSystem}`, ["source_system"]);
  }
  const fact_ids = facts.map((f) => f.fact_id);
  return {
    kind: "lookup",
    facts_by_date: { _lookup: facts },
    line_items: [
      {
        kind: "headline",
        template_id: "LOOKUP_EVENT_FOUND",
        fact_ids,
        params: {
          event_uid: eventUid,
          event_label: eventLabel ?? "Événement",
          event_date: eventDate ?? "",
          city_name: cityName ?? "",
          distance_m: distanceM,
          source_system: sourceSystem ?? ""
        }
      }
    ]
  };
}
function buildFactsIndex(facts_by_date) {
  const ids = /* @__PURE__ */ new Set();
  for (const k of Object.keys(facts_by_date)) {
    for (const f of facts_by_date[k] ?? []) {
      if (f?.fact_id) ids.add(f.fact_id);
    }
  }
  return ids;
}
function assertNoSentenceWithoutFactIdV1(facts_by_date, line_items) {
  const idx = buildFactsIndex(facts_by_date);
  for (let i = 0; i < (line_items ?? []).length; i++) {
    const li = line_items[i];
    if (!li) throw new Error(`LineItem[${i}] undefined`);
    if (!Array.isArray(li.fact_ids) || li.fact_ids.length < 1) {
      throw new Error(`LineItem[${i}] has no fact_ids`);
    }
    for (const fid of li.fact_ids) {
      if (!idx.has(fid)) {
        throw new Error(`LineItem[${i}] references unknown fact_id: ${fid}`);
      }
    }
  }
}
const prerender = false;
const DEV_BYPASS_PROMPT = false;
function requireString(v, name) {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${name}`);
  }
  return v.trim();
}
const SUPPORTED_DIMS = /* @__PURE__ */ new Set(["WEATHER", "NEARBY_EVENTS", "CALENDAR"]);
function isScoringIntent(i) {
  return i !== "EVENT_LOOKUP" && i !== "LOOKUP_EVENT";
}
function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => typeof x === "string" ? x : String(x)).filter((s) => s.trim().length > 0);
}
function normalizeAiOutput(ai, meta, actions) {
  const out = ai?.output;
  const metaWithDecisionRef = {
    ...meta,
    decision_payload_ref: {
      horizon: meta.horizon,
      intent: meta.intent,
      used_dates: meta.used_dates,
      source: "decision_payload"
    }
  };
  if (out && typeof out === "object" && typeof out.headline === "string" && typeof out.answer === "string" && Array.isArray(out.reasons) && Array.isArray(out.key_facts) && out.actions && typeof out.actions === "object" && "primary" in out.actions && "secondary" in out.actions) {
    return {
      headline: out.headline,
      answer: out.answer,
      reasons: asStringArray(out.reasons),
      key_facts: asStringArray(out.key_facts),
      actions,
      caveats: asStringArray(out.caveats),
      meta: metaWithDecisionRef
    };
  }
  if (out && typeof out === "object") {
    const headline = typeof out.headline === "string" && out.headline.trim() ? out.headline.trim() : "Résumé";
    const bulletsTxt = Array.isArray(out.bullets) && out.bullets.length ? asStringArray(out.bullets).filter(Boolean) : [];
    const key_facts = Array.isArray(out.key_facts) ? asStringArray(out.key_facts) : Array.isArray(out.facts) ? asStringArray(out.facts) : Array.isArray(out.bullets) ? asStringArray(out.bullets) : [];
    const answer = typeof out.answer === "string" && out.answer.trim() ? out.answer.trim() : typeof out.summary === "string" && out.summary.trim() ? out.summary.trim() : bulletsTxt.length ? `• ${bulletsTxt.slice(0, 5).join("\n• ")}` : key_facts.length ? `• ${key_facts.slice(0, 5).join("\n• ")}` : "Résumé basé sur les données disponibles.";
    Array.isArray(out.reasons) ? asStringArray(out.reasons) : Array.isArray(out.why) ? asStringArray(out.why) : Array.isArray(out.reasons_short) ? asStringArray(out.reasons_short) : [];
    const caveats = typeof out.caveat === "string" && out.caveat.trim() ? [out.caveat.trim()] : Array.isArray(out.caveats) ? asStringArray(out.caveats) : [];
    const isDeterministicMode = typeof ai?.mode === "string" && ai.mode.startsWith("deterministic_");
    return {
      headline,
      answer,
      // ✅ use the computed answer (summary/bullets/key_facts fallback)
      // Deterministic engines are allowed to ship user-facing key_facts.
      // We control duplication elsewhere (conversation layer / deterministic_reasons).
      reasons: isDeterministicMode ? [] : Array.isArray(out.reasons) && out.reasons.length ? asStringArray(out.reasons) : bulletsTxt,
      key_facts,
      actions,
      caveats,
      meta: metaWithDecisionRef
    };
  }
  if (typeof out === "string" && out.trim()) {
    return {
      headline: "Résumé",
      answer: out.trim(),
      reasons: [],
      key_facts: [],
      actions,
      caveats: [],
      meta: metaWithDecisionRef
    };
  }
  const raw = typeof ai?.raw_text === "string" ? ai.raw_text.trim() : "";
  return {
    headline: "Résumé",
    answer: raw || "Je n’ai pas pu produire une réponse utile avec les données disponibles.",
    reasons: [],
    key_facts: [],
    actions,
    caveats: raw ? ["Sortie AI brute utilisée (raw_text)."] : ["Sortie AI vide ou illisible."],
    meta: metaWithDecisionRef
  };
}
function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function resolveIntentFromText(qRaw, horizon) {
  const q = norm(qRaw);
  if (horizon === "selected_days" || q.includes("entre ces") || q.includes("compar") || q.includes("difference") || q.includes("laquelle") || q.includes(" vs ")) return "COMPARE_DATES";
  if (horizon === "day") {
    if (q.includes("pourquoi") || q.includes("qu est-ce qui") || q.includes("3 elements")) {
      return "DAY_WHY";
    }
    if (q.includes("meteo") || q.includes("pluie") || q.includes("vent") || q.includes("alerte") || q.includes("evenement") || q.includes("concurrence") || q.includes("tourisme") || q.includes("affluence") || q.includes("mobilite") || q.includes("trafic") || q.includes("deplacement") || q.includes("transport")) {
      return "DAY_DIMENSION_DETAIL";
    }
    return "DAY_WHY";
  }
  if (q.includes("principal") || q.includes("facteur") || q.includes("point de vigilance") || q.includes("complique le plus") || q.includes("surtout a cause")) return "DRIVER_PRIMARY";
  if (q.includes("periode") || q.includes("plusieurs jours") || q.includes("consecut") || q.includes("fenetre") || q.includes("tendance") || q.includes("a partir de quand") || q.includes("s ameliore") || q.includes("devient")) return "WINDOW_PATTERNS";
  if (q.includes("equilibre") || q.includes("compromis") || q.includes("cumul") || q.includes("plusieurs contraintes") || q.includes("moins de contraintes")) return "WINDOW_COMBINED_TRADEOFF";
  if (q.includes("a eviter") || q.includes("a éviter") || q.includes("deconseille") || q.includes("déconseillé") || q.includes("defavorable") || q.includes("défavorable") || q.includes("moins adapte") || q.includes("moins adapté") || q.includes("plus complique") || q.includes("plus compliqué") || q.includes("plus risque") || q.includes("plus risqué") || q.includes("pire") || q.includes("pires") || q.includes("pirs") || q.includes("mauvais jours") || q.includes("jours a eviter") || q.includes("jours à éviter")) return "WINDOW_WORST_DAYS";
  const asksToFilter = q.includes("correspond") || // "jours correspondant à..."
  q.includes("filtr") || // "filtrer"
  q.includes("tri") || // "trier"
  q.includes("uniquement") || // "uniquement"
  q.includes("seulement") || // "seulement"
  q.includes("montre moi") || // "montre-moi les jours..."
  q.includes("liste") || // "liste des jours..."
  q.includes("quels jours") || // typical filter ask
  q.includes("jours ou") || q.includes("jours où") || // "jours où il pleut"
  q.includes("sans ") || // "sans pluie"
  q.includes("pas de ") || // "pas de pluie"
  q.includes("aucun ") || q.includes("aucune ") || // "aucune concurrence"
  q.includes("peu de ") || // "peu de vent"
  q.includes("hors ");
  const mentionsDimensions = q.includes("meteo") || q.includes("météo") || q.includes("pluie") || q.includes("vent") || q.includes("alerte") || q.includes("temperature") || q.includes("température") || q.includes("evenement") || q.includes("événement") || q.includes("evenements") || q.includes("événements") || q.includes("concurrence") || q.includes("festival") || q.includes("marche") || q.includes("marché") || q.includes("tourisme") || q.includes("affluence") || q.includes("mobilite") || q.includes("mobilité") || q.includes("trafic") || q.includes("transport") || q.includes("deplacement") || q.includes("déplacement");
  if (asksToFilter && mentionsDimensions) return "WINDOW_FILTER_DAYS";
  return "WINDOW_TOP_DAYS";
}
function resolveHorizonFromText(q) {
  const s = norm(q);
  const dateMatches = [
    ...String(q ?? "").matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
    ...String(q ?? "").matchAll(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g)
  ];
  const hasTwoDates = dateMatches.length >= 2;
  if (hasTwoDates || s.includes("compar") || s.includes("entre") || s.includes(" vs ") || s.includes("vs ")) {
    return "selected_days";
  }
  const hasExplicitDate = dateMatches.length >= 1;
  const hasRelativeWeekday = /\b(ce|cette)\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(s) || /\b(aujourd'hui|aujourdhui|demain)\b/.test(s);
  if (s.includes("pourquoi") || s.includes("ce jour") || s.includes("date precise") || hasExplicitDate || hasRelativeWeekday) {
    return "day";
  }
  return "month";
}
function resolveTopKFromText(qRaw) {
  const s = norm(qRaw);
  const m = s.match(/\btop\s*(\d{1,2})\b/);
  if (m?.[1]) {
    const k = Number(m[1]);
    if (Number.isFinite(k)) return Math.max(1, Math.min(7, Math.floor(k)));
  }
  const m2 = s.match(/\b(\d{1,2})\s*(meilleur|meilleurs|meilleures|premier|premiers|premières)\b/);
  if (m2?.[1]) {
    const k = Number(m2[1]);
    if (Number.isFinite(k)) return Math.max(1, Math.min(7, Math.floor(k)));
  }
  if (s.includes("les deux") || s.includes("deux meilleurs") || s.includes("deux meilleures") || s.includes("top deux")) return 2;
  if (s.includes("les trois") || s.includes("trois meilleurs") || s.includes("trois meilleures") || s.includes("top trois")) return 3;
  return 3;
}
function addDaysYmd(ymd2, deltaDays) {
  const [y, m, d] = ymd2.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}
function toBoolOrNullStrict(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  }
  return null;
}
function toBoolOrNullLocal(v) {
  return toBoolOrNullStrict(v);
}
function isEventLookupQuestion(q) {
  const s = norm(q ?? "");
  const lookupPhrase = s.includes("a quelle date") || s.includes("c est quand") || s.includes("quand a lieu") || s.includes("dates de ") || s.includes("date de debut") || s.includes("date de fin");
  if (!lookupPhrase) return false;
  const hasScoringKeywords = s.includes("meilleur") || s.includes("meilleurs") || s.includes("top") || s.includes("pire") || s.includes("eviter") || s.includes("defavorable") || s.includes("periode stable") || s.includes("tendance") || s.includes("sequence") || s.includes("compar") || s.includes("entre") || s.includes(" vs ") || s.includes("vs ");
  return !hasScoringKeywords;
}
function adaptDayFactsByDate(ir) {
  if (!ir?.date || !Array.isArray(ir?.facts)) {
    throw new Error("DayWhy IR missing date or facts");
  }
  return { [ir.date]: ir.facts };
}
function adaptDayLineItems(irLineItems) {
  return (irLineItems ?? []).map((li, idx) => {
    if (typeof li?.fact_id === "string" && li.fact_id.trim() !== "") {
      return {
        kind: li.kind === "action" ? "implication" : li.kind === "risk" ? "caveat" : "fact",
        template_id: "HEADLINE_DAY_WHY",
        fact_ids: [li.fact_id],
        params: {
          text_override: li.text_fr ?? ""
        }
      };
    }
    if (Array.isArray(li?.fact_ids) && li.fact_ids.length > 0) {
      return {
        kind: li.kind ?? "fact",
        template_id: li.template_id ?? "HEADLINE_DAY_WHY",
        fact_ids: li.fact_ids,
        params: li.params ?? {}
      };
    }
    throw new Error(`DayWhy LineItem[${idx}] invalid shape`);
  });
}
const POST = async ({ request, locals }) => {
  function ymdFromYyyyMmDd(y, m, d) {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (y < 1900 || y > 2100) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  }
  function extractDateMentions(qRaw, anchorYmd) {
    const q = String(qRaw ?? "");
    const out = [];
    let hasToken = false;
    let unparsedToken = false;
    const anchor = typeof anchorYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd) ? anchorYmd : null;
    const anchorYear = anchor ? Number(anchor.slice(0, 4)) : null;
    const anchorMonth = anchor ? Number(anchor.slice(5, 7)) : null;
    const yearHit = q.match(/\b(20\d{2})\b/);
    const defaultYearFromQuery = yearHit ? Number(yearHit[1]) : null;
    function yearForMonthNoYear(mo) {
      const baseYear = defaultYearFromQuery ?? anchorYear;
      if (!baseYear) return null;
      if (anchorMonth && mo < anchorMonth && defaultYearFromQuery == null) {
        return baseYear + 1;
      }
      return baseYear;
    }
    const qNorm = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const m of q.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
      hasToken = true;
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
    }
    for (const m of q.matchAll(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g)) {
      hasToken = true;
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
    }
    for (const m of q.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      hasToken = true;
      const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
    }
    for (const m of q.matchAll(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g)) {
      hasToken = true;
      const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
    }
    const MONTHS_FR = {
      janvier: 1,
      fevrier: 2,
      mars: 3,
      avril: 4,
      mai: 5,
      juin: 6,
      juillet: 7,
      aout: 8,
      septembre: 9,
      octobre: 10,
      novembre: 11,
      decembre: 12
    };
    const monthAlternation = Object.keys(MONTHS_FR).map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|");
    const monthWordRe = new RegExp(`(?:^|[^a-z])(${monthAlternation})(?=[^a-z]|$)`, "i");
    if (monthWordRe.test(qNorm)) hasToken = true;
    const dayAtom = "(?:\\d{1,2}|1er)";
    const weekdayOpt = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)";
    const frListRe = new RegExp(
      `((?:${dayAtom})(?:\\s*,\\s*(?:${dayAtom}))*\\s*(?:\\s*(?:et|&)\\s*(?:${dayAtom}))?)\\s+(${monthAlternation})\\s+(\\d{4})(?=[^0-9a-z]|$)`,
      "gi"
    );
    for (const m of qNorm.matchAll(frListRe)) {
      const listPart = m[1];
      const hasSep = /,|\bet\b|&/i.test(listPart);
      if (!hasSep) continue;
      hasToken = true;
      const mo = MONTHS_FR[m[2]];
      const y0 = Number(m[3]);
      const y = Number.isFinite(y0) ? y0 : defaultYearFromQuery;
      if (!y) {
        unparsedToken = true;
        continue;
      }
      for (const dm of listPart.matchAll(new RegExp(`\\b(\\d{1,2}|1er)\\b`, "g"))) {
        const dayRaw = dm[1] === "1er" ? "1" : dm[1];
        const d = Number(dayRaw);
        const ymd2 = ymdFromYyyyMmDd(y, mo, d);
        if (ymd2) out.push(ymd2);
      }
    }
    const frListNoYearRe = new RegExp(
      `((?:${dayAtom})(?:\\s*,\\s*(?:${dayAtom}))*\\s*(?:\\s*(?:et|&)\\s*(?:${dayAtom}))?)\\s+(${monthAlternation})(?=[^a-z]|$)`,
      "gi"
    );
    for (const m of qNorm.matchAll(frListNoYearRe)) {
      const listPart = m[1];
      const hasSep = /,|\bet\b|&/i.test(listPart);
      if (!hasSep) continue;
      hasToken = true;
      const mo = MONTHS_FR[m[2]];
      const y = yearForMonthNoYear(mo);
      if (!y) {
        unparsedToken = true;
        continue;
      }
      for (const dm of listPart.matchAll(new RegExp(`\\b(\\d{1,2}|1er)\\b`, "g"))) {
        const dayRaw = dm[1] === "1er" ? "1" : dm[1];
        const d = Number(dayRaw);
        const ymd2 = ymdFromYyyyMmDd(y, mo, d);
        if (ymd2) out.push(ymd2);
        else unparsedToken = true;
      }
    }
    const frSingleRe = new RegExp(
      `(?:^|[^a-z])(?:${weekdayOpt}\\s+)?(${dayAtom})\\s+(${monthAlternation})\\s+(\\d{4})(?=[^0-9a-z]|$)`,
      "gi"
    );
    for (const m of qNorm.matchAll(frSingleRe)) {
      hasToken = true;
      const dayRaw = m[1] === "1er" ? "1" : m[1];
      const d = Number(dayRaw);
      const mo = MONTHS_FR[m[2]];
      const y = Number(m[3]);
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
    }
    const frSingleNoYearRe = new RegExp(
      `(?:^|[^a-z])(?:${weekdayOpt}\\s+)?(${dayAtom})\\s+(${monthAlternation})(?=[^a-z]|$)`,
      "gi"
    );
    for (const m of qNorm.matchAll(frSingleNoYearRe)) {
      hasToken = true;
      const dayRaw = m[1] === "1er" ? "1" : m[1];
      const d = Number(dayRaw);
      const mo = MONTHS_FR[m[2]];
      const y = yearForMonthNoYear(mo);
      if (!y) {
        unparsedToken = true;
        continue;
      }
      const ymd2 = ymdFromYyyyMmDd(y, mo, d);
      if (ymd2) out.push(ymd2);
      else unparsedToken = true;
    }
    const seen = /* @__PURE__ */ new Set();
    const uniq = [];
    for (const d of out) {
      if (!seen.has(d)) {
        seen.add(d);
        uniq.push(d);
      }
    }
    const unparsed = unparsedToken || hasToken && uniq.length === 0;
    return { dates: uniq, hasDateToken: hasToken, unparsedDateToken: unparsed };
  }
  function fmtDateFr(ymd2) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd2)) return ymd2;
    const [y, m, d] = ymd2.split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "long"
    }).format(dt);
  }
  function toFiniteNumOrNullLocal(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function buildCompareKeyFactsFallback(selectedRows) {
    const rows = Array.isArray(selectedRows) ? selectedRows : [];
    return rows.slice().sort((a, b) => ymdFromAnyDateLocal(a?.date).localeCompare(ymdFromAnyDateLocal(b?.date))).map((r) => {
      const d = ymdFromAnyDateLocal(r?.date);
      const dFr = fmtDateFr(d);
      const reg = String(r?.opportunity_regime ?? "ND");
      const score = toFiniteNumOrNullLocal(r?.opportunity_score_final_local);
      const alert = toFiniteNumOrNullLocal(
        r?.alert_level_max ?? // selected_days surface (common)
        r?.weather_alert_level ?? // month/day surface
        r?.weather_alert?.level ?? // nested struct (if any)
        r?.weather_alert_level_max
        // alt naming
      );
      const pr = toFiniteNumOrNullLocal(
        r?.precip_probability_max_pct ?? r?.precipitation_probability_max_pct
      );
      const wi = toFiniteNumOrNullLocal(r?.wind_speed_10m_max);
      const c10 = toFiniteNumOrNullLocal(r?.events_within_10km_count);
      const c50 = toFiniteNumOrNullLocal(r?.events_within_50km_count);
      const scoreTxt = score === null ? "ND" : String(Math.round(score));
      const alertTxt = alert === null ? "ND" : String(Math.round(alert));
      const prTxt = pr === null ? "ND" : String(Math.round(pr));
      const wiTxt = wi === null ? "ND" : String(Math.round(wi));
      const c10Txt = c10 === null ? "ND" : String(Math.round(c10));
      const c50Txt = c50 === null ? "ND" : String(Math.round(c50));
      return `${dFr} — Régime ${reg}, score ${scoreTxt} · Météo: alerte ${alertTxt}, pluie ${prTxt}%, vent ${wiTxt} · Concurrence: ≤10km ${c10Txt}, ≤50km ${c50Txt}`;
    });
  }
  function toNumLocal(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  function ymdFromAnyDateLocal(v) {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
    if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    return "(date inconnue)";
  }
  function deriveCompetitionScopeLocal(r) {
    const c5 = toNumLocal(r?.events_within_5km_count);
    const c10 = toNumLocal(r?.events_within_10km_count);
    const c50 = toNumLocal(r?.events_within_50km_count);
    const has5 = Number.isFinite(c5) && c5 > 0;
    const has10 = Number.isFinite(c10) && c10 > 0;
    const has50 = Number.isFinite(c50) && c50 > 0;
    if (has5) return "local";
    if (has10) return "local";
    if (has50) return "regional";
    return "none";
  }
  function deriveCompetitionExplainLocal(r) {
    const c5 = toNumLocal(r?.events_within_5km_count);
    const c10 = toNumLocal(r?.events_within_10km_count);
    const c50 = toNumLocal(r?.events_within_50km_count);
    const c5Txt = Number.isFinite(c5) ? String(Math.round(c5)) : "ND";
    const c10Txt = Number.isFinite(c10) ? String(Math.round(c10)) : "ND";
    const c50Txt = Number.isFinite(c50) ? String(Math.round(c50)) : "ND";
    const scope = deriveCompetitionScopeLocal(r);
    if (scope === "none") return "Concurrence: aucune pression détectée (≤10/50km à 0 ou ND).";
    if (scope === "local") return `Concurrence directe: ${c5Txt} évts ≤5km | ${c10Txt} évts ≤10km | ${c50Txt} évts ≤50km.`;
    return `Concurrence régionale: 0 à ≤10km; ${c50Txt} évts ≤50km.`;
  }
  function qHasAny(q, needles) {
    const s = norm(q);
    return needles.some((n) => s.includes(n));
  }
  function requestedSignalKeys(q, intent) {
    const keys = /* @__PURE__ */ new Set();
    if (qHasAny(q, ["meteo", "météo", "pluie", "vent", "temperature", "température", "alerte"])) keys.add("weather");
    if (qHasAny(q, ["evenement", "événement", "evenements", "événements", "concurrence", "festival", "marché", "marche"])) keys.add("competition");
    if (qHasAny(q, ["week-end", "weekend", "férié", "ferie", "vacances", "calendrier"])) keys.add("calendar");
    if (qHasAny(q, ["tourisme", "touristes", "affluence"])) keys.add("tourism");
    if (qHasAny(q, ["mobilite", "mobilité", "trafic", "transport", "deplacement", "déplacement", "circulation"])) keys.add("mobility");
    if (intent === "DRIVER_PRIMARY") {
      keys.add("competition");
      keys.add("weather");
      keys.add("calendar");
    }
    if (intent === "WINDOW_COMBINED_TRADEOFF") {
      keys.add("competition");
      keys.add("weather");
      keys.add("calendar");
    }
    if (keys.size === 0 && (intent === "WINDOW_TOP_DAYS" || intent === "WINDOW_WORST_DAYS")) {
      keys.add("weather");
      keys.add("competition");
      keys.add("calendar");
    }
    return keys;
  }
  function inferVenueExposureFromContext(ctx) {
    const lt = String(ctx?.location_type ?? "").toLowerCase();
    const ca = String(ctx?.company_activity_type ?? "").toLowerCase();
    const ep = String(ctx?.event_time_profile ?? "").toLowerCase();
    const hay = [lt, ca, ep].filter(Boolean).join(" | ");
    if (hay.includes("outdoor") || hay.includes("exterieur") || hay.includes("extérieur") || hay.includes("plein air") || hay.includes("plein_air")) {
      return { exposure: "outdoor", basis: "vw_insight_event_ai_location_context: location_type/company_activity_type/event_time_profile contient un marqueur extérieur" };
    }
    if (hay.includes("indoor") || hay.includes("interieur") || hay.includes("intérieur")) {
      return { exposure: "indoor", basis: "vw_insight_event_ai_location_context: location_type/company_activity_type/event_time_profile contient un marqueur intérieur" };
    }
    return { exposure: "unknown", basis: "vw_insight_event_ai_location_context ne permet pas d’inférer intérieur/extérieur (aucun marqueur explicite)" };
  }
  function buildWeatherSignal(row, ctx) {
    const { exposure, basis } = inferVenueExposureFromContext(ctx);
    const alert = row?.weather_alert_level ?? null;
    const precipProb = row?.precip_probability_max_pct ?? null;
    const wind = row?.wind_speed_10m_max ?? null;
    const wxCode = row?.weather_code ?? null;
    const alertNum = typeof alert === "number" ? alert : Number(alert);
    const precipNum = typeof precipProb === "number" ? precipProb : Number(precipProb);
    const windNum = typeof wind === "number" ? wind : Number(wind);
    const facts = {
      weather_alert_level: Number.isFinite(alertNum) ? alertNum : null,
      precip_probability_max_pct: Number.isFinite(precipNum) ? precipNum : null,
      wind_speed_10m_max: Number.isFinite(windNum) ? windNum : null,
      weather_code: typeof wxCode === "string" && wxCode.trim() ? wxCode.trim() : wxCode ?? null,
      venue_exposure: exposure,
      venue_exposure_basis: basis
    };
    const hasAlert = facts.weather_alert_level !== null;
    const hasPrecip = facts.precip_probability_max_pct !== null;
    const hasWind = facts.wind_speed_10m_max !== null;
    const applicable = hasAlert || hasPrecip || hasWind;
    const primary_drivers = [];
    if (hasAlert) primary_drivers.push("weather_alert");
    if (hasPrecip) primary_drivers.push("weather_precipitation");
    if (hasWind) primary_drivers.push("weather_wind");
    let impact = "neutral";
    if (Number.isFinite(alertNum) && alertNum >= 3) {
      impact = "blocking";
    } else {
      const precipNonZero = Number.isFinite(precipNum) && precipNum > 0;
      const windNonZero = Number.isFinite(windNum) && windNum > 0;
      if (exposure !== "indoor" && (precipNonZero || windNonZero)) {
        impact = "risk";
      }
      if (exposure === "indoor" && (Number.isFinite(alertNum) && alertNum >= 1)) {
        impact = "risk";
      }
    }
    const explanation = !applicable ? "Signal météo non calculable: champs météo absents sur la ligne truth." : impact === "blocking" ? "Signal météo bloquant: niveau d’alerte météo ≥ 3 (règle hard v1)." : impact === "risk" ? exposure === "indoor" ? "Signal météo à risque: présence d’une alerte météo (même en intérieur)." : (() => {
      const parts = [];
      const precipNonZero = Number.isFinite(precipNum) && precipNum > 0;
      const windNonZero = Number.isFinite(windNum) && windNum > 0;
      if (precipNonZero) parts.push("pluie");
      if (windNonZero) parts.push("vent");
      const what = parts.length ? parts.join(" et ") : "météo";
      return `Signal météo à risque: ${what} non nul(s) et lieu non confirmé intérieur.`;
    })() : "Signal météo neutre: aucune alerte bloquante et pas de risque météo détectable via les champs disponibles.";
    return {
      applicable,
      primary_drivers: applicable ? primary_drivers.length ? primary_drivers : ["weather_alert"] : [],
      impact,
      facts,
      explanation
    };
  }
  function buildCompetitionSignal(row) {
    const c5 = row?.events_within_5km_count ?? null;
    const c10 = row?.events_within_10km_count ?? null;
    const c50 = row?.events_within_50km_count ?? null;
    const n5 = typeof c5 === "number" ? c5 : Number(c5);
    const n10 = typeof c10 === "number" ? c10 : Number(c10);
    const n50 = typeof c50 === "number" ? c50 : Number(c50);
    const facts = {
      events_within_5km_count: Number.isFinite(n5) ? n5 : null,
      events_within_10km_count: Number.isFinite(n10) ? n10 : null,
      events_within_50km_count: Number.isFinite(n50) ? n50 : null,
      competition_scope: deriveCompetitionScopeLocal(row)
    };
    const applicable = facts.events_within_5km_count !== null || facts.events_within_10km_count !== null || facts.events_within_50km_count !== null;
    const scope = deriveCompetitionScopeLocal(row);
    const hasCompetition = Number.isFinite(n5) && n5 > 0 || Number.isFinite(n10) && n10 > 0 || Number.isFinite(n50) && n50 > 0;
    const primary_drivers = scope === "local" ? ["competition_local"] : scope === "regional" ? ["competition_regional"] : ["competition_regional"];
    const impact = !applicable ? "neutral" : hasCompetition ? "risk" : "neutral";
    const explanation = !applicable ? "Signal concurrence non calculable: compteurs d’événements absents sur la ligne truth." : hasCompetition ? deriveCompetitionExplainLocal(row) : "Concurrence neutre: aucun événement détecté (selon les compteurs disponibles).";
    return {
      applicable,
      primary_drivers: applicable ? primary_drivers : [],
      impact,
      facts,
      explanation
    };
  }
  function buildCalendarSignal(row) {
    const wk = toBoolOrNullLocal(row?.is_weekend);
    const ph = toBoolOrNullLocal(row?.is_public_holiday_fr_flag);
    const sc = toBoolOrNullLocal(row?.is_school_holiday_flag);
    const ce = toBoolOrNullLocal(row?.is_commercial_event_flag);
    const applicable = wk !== null || ph !== null || sc !== null || ce !== null;
    const facts = {
      is_weekend: wk,
      is_public_holiday_fr_flag: ph,
      is_school_holiday_flag: sc,
      is_commercial_event_flag: ce
    };
    const anyConstraint = wk === true || ph === true || sc === true || ce === true;
    const impact = !applicable ? "neutral" : anyConstraint ? "risk" : "neutral";
    const explanation = (() => {
      if (!applicable) {
        return "Signal calendrier non calculable: flags calendrier absents sur la ligne truth.";
      }
      const positives = [];
      if (wk === true) positives.push("week-end");
      if (ph === true) positives.push("jour férié");
      if (sc === true) positives.push("vacances scolaires");
      if (ce === true) positives.push("événement commercial");
      if (positives.length > 0) {
        return `Calendrier contraignant: ${positives.join(", ")}.`;
      }
      const unknowns = [];
      if (wk === null) unknowns.push("week-end");
      if (ph === null) unknowns.push("jour férié");
      if (sc === null) unknowns.push("vacances scolaires");
      if (ce === null) unknowns.push("événement commercial");
      return unknowns.length > 0 ? `Calendrier: données partielles (non renseigné : ${unknowns.join(", ")}).` : "Calendrier neutre: rien à signaler via les flags disponibles.";
    })();
    return {
      applicable,
      primary_drivers: applicable ? ["calendar_constraint"] : [],
      impact,
      facts,
      explanation
    };
  }
  function buildUnavailableSignal(label) {
    return {
      applicable: false,
      primary_drivers: [],
      impact: "neutral",
      facts: { reason: `${label}: pas de champs truth exposés dans les vues utilisées par cette route.` },
      explanation: `${label}: non disponible avec les champs actuellement exposés (truth).`
    };
  }
  function pickSignalFocusRow(args) {
    if (args.horizon === "day") return args.day_row ?? null;
    if (args.horizon === "selected_days") {
      const rows = Array.isArray(args.selected_days_rows) ? args.selected_days_rows : [];
      if (rows.length === 0) return null;
      const regimeRank2 = (v) => {
        const s = typeof v === "string" ? v.trim().toUpperCase() : "";
        if (s === "A") return 0;
        if (s === "B") return 1;
        if (s === "C") return 2;
        return 9;
      };
      const num = (v) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : NaN;
      };
      const cmp = (a, b) => {
        const ra = regimeRank2(a?.opportunity_regime);
        const rb = regimeRank2(b?.opportunity_regime);
        if (ra !== rb) return ra - rb;
        const sa = num(a?.opportunity_score_final_local);
        const sb = num(b?.opportunity_score_final_local);
        const saOk = Number.isFinite(sa);
        const sbOk = Number.isFinite(sb);
        if (saOk !== sbOk) return saOk ? -1 : 1;
        if (saOk && sbOk && sa !== sb) return sb - sa;
        const wa = num(a?.alert_level_max);
        const wb = num(b?.alert_level_max);
        const wa2 = Number.isFinite(wa) ? wa : num(a?.weather_alert_level);
        const wb2 = Number.isFinite(wb) ? wb : num(b?.weather_alert_level);
        const waOk = Number.isFinite(wa2);
        const wbOk = Number.isFinite(wb2);
        if (waOk !== wbOk) return waOk ? -1 : 1;
        if (waOk && wbOk && wa2 !== wb2) return wa2 - wb2;
        const ca = num(a?.events_within_5km_count);
        const cb = num(b?.events_within_5km_count);
        const ca2 = Number.isFinite(ca) ? ca : num(a?.events_within_10km_count);
        const cb2 = Number.isFinite(cb) ? cb : num(b?.events_within_10km_count);
        const caOk = Number.isFinite(ca2);
        const cbOk = Number.isFinite(cb2);
        if (caOk !== cbOk) return caOk ? -1 : 1;
        if (caOk && cbOk && ca2 !== cb2) return ca2 - cb2;
        const da = ymdFromAnyDateLocal(a?.date);
        const db = ymdFromAnyDateLocal(b?.date);
        return da.localeCompare(db);
      };
      return [...rows].sort(cmp)[0] ?? null;
    }
    if (args.intent === "WINDOW_WORST_DAYS") {
      const wl = Array.isArray(args.worstlist_rows) ? args.worstlist_rows : [];
      return wl[0] ?? null;
    }
    const sl = Array.isArray(args.shortlist_rows) ? args.shortlist_rows : [];
    return sl[0] ?? null;
  }
  function buildDecisionSignals(args) {
    const wanted = requestedSignalKeys(args.q, args.intent);
    if (wanted.size === 0) return {};
    const focusRow = pickSignalFocusRow({
      horizon: args.horizon,
      intent: args.intent,
      shortlist_rows: args.shortlist_rows,
      worstlist_rows: args.worstlist_rows,
      day_row: args.day_row,
      selected_days_rows: args.selected_days_rows
    });
    const signals = {};
    for (const k of wanted) {
      if (k === "weather") {
        signals.weather = focusRow ? buildWeatherSignal(focusRow, args.internal_context) : buildUnavailableSignal("Météo");
      } else if (k === "competition") {
        signals.competition = focusRow ? buildCompetitionSignal(focusRow) : buildUnavailableSignal("Concurrence");
      } else if (k === "calendar") {
        signals.calendar = focusRow ? buildCalendarSignal(focusRow) : buildUnavailableSignal("Calendrier");
      } else if (k === "tourism") {
        signals.tourism = buildUnavailableSignal("Tourisme");
      } else if (k === "mobility") {
        signals.mobility = buildUnavailableSignal("Mobilité");
      }
    }
    return signals;
  }
  function ymdFromBqDate(v) {
    if (!v) return null;
    if (typeof v === "string") {
      const s = v.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
    }
    if (typeof v === "object" && typeof v.value === "string") {
      const s = v.value.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
    return null;
  }
  function buildWindowAggregatesV3(args) {
    const mw = args.month_window;
    const days = Array.isArray(args.month_days) ? args.month_days : [];
    const ws = ymdFromBqDate(mw?.window_start_date) ?? null;
    const we = ymdFromBqDate(mw?.window_end_date) ?? null;
    if (!ws || !we) return null;
    const scores = days.map((r) => {
      const n = typeof r?.opportunity_score_final_local === "number" ? r.opportunity_score_final_local : Number(r?.opportunity_score_final_local);
      return Number.isFinite(n) ? n : null;
    }).filter((x) => x !== null).sort((a, b) => a - b);
    const days_a = days.filter((r) => String(r?.opportunity_regime ?? "") === "A").length;
    const days_b = days.filter((r) => String(r?.opportunity_regime ?? "") === "B").length;
    const days_c = days.filter((r) => String(r?.opportunity_regime ?? "") === "C").length;
    const missingWeather = days.filter((r) => r?.weather_code == null).length;
    function getPath(obj, path) {
      if (!obj || !path) return void 0;
      if (!path.includes(".")) return obj?.[path];
      let cur = obj;
      for (const k of path.split(".")) {
        cur = cur?.[k];
        if (cur == null) return cur;
      }
      return cur;
    }
    function pickBool(r, paths) {
      for (const p of paths) {
        const b = toBoolOrNullLocal(getPath(r, p));
        if (b !== null) return b;
      }
      return null;
    }
    const missingCalendar = days.filter((r) => {
      const wk = pickBool(r, ["is_weekend", "calendar.is_weekend", "calendar_weekend_flag"]);
      const ph = pickBool(r, [
        "is_public_holiday_fr_flag",
        "is_public_holiday_flag",
        "public_holiday_fr_flag",
        "calendar.is_public_holiday_fr_flag"
      ]);
      const sc = pickBool(r, [
        "is_school_holiday_flag",
        "is_school_vacation_flag",
        "school_holiday_flag",
        "calendar.is_school_holiday_flag"
      ]);
      const ce = pickBool(r, [
        "is_commercial_event_flag",
        "has_commercial_event_flag",
        "commercial_event_flag",
        "calendar.is_commercial_event_flag"
      ]);
      return wk === null || ph === null || sc === null || ce === null;
    }).length;
    return {
      window_start_date: ws,
      window_end_date: we,
      days_count: days.length,
      score_min: scores.length ? Math.round(scores[0]) : null,
      score_max: scores.length ? Math.round(scores[scores.length - 1]) : null,
      days_a,
      days_b,
      days_c,
      days_missing_calendar_flags: missingCalendar,
      days_missing_weather: missingWeather
    };
  }
  function windowFilterDaysDeterministic(args) {
    const qn = norm(args.q);
    const days = Array.isArray(args.month_days) ? args.month_days : [];
    const wantsWeather = qn.includes("meteo") || qn.includes("météo") || qn.includes("pluie") || qn.includes("vent") || qn.includes("alerte") || qn.includes("temperature") || qn.includes("température");
    const wantsCompetition = qn.includes("concurrence") || qn.includes("evenement") || qn.includes("événement") || qn.includes("evenements") || qn.includes("événements") || qn.includes("festival") || qn.includes("marche") || qn.includes("marché");
    const wantsCalendar = qn.includes("weekend") || qn.includes("week-end") || qn.includes("ferie") || qn.includes("férié") || qn.includes("vacances") || qn.includes("calendrier");
    const negPluie = qn.includes("sans pluie") || qn.includes("pas de pluie") || qn.includes("0 pluie") || qn.includes("zero pluie") || qn.includes("aucune pluie");
    const negVent = qn.includes("sans vent") || qn.includes("pas de vent") || qn.includes("peu de vent") || qn.includes("vent faible");
    const negAlerte = qn.includes("sans alerte") || qn.includes("pas d alerte") || qn.includes("pas d'alerte") || qn.includes("aucune alerte");
    const lowCompetition = qn.includes("peu de concurrence") || qn.includes("faible concurrence") || qn.includes("sans concurrence") || qn.includes("pas de concurrence") || qn.includes("aucun evenement") || qn.includes("aucun événement") || qn.includes("0 evenement") || qn.includes("0 événement");
    const excludeWeekend = qn.includes("hors week") || qn.includes("en semaine") || qn.includes("pas le week") || qn.includes("sans week");
    const excludeHolidays = qn.includes("hors ferie") || qn.includes("hors férié") || qn.includes("pas ferie") || qn.includes("pas férié") || qn.includes("sans ferie") || qn.includes("sans férié");
    const excludeSchoolHolidays = qn.includes("hors vacances") || qn.includes("pas vacances") || qn.includes("sans vacances");
    const impliedFilter = wantsWeather || wantsCompetition || wantsCalendar || excludeWeekend || excludeHolidays || excludeSchoolHolidays || negPluie || negVent || negAlerte || lowCompetition;
    const activeWeather = wantsWeather || negPluie || negVent || negAlerte || (!impliedFilter ? true : false);
    const activeComp = wantsCompetition || lowCompetition || (!impliedFilter ? true : false);
    const activeCal = wantsCalendar || excludeWeekend || excludeHolidays || excludeSchoolHolidays || (!impliedFilter ? true : false);
    const THRESHOLDS = {
      precipProbMaxPct_noRain: 0,
      // “sans pluie” => prob max = 0
      windMax_kmh_lowWind: 15,
      // “peu de vent” => wind max <= 15 km/h
      alertLevel_noAlert: 0,
      // “sans alerte” => alert level <= 0
      comp10km_low: 0
      // “sans concurrence” => events_within_10km_count <= 0
    };
    const toNum2 = (v) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    };
    const toBool = (v) => toBoolOrNullLocal(v);
    const keep = (r) => {
      if (activeWeather) {
        const alert = toNum2(r?.weather_alert_level);
        const pr = toNum2(r?.precip_probability_max_pct);
        const wi = toNum2(r?.wind_speed_10m_max);
        if (negAlerte) {
          if (!Number.isFinite(alert)) return false;
          if (alert > THRESHOLDS.alertLevel_noAlert) return false;
        }
        if (negPluie) {
          if (!Number.isFinite(pr)) return false;
          if (pr > THRESHOLDS.precipProbMaxPct_noRain) return false;
        }
        if (negVent) {
          if (!Number.isFinite(wi)) return false;
          if (wi > THRESHOLDS.windMax_kmh_lowWind) return false;
        }
      }
      if (activeComp) {
        if (lowCompetition) {
          const c10 = toNum2(r?.events_within_10km_count);
          if (!Number.isFinite(c10)) return false;
          if (c10 > THRESHOLDS.comp10km_low) return false;
        }
      }
      if (activeCal) {
        const wk = toBool(r?.is_weekend);
        const ph = toBool(r?.is_public_holiday_fr_flag);
        const sc = toBool(r?.is_school_holiday_flag);
        if (excludeWeekend) {
          if (wk === null) return false;
          if (wk === true) return false;
        }
        if (excludeHolidays) {
          if (ph === null) return false;
          if (ph === true) return false;
        }
        if (excludeSchoolHolidays) {
          if (sc === null) return false;
          if (sc === true) return false;
        }
      }
      return true;
    };
    const kept = days.filter(keep);
    const top3 = kept.slice(0, 3).map((r) => fmtDateFr(ymdFromAnyDateLocal(r?.date))).filter(Boolean);
    const criteria = [];
    if (negPluie) criteria.push("sans pluie");
    if (negVent) criteria.push("peu de vent");
    if (negAlerte) criteria.push("sans alerte météo");
    if (lowCompetition) criteria.push("faible concurrence");
    if (excludeWeekend) criteria.push("hors week-end");
    if (excludeHolidays) criteria.push("hors jours fériés");
    if (excludeSchoolHolidays) criteria.push("hors vacances scolaires");
    if (criteria.length === 0) {
      if (activeWeather) criteria.push("météo");
      if (activeComp) criteria.push("concurrence");
      if (activeCal) criteria.push("calendrier");
    }
    const headline = "Jours correspondant à vos critères";
    const summary = kept.length === 0 ? `Je ne trouve aucun jour correspondant (${criteria.join(", ")}) sur la période analysée.` : `J’ai trouvé ${kept.length} jour(s) correspondant (${criteria.join(", ")}). Exemples : ${top3.join(", ")}.`;
    const key_facts = [];
    key_facts.push(`Critères: ${criteria.join(", ")}.`);
    key_facts.push(`Période analysée: ${days.length} jour(s) disponibles côté truth.`);
    key_facts.push(
      `Seuils v1: pluie=${THRESHOLDS.precipProbMaxPct_noRain}% ; vent≤${THRESHOLDS.windMax_kmh_lowWind} km/h ; alerte≤${THRESHOLDS.alertLevel_noAlert} ; concurrence(≤10km)≤${THRESHOLDS.comp10km_low}.`
    );
    const caveat = "Filtrage v1 strict: si un champ est ND (null/absent) sur un critère demandé, le jour est exclu (comportement déterministe).";
    return { headline, summary, key_facts: key_facts.slice(0, 4), caveat };
  }
  function windowPatternsDeterministic(args) {
    const days = Array.isArray(args.month_days) ? args.month_days : [];
    const sorted = [...days].sort((a, b) => {
      const da = ymdFromAnyDateLocal(a?.date);
      const db = ymdFromAnyDateLocal(b?.date);
      return da.localeCompare(db);
    });
    let best = null;
    let curStart = null;
    let curEnd = null;
    let curLen = 0;
    const isSolid = (r) => {
      const reg = String(r?.opportunity_regime ?? "").trim().toUpperCase();
      return reg === "A" || reg === "B";
    };
    for (const r of sorted) {
      const d = ymdFromAnyDateLocal(r?.date);
      if (!d || d === "(date inconnue)") continue;
      if (isSolid(r)) {
        if (curLen === 0) curStart = d;
        curEnd = d;
        curLen += 1;
      } else {
        if (curLen > 0 && curStart && curEnd) {
          const cand = { start: curStart, end: curEnd, len: curLen };
          if (!best || cand.len > best.len) best = cand;
        }
        curStart = null;
        curEnd = null;
        curLen = 0;
      }
    }
    if (curLen > 0 && curStart && curEnd) {
      const cand = { start: curStart, end: curEnd, len: curLen };
      if (!best || cand.len > best.len) best = cand;
    }
    const nAlert = sorted.filter((r) => {
      const a = toNumLocal(r?.weather_alert_level);
      return Number.isFinite(a) && a >= 1;
    }).length;
    const nComp = sorted.filter((r) => {
      const c10 = toNumLocal(r?.events_within_10km_count);
      return Number.isFinite(c10) && c10 > 0;
    }).length;
    const headline = "Tendances sur la période";
    if (!best) {
      return {
        headline,
        summary: "Je ne détecte pas de séquence continue de jours A/B sur la période analysée.",
        key_facts: [
          `Période analysée: ${sorted.length} jour(s).`,
          `Alertes météo (≥1): ${nAlert} jour(s).`,
          `Concurrence (≤10km >0): ${nComp} jour(s).`
        ],
        caveat: "Lecture déterministe: basée uniquement sur les champs truth disponibles (régime, alerte météo, concurrence)."
      };
    }
    const startFr = fmtDateFr(best.start);
    const endFr = fmtDateFr(best.end);
    const span = best.start === best.end ? `${startFr}` : `${startFr} → ${endFr}`;
    return {
      headline,
      summary: `Meilleure séquence continue A/B détectée: ${best.len} jour(s) (${span}).`,
      key_facts: [
        `Séquence A/B: ${span} (${best.len} jour(s)).`,
        `Alertes météo (≥1): ${nAlert} jour(s) sur ${sorted.length}.`,
        `Concurrence (≤10km >0): ${nComp} jour(s) sur ${sorted.length}.`
      ],
      caveat: "Lecture déterministe: ne déduit pas de causes; décrit seulement les motifs observables dans les champs truth."
    };
  }
  function driverPrimaryDeterministic(args) {
    const s = args.decision_payload.kind === "scoring" ? args.decision_payload.signals : {};
    const cands = [];
    if (s.weather) cands.push({ k: "weather", impact: s.weather.impact, explanation: s.weather.explanation });
    if (s.competition) cands.push({ k: "competition", impact: s.competition.impact, explanation: s.competition.explanation });
    if (s.calendar) cands.push({ k: "calendar", impact: s.calendar.impact, explanation: s.calendar.explanation });
    const impactRank = (i) => i === "blocking" ? 0 : i === "risk" ? 1 : 2;
    cands.sort((a, b) => impactRank(a.impact) - impactRank(b.impact));
    const best = cands[0];
    const label = (k) => k === "weather" ? "Météo" : k === "competition" ? "Concurrence" : k === "calendar" ? "Calendrier" : k;
    const headline = "Facteur principal";
    if (!best) {
      return {
        headline,
        summary: "Je ne peux pas isoler un facteur principal: aucun signal calculable avec les champs truth disponibles.",
        key_facts: [],
        caveat: "Ajoutez un critère explicite (météo / concurrence / calendrier) ou vérifiez la couverture des champs."
      };
    }
    const summary = `${label(String(best.k))} ressort comme facteur principal (${best.impact}).`;
    const key_facts = [best.explanation];
    const caveat = "Facteur principal déterminé uniquement à partir des signaux truth calculables (blocking > risk > neutral).";
    return { headline, summary, key_facts, caveat };
  }
  try {
    let safeYmd10 = function(s) {
      if (typeof s !== "string") return null;
      const x = s.trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
    }, threadUsedDates = function(ctx) {
      const u = ctx?.last?.used_dates;
      if (!Array.isArray(u)) return [];
      const out = u.map((d) => safeYmd10(d)).filter((d) => !!d);
      return out.slice(0, 7);
    }, threadTopDates = function(ctx) {
      const t = ctx?.last?.top_dates;
      if (!Array.isArray(t)) return [];
      const out = t.map((x) => safeYmd10(x?.date)).filter((d) => !!d);
      return out.slice(0, 7);
    }, inferSelectedDateFromMonthMention = function(qRaw2) {
      const qn2 = norm(qRaw2);
      const months = {
        // FR
        "janvier": 1,
        "fevrier": 2,
        "février": 2,
        "mars": 3,
        "avril": 4,
        "mai": 5,
        "juin": 6,
        "juillet": 7,
        "aout": 8,
        "août": 8,
        "septembre": 9,
        "octobre": 10,
        "novembre": 11,
        "decembre": 12,
        "décembre": 12,
        // EN
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12
      };
      let m = null;
      for (const k of Object.keys(months)) {
        if (qn2.includes(k)) {
          m = months[k];
          break;
        }
      }
      if (!m) return null;
      const ym = qRaw2.match(/\b(20\d{2})\b/);
      const explicitYear = ym ? Number(ym[1]) : null;
      const now = /* @__PURE__ */ new Date();
      const yNow = now.getUTCFullYear();
      const mNow = now.getUTCMonth() + 1;
      const y = explicitYear ?? (m < mNow ? yNow + 1 : yNow);
      return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    }, bqParams = function(p) {
      return Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== null && v !== void 0)
      );
    }, buildMonthRedirectUrl = function(opts) {
      const u = new URL("/app/insightevent/month", request.url);
      u.searchParams.set("focus", opts.focus ?? "shortlist");
      u.searchParams.set("from_prompt", String(opts.from_prompt ?? true));
      u.searchParams.set("selected_date", opts.window_start_date);
      u.searchParams.set("anchor_date", opts.window_start_date);
      if (Array.isArray(opts.preselect_dates) && opts.preselect_dates.length) {
        u.searchParams.set("preselect_dates", opts.preselect_dates.slice(0, 7).join(","));
      }
      return u.pathname + u.search;
    }, parseDimList = function(v) {
      if (typeof v !== "string") return [];
      return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => s.toUpperCase());
    }, buildPolicy = function(rows) {
      const r = Array.isArray(rows) ? rows : [];
      const baseRow = r.find((x) => String(x?.rule_key ?? "") === "location_type");
      const base = parseDimList(baseRow?.base_priority_dimensions);
      const baseDefault = ["SCORE", "CALENDAR", "STABILITY", "WEATHER", "NEARBY_EVENTS", "TOURISM", "DRIVER"];
      const baseFinal = base.length > 0 ? base : baseDefault;
      const boosts = [];
      for (const x of r) {
        if (String(x?.rule_key ?? "") === "location_type") continue;
        const b = parseDimList(x?.boost_priority_dimensions);
        for (const t of b) boosts.push(t);
      }
      const seen = /* @__PURE__ */ new Set();
      const priority_dimensions = [];
      for (const t of boosts) {
        if (!seen.has(t)) {
          seen.add(t);
          priority_dimensions.push(t);
        }
      }
      for (const t of baseFinal) {
        if (!seen.has(t)) {
          seen.add(t);
          priority_dimensions.push(t);
        }
      }
      const auto_constraints = /* @__PURE__ */ new Set();
      for (const x of r) {
        const c = typeof x?.auto_constraints === "string" ? x.auto_constraints.trim() : "";
        if (c) auto_constraints.add(c);
      }
      return { priority_dimensions, auto_constraints };
    }, toNum2 = function(v) {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    }, ymdFromAnyDate2 = function(v) {
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
      if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
      if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
      return "(date inconnue)";
    }, clampFallbackWindow = function(bestYmd, winStart, winEnd) {
      const start = bestYmd < winStart ? winStart : bestYmd;
      const rawEnd = addDaysYmd(bestYmd, 4);
      const end = rawEnd > winEnd ? winEnd : rawEnd;
      return { start, end };
    }, deriveCompetitionScope = function(r) {
      const c5 = toNum2(r?.events_within_5km_count);
      const c10 = toNum2(r?.events_within_10km_count);
      const c50 = toNum2(r?.events_within_50km_count);
      const has5 = Number.isFinite(c5) && c5 > 0;
      const has10 = Number.isFinite(c10) && c10 > 0;
      const has50 = Number.isFinite(c50) && c50 > 0;
      if (has5) return "local";
      if (has10) return "local";
      if (has50) return "regional";
      return "none";
    }, deriveCompetitionExplain = function(r) {
      const c5 = toNum2(r?.events_within_5km_count);
      const c10 = toNum2(r?.events_within_10km_count);
      const c50 = toNum2(r?.events_within_50km_count);
      const c5Txt = Number.isFinite(c5) ? String(Math.round(c5)) : "ND";
      const c10Txt = Number.isFinite(c10) ? String(Math.round(c10)) : "ND";
      const c50Txt = Number.isFinite(c50) ? String(Math.round(c50)) : "ND";
      const scope = deriveCompetitionScope(r);
      if (scope === "none") {
        return "Concurrence: aucune pression détectée (≤10/50km à 0 ou ND).";
      }
      if (scope === "local") {
        return `Concurrence directe: ${c5Txt} évts ≤5km | ${c10Txt} évts ≤10km | ${c50Txt} évts ≤50km.`;
      }
      return `Concurrence régionale: 0 à ≤10km; ${c50Txt} évts ≤50km.`;
    }, rankNonDiscriminativeRows = function(candidateRows, policy, limit) {
      const rows = Array.isArray(candidateRows) ? candidateRows : [];
      const lim = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 3;
      const constraints = policy.auto_constraints;
      const filtered = rows.filter((r) => {
        const ph = toBoolOrNullLocal(r?.is_public_holiday_fr_flag);
        const wk = toBoolOrNullLocal(r?.is_weekend);
        const sc = toBoolOrNullLocal(r?.is_school_holiday_flag);
        const ce = toBoolOrNullLocal(r?.is_commercial_event_flag);
        if (constraints.has("exclude_public_holidays") && ph === true) {
          return false;
        }
        if (constraints.has("filter_weekend_only") && wk !== true) {
          return false;
        }
        if (constraints.has("filter_school_holidays_only") && sc !== true) {
          return false;
        }
        if (constraints.has("exclude_dates_with_weather_alert")) {
          const wx = toNum2(r?.weather_alert_level);
          if (Number.isFinite(wx) && wx >= 1) return false;
        }
        if (constraints.has("exclude_commercial_events") && ce === true) {
          return false;
        }
        return true;
      });
      const pool = filtered.length >= lim ? filtered : rows;
      const boolRank = (v) => v === null ? 2 : v ? 1 : 0;
      const dims = policy.priority_dimensions.filter((d) => SUPPORTED_DIMS.has(d));
      function cmp(a, b) {
        for (const d of dims) {
          if (d === "WEATHER") {
            const aAlert2 = toNum2(a?.weather_alert_level);
            const bAlert2 = toNum2(b?.weather_alert_level);
            const aOk = Number.isFinite(aAlert2);
            const bOk = Number.isFinite(bAlert2);
            if (aOk !== bOk) return aOk ? -1 : 1;
            if (aOk && bOk && aAlert2 !== bAlert2) return aAlert2 - bAlert2;
            const aP = toNum2(a?.precip_probability_max_pct);
            const bP = toNum2(b?.precip_probability_max_pct);
            const aPOk = Number.isFinite(aP);
            const bPOk = Number.isFinite(bP);
            if (aPOk !== bPOk) return aPOk ? -1 : 1;
            if (aPOk && bPOk && aP !== bP) return aP - bP;
            const aW = toNum2(a?.wind_speed_10m_max);
            const bW = toNum2(b?.wind_speed_10m_max);
            const aWOk = Number.isFinite(aW);
            const bWOk = Number.isFinite(bW);
            if (aWOk !== bWOk) return aWOk ? -1 : 1;
            if (aWOk && bWOk && aW !== bW) return aW - bW;
          }
          if (d === "NEARBY_EVENTS") {
            const a5 = toNum2(a?.events_within_5km_count);
            const b5 = toNum2(b?.events_within_5km_count);
            const a5Ok = Number.isFinite(a5);
            const b5Ok = Number.isFinite(b5);
            if (a5Ok !== b5Ok) return a5Ok ? -1 : 1;
            if (a5Ok && b5Ok && a5 !== b5) return a5 - b5;
            const a10 = toNum2(a?.events_within_10km_count);
            const b10 = toNum2(b?.events_within_10km_count);
            const a10Ok = Number.isFinite(a10);
            const b10Ok = Number.isFinite(b10);
            if (a10Ok !== b10Ok) return a10Ok ? -1 : 1;
            if (a10Ok && b10Ok && a10 !== b10) return a10 - b10;
            const a50 = toNum2(a?.events_within_50km_count);
            const b50 = toNum2(b?.events_within_50km_count);
            const a50Ok = Number.isFinite(a50);
            const b50Ok = Number.isFinite(b50);
            if (a50Ok !== b50Ok) return a50Ok ? -1 : 1;
            if (a50Ok && b50Ok && a50 !== b50) return a50 - b50;
          }
          if (d === "CALENDAR") {
            const aWeekend = toBoolOrNullLocal(a?.is_weekend);
            const bWeekend = toBoolOrNullLocal(b?.is_weekend);
            const aHol = toBoolOrNullLocal(a?.is_public_holiday_fr_flag);
            const bHol = toBoolOrNullLocal(b?.is_public_holiday_fr_flag);
            const aSch = toBoolOrNullLocal(a?.is_school_holiday_flag);
            const bSch = toBoolOrNullLocal(b?.is_school_holiday_flag);
            const aCe = toBoolOrNullLocal(a?.is_commercial_event_flag);
            const bCe = toBoolOrNullLocal(b?.is_commercial_event_flag);
            const rank = (v) => v === false ? 0 : v === null ? 1 : 2;
            const rw = rank(aWeekend) - rank(bWeekend);
            if (rw !== 0) return rw;
            const rh = rank(aHol) - rank(bHol);
            if (rh !== 0) return rh;
            const rs = rank(aSch) - rank(bSch);
            if (rs !== 0) return rs;
            const rce = rank(aCe) - rank(bCe);
            if (rce !== 0) return rce;
          }
        }
        const aAlert = toNum2(a?.weather_alert_level);
        const bAlert = toNum2(b?.weather_alert_level);
        if (Number.isFinite(aAlert) && Number.isFinite(bAlert) && aAlert !== bAlert) return aAlert - bAlert;
        const aC = toNum2(a?.events_within_10km_count);
        const bC = toNum2(b?.events_within_10km_count);
        if (Number.isFinite(aC) && Number.isFinite(bC) && aC !== bC) return aC - bC;
        return ymdFromAnyDate2(a?.date).localeCompare(ymdFromAnyDate2(b?.date));
      }
      const sorted = [...pool].sort(cmp).slice(0, lim);
      return sorted.map((r) => {
        const wx = Number.isFinite(toNum2(r?.weather_alert_level)) ? String(toNum2(r?.weather_alert_level)) : "ND";
        const pr = Number.isFinite(toNum2(r?.precip_probability_max_pct)) ? String(toNum2(r?.precip_probability_max_pct)) : "ND";
        const wi = Number.isFinite(toNum2(r?.wind_speed_10m_max)) ? String(toNum2(r?.wind_speed_10m_max)) : "ND";
        const reasons = [];
        if (policy.priority_dimensions.includes("WEATHER")) {
          reasons.push(`météo: alerte ${wx}, pluie ${pr}%, vent ${wi}`);
        }
        if (policy.priority_dimensions.includes("NEARBY_EVENTS")) {
          reasons.push(deriveCompetitionExplain(r));
        }
        if (policy.priority_dimensions.includes("CALENDAR")) {
          const wk = toBoolOrNullLocal(r?.is_weekend);
          const ph = toBoolOrNullLocal(r?.is_public_holiday_fr_flag);
          const sc = toBoolOrNullLocal(r?.is_school_holiday_flag);
          const ce = toBoolOrNullLocal(r?.is_commercial_event_flag);
          const yn = (v) => v === null ? "ND" : v ? "oui" : "non";
          reasons.push(
            `calendrier: week-end=${yn(wk)}, férié=${yn(ph)}, vacances=${yn(sc)}, évènement commercial=${yn(ce)}`
          );
        }
        return { row: r, reasons };
      });
    }, buildDeterministicReasons = function(args) {
      const reasons = [];
      const s = args.signals ?? {};
      if (args.horizon === "month" && args.intent === "WINDOW_WORST_DAYS") {
        const label = typeof args.month_window?.display_label === "string" ? args.month_window.display_label : "les 30 prochains jours";
        reasons.push(
          `Analyse basée sur ${label}. En l’absence de précision contraire, cette réponse concerne ce lieu sur la période à venir.`
        );
      }
      if (args.horizon === "month" && args.intent === "WINDOW_TOP_DAYS") {
        if (Array.isArray(args.top_dates) && args.top_dates.length) {
          const k = Math.max(1, Math.min(7, args.top_dates.length));
          const lines = args.top_dates.slice(0, k).map((d, i) => `#${i + 1} ${d.date}: score ${d.score ?? "ND"}, régime ${d.regime ?? "ND"}`);
          reasons.push(`Shortlist (top ${k}): ${lines.join(" | ")}`);
        }
      }
      const convoAlreadyCoversSignals = args.horizon === "month" && (args.intent === "WINDOW_TOP_DAYS" || args.intent === "WINDOW_WORST_DAYS");
      if (!convoAlreadyCoversSignals) {
        if (s.weather) reasons.push(s.weather.explanation);
        if (s.competition) reasons.push(s.competition.explanation);
        if (s.calendar) reasons.push(s.calendar.explanation);
      }
      if (args.horizon === "month" && args.intent === "WINDOW_TOP_DAYS") {
        const kt = typeof args.month_window?.key_takeaway === "string" ? args.month_window.key_takeaway.trim() : "";
        if (kt) reasons.push(kt);
      }
      return reasons;
    }, signalRulesFr = function(signals) {
      const rules = [];
      const s = signals ?? {};
      if (s.weather) {
        rules.push(
          "Règle météo v1 (truth): alerte météo ≥ 3 ⇒ impact 'blocking'; sinon pluie/vent non nuls ⇒ impact 'risk' si lieu non confirmé intérieur."
        );
      }
      if (s.competition) {
        rules.push(
          "Règle concurrence v1 (truth): si un compteur d’événements > 0 (≤5/10/50 km) ⇒ impact 'risk'; sinon 'neutral'."
        );
      }
      if (s.calendar) {
        rules.push(
          "Règle calendrier v1 (truth): si au moins un flag est true (week-end/férié/vacances/promo) ⇒ impact 'risk'; sinon 'neutral'."
        );
      }
      return rules.slice(0, 3);
    };
    const body = await request.json().catch(() => null);
    const qRaw = requireString(body?.q, "body.q");
    const q = norm(qRaw);
    const top_k = resolveTopKFromText(qRaw);
    const l = locals;
    const bypass = DEV_BYPASS_PROMPT === true;
    const clerk_user_id = bypass ? typeof l.clerk_user_id === "string" ? l.clerk_user_id.trim() : null : requireString(l.clerk_user_id, "locals.clerk_user_id");
    const location_id = bypass ? requireString(body?.thread_context?.location_id, "thread_context.location_id") : requireString(l.location_id, "locals.location_id");
    const thread_context = body?.thread_context && typeof body.thread_context === "object" ? body.thread_context : null;
    const inferred_selected_date = inferSelectedDateFromMonthMention(q);
    const selected_date = typeof body?.selected_date === "string" && body.selected_date.trim() ? body.selected_date.trim().slice(0, 10) : inferred_selected_date ?? safeYmd10(thread_context?.last?.selected_date) ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const date = typeof body?.date === "string" && body.date.trim() ? body.date.trim() : null;
    const dates = Array.isArray(body?.dates) && body.dates.length > 0 ? body.dates.map((d) => String(d)).filter((d) => d.trim()) : [];
    if (dates.length > 7) {
      throw new Error("dates[] too large (max 7)");
    }
    const dateMentions = extractDateMentions(qRaw, selected_date.slice(0, 10));
    const extracted_dates = dateMentions.dates;
    const thread_used_dates = threadUsedDates(thread_context);
    const thread_top_dates = threadTopDates(thread_context);
    const effective_dates = Array.isArray(dates) && dates.length > 0 ? dates.map((d) => String(d).trim()).filter(Boolean).map((d) => d.slice(0, 10)) : extracted_dates.length > 0 ? extracted_dates : thread_used_dates;
    const force_compare = Array.isArray(dates) && dates.length >= 2 || Array.isArray(extracted_dates) && extracted_dates.length >= 2;
    let resolved_horizon = force_compare ? "selected_days" : resolveHorizonFromText(qRaw);
    let resolved_intent = force_compare ? "COMPARE_DATES" : resolveIntentFromText(qRaw, resolved_horizon);
    if (!force_compare && extracted_dates.length === 1) {
      resolved_horizon = "day";
      resolved_intent = resolveIntentFromText(qRaw, "day");
    }
    if (dateMentions.hasDateToken && dateMentions.dates.length === 0) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
    }
    if (isEventLookupQuestion(q)) {
      resolved_horizon = "lookup_event";
      resolved_intent = "LOOKUP_EVENT";
    }
    const qn = norm(q);
    const yearHit = qn.match(/\b(20\d{2})\b/);
    const defaultYearFromQuery = yearHit ? Number(yearHit[1]) : null;
    const hasExplicitAnyDate = dateMentions.hasDateToken || Array.isArray(dates) && dates.length > 0 || typeof date === "string" && date.trim().length > 0;
    const refersToRank1 = qn.includes("#1") || qn.includes("1er") || qn.includes("premier") || qn.includes("meilleur") || qn.includes("top 1");
    const refersToTop2 = qn.includes("top 2") || qn.includes("les 2") || qn.includes("deux premiers");
    const asksWhy = qn.includes("pourquoi") || qn.includes("qu est ce qui") || qn.includes("qu'est-ce qui") || qn.includes("explique");
    const asksCompare = qn.includes("compar") || qn.includes("difference") || qn.includes("différence") || qn.includes("entre");
    const asksNextDay = qn.includes("lendemain") || qn.includes("jour apres") || qn.includes("jour après") || qn.includes("suivant");
    if (!hasExplicitAnyDate && asksWhy && refersToRank1 && thread_top_dates.length >= 1) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
    }
    if (!hasExplicitAnyDate && asksCompare && refersToTop2 && thread_top_dates.length >= 2) {
      resolved_horizon = "selected_days";
      resolved_intent = "COMPARE_DATES";
    }
    if (!hasExplicitAnyDate && asksNextDay && thread_used_dates.length >= 1) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
    }
    const override_day_date = !hasExplicitAnyDate && asksWhy && refersToRank1 && thread_top_dates.length >= 1 ? thread_top_dates[0] : !hasExplicitAnyDate && asksNextDay && thread_used_dates.length >= 1 ? (() => {
      const base = thread_used_dates[0];
      return addDaysYmd(base, 1);
    })() : null;
    const override_compare_dates = !hasExplicitAnyDate && asksCompare && refersToTop2 && thread_top_dates.length >= 2 ? thread_top_dates.slice(0, 2) : [];
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const semanticProjectId = typeof process.env.BQ_SEMANTIC_PROJECT_ID === "string" && process.env.BQ_SEMANTIC_PROJECT_ID.trim() ? process.env.BQ_SEMANTIC_PROJECT_ID.trim() : projectId;
    const bigquery = new BigQuery({
      projectId
      // Production-safe:
      // - In local/dev: GOOGLE_APPLICATION_CREDENTIALS can be set (ADC will pick it up)
      // - In prod: Workload Identity / default ADC works without a key file
    });
    async function bqOne(query, params) {
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params
      });
      return rows && rows.length > 0 ? rows[0] : null;
    }
    async function bqAll(query, params) {
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params
      });
      return rows ?? [];
    }
    async function bqShortlist(params) {
      const hard_only = params.hard_only === false ? false : true;
      const limitRaw = Number(params.limit ?? 7);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(7, Math.floor(limitRaw))) : 7;
      const query = `
        WITH win AS (
          SELECT
            DATE(@window_start_date) AS window_start_date,
            DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
        ),
        base AS (
          SELECT
            date,
            location_id,
            opportunity_score_final_local,
            opportunity_medal,
            opportunity_regime,
            weather_code,
            weather_alert_level,
            precipitation_probability_max_pct AS precip_probability_max_pct,
            wind_speed_10m_max,
            events_within_5km_count,
            events_within_10km_count,
            events_within_50km_count,
            is_public_holiday_fr_flag,
            is_school_holiday_flag,
            is_weekend,
            commercial_events,
            is_commercial_event_flag,
            is_selected_day,
            available_next_views,
            relative_rank_bucket
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
        ),
        filtered AS (
          SELECT *
          FROM base
          WHERE
            @hard_only = FALSE
            OR (
              -- hard exclusions (v1)
              COALESCE(opportunity_regime, '') != 'C'
              AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
            )
        ),
        dedup AS (
          -- One row per (location_id, date). Pick the "best" candidate deterministically.
          SELECT *
          FROM filtered
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id, date
            ORDER BY
              opportunity_score_final_local DESC,
              CAST(weather_alert_level AS INT64) ASC NULLS LAST,
              events_within_10km_count ASC NULLS LAST
          ) = 1
        )
        SELECT *
        FROM dedup
        ORDER BY
          opportunity_score_final_local DESC,
          CAST(weather_alert_level AS INT64) ASC NULLS LAST,
          CAST(precip_probability_max_pct AS FLOAT64) ASC NULLS LAST,
          CAST(wind_speed_10m_max AS FLOAT64) ASC NULLS LAST,
          CAST(events_within_5km_count AS INT64) ASC NULLS LAST,
          CAST(events_within_10km_count AS INT64) ASC NULLS LAST,
          CAST(events_within_50km_count AS INT64) ASC NULLS LAST,
          date ASC
        LIMIT @limit
      `;
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params: {
          location_id: params.location_id,
          window_start_date: params.window_start_date,
          hard_only,
          limit
        }
      });
      return rows ?? [];
    }
    async function bqWorstlist(params) {
      const hard_only = params.hard_only === true ? true : false;
      const limitRaw = Number(params.limit ?? 7);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(7, Math.floor(limitRaw))) : 7;
      const query = `
        WITH win AS (
          SELECT
            DATE(@window_start_date) AS window_start_date,
            DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
        ),
        base AS (
          SELECT
            date,
            location_id,
            opportunity_score_final_local,
            opportunity_medal,
            opportunity_regime,
            weather_code,
            weather_alert_level,
            precipitation_probability_max_pct AS precip_probability_max_pct,
            wind_speed_10m_max,
            events_within_5km_count,
            events_within_10km_count,
            events_within_50km_count,
            is_public_holiday_fr_flag,
            is_school_holiday_flag,
            is_weekend,
            commercial_events,
            is_commercial_event_flag,
            is_selected_day,
            available_next_views,
            relative_rank_bucket
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
        ),
        filtered AS (
          SELECT *
          FROM base
          WHERE
            @hard_only = FALSE
            OR (
              COALESCE(opportunity_regime, '') != 'C'
              AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
            )
        ),
        dedup AS (
          SELECT *
          FROM filtered
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id, date
            ORDER BY
              opportunity_score_final_local ASC,
              CAST(weather_alert_level AS INT64) DESC NULLS LAST,
              events_within_10km_count DESC NULLS LAST
          ) = 1
        )
        SELECT *
        FROM dedup
        ORDER BY opportunity_score_final_local ASC, date ASC
        LIMIT @limit
      `;
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params: {
          location_id: params.location_id,
          window_start_date: params.window_start_date,
          hard_only,
          limit
        }
      });
      return rows ?? [];
    }
    const internal_context = await bqOne(
      `
      SELECT *
      FROM \`${semanticProjectId}.semantic.vw_insight_event_ai_location_context\`
      WHERE location_id = @location_id
      LIMIT 1
      `,
      { location_id }
    );
    if (!internal_context) {
      throw new Error(
        `Missing semantic internal context: vw_insight_event_ai_location_context for location_id=${location_id}`
      );
    }
    const rule_values = [
      String(internal_context.location_type ?? ""),
      String(internal_context.event_time_profile ?? ""),
      String(internal_context.primary_audience_1 ?? ""),
      String(internal_context.primary_audience_2 ?? "")
    ].filter((v) => v && v.trim().length > 0);
    const decision_policy_rules = rule_values.length === 0 ? [] : await bqAll(
      `
            SELECT
              rule_key,
              rule_value,
              base_priority_dimensions,
              boost_priority_dimensions,
              blocker_focus,
              auto_constraints,
              rule_version
            FROM \`${semanticProjectId}.semantic.vw_ms_insight_ai_decision_policy_rules\`
            WHERE rule_value IN UNNEST(@rule_values)
            `,
      { rule_values }
    );
    let month_window = null;
    let month_days = [];
    let day_row = null;
    let selected_days_rows = [];
    let selected_query_dates = [];
    let shortlist = [];
    let worstlist = [];
    let month_redirect_url = null;
    let month_ws = null;
    let shortlist_rows = [];
    let worstlist_rows = [];
    let ai = null;
    let lookup_hit = null;
    let lookup_mode = null;
    let lookup_sql_used = null;
    let window_aggregates_v3 = null;
    let ui_packaging_v3 = null;
    let producer = "deterministic";
    switch (resolved_horizon) {
      case "month": {
        month_window = await bqOne(
          `
          WITH win AS (
            SELECT
              COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
              DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_window_surface\`
          WHERE location_id = @location_id
            AND window_start_date = (SELECT window_start_date FROM win)
          LIMIT 1
          `,
          bqParams({ location_id, selected_date })
        );
        if (!month_window) {
          month_window = await bqOne(
            `
            WITH win AS (
              SELECT
                COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
                DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
            ),
            base AS (
              SELECT *
              FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
              WHERE location_id = @location_id
                AND date BETWEEN (SELECT window_start_date FROM win)
                             AND (SELECT window_end_date   FROM win)
            )
            SELECT
              ANY_VALUE(semantic_contract_version) AS semantic_contract_version,
              'month' AS display_horizon,
              CONCAT(
                'Fenêtre 30 jours: ',
                FORMAT_DATE('%d/%m/%Y', (SELECT window_start_date FROM win)),
                ' → ',
                FORMAT_DATE('%d/%m/%Y', (SELECT window_end_date FROM win))
              ) AS display_label,
              'navigation_summary' AS ai_analysis_scope_guard,
              CAST(NULL AS STRING) AS key_takeaway,
              @location_id AS location_id,
              (SELECT window_start_date FROM win) AS window_start_date,
              (SELECT window_end_date   FROM win) AS window_end_date,
              COUNT(*) AS days_count,
              COUNTIF(opportunity_regime = 'A') AS days_a,
              COUNTIF(opportunity_regime = 'B') AS days_b,
              COUNTIF(opportunity_regime = 'C') AS days_c,
              COUNTIF(relative_rank_bucket = 'risk') AS days_risk,
              COUNTIF(relative_rank_bucket = 'top')  AS days_top_bucket,
              MIN(opportunity_score_final_local) AS score_min,
              MAX(opportunity_score_final_local) AS score_max,
              COUNTIF(weather_code IS NULL) AS days_missing_weather,
              ARRAY_AGG(
                STRUCT(
                  date,
                  opportunity_regime,
                  opportunity_score_final_local,
                  opportunity_medal,
                  weather_code
                )
                ORDER BY best_day_rank_excl_forced_c ASC, date ASC
                LIMIT 3
              ) AS top_days
            FROM base
            `,
            bqParams({ location_id, selected_date })
          );
        }
        if (!month_window?.window_start_date) {
          ai = {
            ok: false,
            mode: "company_centered",
            output: null,
            errors: ["month_window is null (no window row found)"],
            warnings: [],
            raw_text: ""
          };
          break;
        }
        const ws = ymdFromBqDate(month_window.window_start_date);
        month_ws = ws;
        if (!ws) {
          throw new Error("Invalid month_window.window_start_date (cannot normalize to YYYY-MM-DD)");
        }
        const monthConstraintYmd = inferSelectedDateFromMonthMention(q);
        const monthConstraintYm = monthConstraintYmd ? monthConstraintYmd.slice(0, 7) : null;
        shortlist = await bqAll(
          `
          WITH win AS (
            SELECT
              DATE(@window_start_date) AS window_start_date,
              DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
            AND (
              @month_constraint_ym = ""
              OR FORMAT_DATE('%Y-%m', date) = @month_constraint_ym
            )
            AND COALESCE(opportunity_regime, '') != 'C'
            AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
          ORDER BY
            opportunity_score_final_local DESC,
            CAST(weather_alert_level AS INT64) ASC NULLS LAST,
            CAST(events_within_10km_count AS INT64) ASC NULLS LAST,
            date ASC
          LIMIT 7
          `,
          bqParams({
            location_id,
            window_start_date: ws,
            month_constraint_ym: monthConstraintYm ?? ""
          })
        );
        shortlist_rows = shortlist ?? [];
        if (resolved_intent === "WINDOW_WORST_DAYS") {
          worstlist = await bqWorstlist({
            location_id,
            window_start_date: ws,
            hard_only: false,
            limit: 7
          });
        }
        const shortlist0 = Array.isArray(shortlist) ? shortlist : [];
        const worstlist0 = Array.isArray(worstlist) ? worstlist : [];
        shortlist_rows = monthConstraintYm ? shortlist0.filter((r) => ymdFromAnyDate2(r?.date).slice(0, 7) === monthConstraintYm) : shortlist0;
        if (resolved_intent === "WINDOW_TOP_DAYS") {
          shortlist_rows = shortlist_rows.slice(0, top_k);
        }
        shortlist_rows = shortlist_rows.map((r) => {
          const weather = buildWeatherSignal(r, internal_context);
          const competition = buildCompetitionSignal(r);
          const calendar = buildCalendarSignal(r);
          const rank = (i) => i === "blocking" ? 3 : i === "risk" ? 2 : 1;
          const drivers = [
            { k: "weather", s: weather },
            { k: "competition", s: competition },
            { k: "calendar", s: calendar }
          ].filter((x) => x.s.applicable);
          const best = drivers.sort((a, b) => rank(b.s.impact) - rank(a.s.impact))[0];
          const confidence = best?.s.impact === "blocking" ? "high" : best?.s.impact === "risk" && Object.values(best.s.facts).filter((v) => v != null).length >= 2 ? "high" : best?.s.impact === "risk" ? "medium" : "low";
          return {
            ...r,
            v3_primary_driver: best?.k ?? null,
            v3_driver_impact: best?.s.impact ?? "neutral",
            v3_driver_confidence: confidence,
            v3_signals: { weather, competition, calendar }
          };
        });
        worstlist_rows = monthConstraintYm ? worstlist0.filter((r) => ymdFromAnyDate2(r?.date).slice(0, 7) === monthConstraintYm) : worstlist0;
        month_days = await bqAll(
          `
          WITH win AS (
            SELECT
              COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
              DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
            AND (
              @month_constraint_ym = ""
              OR FORMAT_DATE('%Y-%m', date) = @month_constraint_ym
            )
          ORDER BY date ASC
          `,
          bqParams({ location_id, selected_date, month_constraint_ym: monthConstraintYm ?? "" })
        );
        const preselect_dates_for_url = shortlist_rows.map((r) => ymdFromAnyDate2(r?.date)).slice(0, 7);
        month_redirect_url = buildMonthRedirectUrl({
          window_start_date: ws,
          focus: resolved_intent === "WINDOW_WORST_DAYS" ? "worstlist" : "shortlist",
          from_prompt: true,
          preselect_dates: preselect_dates_for_url
        });
        if (resolved_intent === "WINDOW_WORST_DAYS") {
          ai = {
            ok: true,
            mode: "month_pending_packaging",
            output: null,
            raw_text: "",
            errors: [],
            warnings: []
          };
          break;
        }
        if (resolved_intent === "WINDOW_PATTERNS") {
          const out = windowPatternsDeterministic({ month_days });
          ai = {
            ok: true,
            mode: "deterministic_window_patterns_v1",
            output: {
              headline: out.headline,
              summary: out.summary,
              key_facts: out.key_facts,
              caveat: out.caveat
            },
            raw_text: "",
            errors: [],
            warnings: []
          };
          break;
        }
        if (resolved_intent === "WINDOW_FILTER_DAYS") {
          const out = windowFilterDaysDeterministic({ q, month_days });
          ai = {
            ok: true,
            mode: "deterministic_window_filter_days_v1",
            output: { headline: out.headline, summary: out.summary, key_facts: out.key_facts, caveat: out.caveat },
            raw_text: "",
            errors: [],
            warnings: []
          };
          break;
        }
        if (resolved_intent === "DRIVER_PRIMARY") {
          const signals = buildDecisionSignals({
            q,
            intent: resolved_intent,
            horizon: resolved_horizon,
            internal_context,
            shortlist_rows,
            worstlist_rows,
            day_row,
            selected_days_rows
          });
          const local_decision_payload = {
            kind: "scoring",
            horizon: resolved_horizon,
            intent: resolved_intent,
            used_dates: shortlist_rows.map((r) => ymdFromAnyDate2(r?.date)).slice(0, 7),
            signals
          };
          const out = driverPrimaryDeterministic({ q, decision_payload: local_decision_payload });
          ai = {
            ok: true,
            mode: "deterministic_driver_primary_v1",
            output: { headline: out.headline, summary: out.summary, key_facts: out.key_facts, caveat: out.caveat },
            raw_text: "",
            errors: [],
            warnings: []
          };
          break;
        }
        ai = {
          ok: true,
          mode: "month_pending_packaging",
          output: null,
          raw_text: "",
          errors: [],
          warnings: []
        };
        break;
      }
      case "day": {
        const isDayLike = resolved_horizon === "day" || resolved_intent === "DAY_WHY" || resolved_intent === "DAY_DIMENSION_DETAIL";
        const dateFieldYmd = safeYmd10(date);
        const hasParsedDate = dateMentions.dates.length > 0 || !!dateFieldYmd;
        if (isDayLike) {
          if (dateMentions.unparsedDateToken && !hasParsedDate) {
            throw new Error(
              "Impossible d’identifier la date demandée. Écrivez-la au format JJ/MM/AAAA ou YYYY-MM-DD."
            );
          }
        }
        const effective_date = (override_day_date ?? dateFieldYmd ?? dateMentions.dates[0] ?? selected_date).slice(0, 10);
        day_row = await bqOne(
          `
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_day_surface\`
          WHERE location_id = @location_id
            AND date = DATE(@date)
          LIMIT 1
          `,
          bqParams({ location_id, date: effective_date })
        );
        const ir = renderDayWhyV1({
          date: effective_date,
          day_row,
          location_context: internal_context
        });
        if (!ir) {
          throw new Error("DAY_WHY: null IR");
        }
        const dayFactsByDate = adaptDayFactsByDate(ir);
        const dayLineItems = adaptDayLineItems(ir.line_items);
        assertNoSentenceWithoutFactIdV1(dayFactsByDate, dayLineItems);
        const render_lines = renderLineItemsFrV1({
          facts_by_date: dayFactsByDate,
          line_items: dayLineItems
        });
        const headline = render_lines.find((l2) => l2.kind === "headline")?.text_fr ?? "Pourquoi ce jour";
        const key_facts = render_lines.filter((l2) => l2.kind !== "headline").map((l2) => String(l2.text_fr ?? "").trim()).filter(Boolean);
        ai = {
          ok: true,
          mode: "deterministic_daywhy_ir_v1",
          output: {
            headline,
            answer: "",
            key_facts,
            reasons: [],
            caveats: []
          },
          raw_text: "",
          errors: [],
          warnings: []
        };
        break;
      }
      case "selected_days": {
        selected_query_dates = (override_compare_dates.length > 0 ? override_compare_dates : effective_dates).map((d) => String(d).slice(0, 10)).slice(0, 7);
        const query_dates = selected_query_dates;
        if (query_dates.length < 2) {
          const month_redirect_url2 = buildMonthRedirectUrl({
            window_start_date: selected_date.slice(0, 10),
            from_prompt: true
          });
          const ai_missing_dates = {
            ok: true,
            mode: "deterministic_missing_dates_v1",
            output: {
              headline: "J’ai besoin d’au moins 2 dates",
              summary: "Sélectionnez 2 à 7 jours dans le calendrier, ou écrivez-les en toutes lettres (ex: 1 juin 2026) ou au format 02/06/2026.",
              key_facts: [],
              caveat: "Sans 2 dates, je ne peux pas comparer les impacts (logistique, affluence, communication)."
            },
            raw_text: "",
            errors: [],
            warnings: []
          };
          const actions_missing = {
            month_redirect_url: month_redirect_url2,
            primary: month_redirect_url2 ? {
              type: "redirect",
              url: month_redirect_url2,
              label: "Ouvrir le mois"
            } : null,
            secondary: []
          };
          const normalized_ai_missing = normalizeAiOutput(
            ai_missing_dates,
            { horizon: resolved_horizon, intent: resolved_intent, used_dates: [] },
            actions_missing
          );
          return new Response(
            JSON.stringify({
              ok: true,
              meta: {
                location_id,
                resolved_horizon,
                resolved_intent,
                month_redirect_url: month_redirect_url2,
                producer: "deterministic_missing_dates_v1"
              },
              ai: {
                ...normalized_ai_missing,
                output: {
                  headline: normalized_ai_missing.headline,
                  answer: typeof normalized_ai_missing.answer === "string" ? normalized_ai_missing.answer : "",
                  key_facts: Array.isArray(normalized_ai_missing.key_facts) ? normalized_ai_missing.key_facts : [],
                  reasons: Array.isArray(normalized_ai_missing.reasons) ? normalized_ai_missing.reasons : [],
                  caveats: Array.isArray(normalized_ai_missing.caveats) ? normalized_ai_missing.caveats.filter(Boolean) : []
                }
              },
              actions: actions_missing,
              top_dates: [],
              decision_payload: {
                kind: "scoring",
                horizon: resolved_horizon,
                intent: resolved_intent,
                used_dates: [],
                signals: {}
              },
              window_aggregates_v3: null,
              ui_packaging_v3: null
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" }
            }
          );
        }
        selected_days_rows = await bqAll(
          `
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_selected_days_surface\`
          WHERE location_id = @location_id
            AND date IN UNNEST(
              ARRAY(SELECT DATE(x) FROM UNNEST(@dates) AS x)
            )
          ORDER BY date ASC
          `,
          bqParams({ location_id, dates: query_dates })
        );
        const v1 = compareDatesDeterministicV1({
          rows: Array.isArray(selected_days_rows) ? selected_days_rows : []
        });
        assertNoSentenceWithoutFactIdV1(v1.facts_by_date, v1.line_items);
        const render_lines = renderLineItemsFrV1({
          line_items: v1.line_items,
          facts_by_date: v1.facts_by_date
        });
        const allFactIds = /* @__PURE__ */ new Set();
        for (const d of Object.keys(v1.facts_by_date)) {
          for (const f of v1.facts_by_date[d] ?? []) {
            allFactIds.add(f.fact_id);
          }
        }
        for (let i = 0; i < render_lines.length; i++) {
          const rl = render_lines[i];
          if (!Array.isArray(rl.fact_ids) || rl.fact_ids.length === 0) {
            throw new Error(`RenderLine[${i}] has no fact_ids`);
          }
          for (const fid of rl.fact_ids) {
            if (!allFactIds.has(fid)) {
              throw new Error(`RenderLine[${i}] references unknown fact_id: ${fid}`);
            }
          }
          if (typeof rl.text_fr !== "string" || !rl.text_fr.trim()) {
            throw new Error(`RenderLine[${i}] has empty text_fr`);
          }
        }
        const ALLOWED_COMPARE_KINDS = /* @__PURE__ */ new Set(["headline", "fact", "implication", "caveat"]);
        const compare_lines = render_lines.filter((l2) => ALLOWED_COMPARE_KINDS.has(l2.kind));
        const headline = compare_lines.find((l2) => l2.kind === "headline")?.text_fr ?? "Comparaison";
        const caveat = compare_lines.find((l2) => l2.kind === "caveat")?.text_fr ?? null;
        const key_facts_raw = compare_lines.filter((l2) => l2.kind === "fact" || l2.kind === "implication").map((l2) => String(l2.text_fr ?? "").trim()).filter(Boolean);
        const DROP_PREFIX_RE = /^(meilleur choix:|risque meteo:|risque météo:|concurrence:|driver principal:|alternative:)/i;
        const key_facts_filtered = key_facts_raw.filter((t) => !DROP_PREFIX_RE.test(t));
        const key_facts = key_facts_filtered.length > 0 ? key_facts_filtered : buildCompareKeyFactsFallback(selected_days_rows);
        ai = {
          ok: true,
          mode: "deterministic_compare_dates_v1",
          output: {
            headline,
            answer: "Comparaison des points clés ci-dessous.",
            key_facts,
            caveat,
            reasons: [],
            caveats: caveat ? [caveat] : []
          },
          raw_text: "",
          errors: [],
          warnings: []
        };
        break;
      }
      case "lookup_event": {
        const region_insee = internal_context?.region_code_insee ?? internal_context?.row?.region_code_insee ?? null;
        const city_id = internal_context?.city_id ?? internal_context?.row?.city_id ?? null;
        const q_lookup_raw = String(qRaw ?? "").toLowerCase();
        const q_entity = q_lookup_raw.replace(/^a quelle date a lieu\s+/i, "").replace(/^à quelle date a lieu\s+/i, "").replace(/^quand a lieu\s+/i, "").replace(/^c['’]est quand\s+/i, "").replace(/^dates de\s+/i, "").replace(/^date de\s+/i, "").replace(/^(le|la|les|un|une|des)\s+/i, "").replace(/^l['’]\s*/i, "").replace(/^d['’]\s*/i, "").replace(/^du\s+/i, "").replace(/^de\s+/i, "").replace(/^de la\s+/i, "").replace(/^des\s+/i, "").replace(/[?!.,;:]+$/g, "").trim();
        const lookupSqlScoped = `
          SELECT
            event_name,
            event_start_date,
            event_end_date
          FROM \`${semanticProjectId}.semantic.vw_insight_eventcalendar_event_lookup\`
          WHERE location_id = @location_id
            AND LOWER(event_name) LIKE CONCAT('%', @q_entity, '%')
          LIMIT 1
        `;
        const lookupSqlGlobal = `
          SELECT
            event_name,
            event_start_date,
            event_end_date
          FROM \`${semanticProjectId}.semantic.vw_insight_eventcalendar_event_lookup\`
          WHERE location_id IS NULL
            AND LOWER(event_name) LIKE CONCAT('%', @q_entity, '%')
          LIMIT 1
        `;
        const rows_scoped = await bqAll(
          lookupSqlScoped,
          bqParams({ q_entity, location_id })
        );
        let rows = rows_scoped;
        if (!Array.isArray(rows_scoped) || rows_scoped.length === 0) {
          const rows_global = await bqAll(
            lookupSqlGlobal,
            bqParams({ q_entity })
          );
          rows = rows_global;
        }
        lookup_mode = Array.isArray(rows_scoped) && rows_scoped.length ? "scoped" : "fallback_global";
        lookup_sql_used = lookup_mode;
        const hit = Array.isArray(rows) && rows.length ? rows[0] : null;
        const lookup_result = {
          event_name: hit?.event_name ?? null,
          event_start_date: hit?.event_start_date ?? null,
          event_end_date: hit?.event_end_date ?? null
        };
        lookup_hit = lookup_result;
        const ir = buildLookupIRV1FromRow(hit);
        const render_lines = renderLineItemsFrV1({
          line_items: ir.line_items,
          facts_by_date: ir.facts_by_date
        });
        const headline = render_lines.find((l2) => l2.kind === "headline")?.text_fr ?? "Résultat événement";
        const key_facts = render_lines.filter((l2) => l2.kind !== "headline").map((l2) => l2.text_fr);
        ai = {
          ok: true,
          mode: "deterministic_lookup_event_ir_v1",
          output: {
            headline,
            answer: "",
            key_facts,
            reasons: [],
            caveats: []
          },
          raw_text: "",
          errors: [],
          warnings: []
        };
        break;
      }
      default: {
        throw new Error(`Unsupported resolved_horizon: ${String(resolved_horizon)}`);
      }
    }
    const top_dates = shortlist_rows.slice(0, top_k).map((r) => {
      const toFiniteNumOrNull = (v) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      return {
        date: ymdFromAnyDate2(r?.date),
        regime: typeof r?.opportunity_regime === "string" ? r.opportunity_regime : null,
        score: (() => {
          const n = toFiniteNumOrNull(r?.opportunity_score_final_local);
          return n === null ? null : Math.round(n);
        })(),
        weather_alert_level: toFiniteNumOrNull(r?.weather_alert_level),
        precip_probability_max_pct: toFiniteNumOrNull(r?.precip_probability_max_pct),
        wind_speed_10m_max: toFiniteNumOrNull(r?.wind_speed_10m_max),
        events_within_5km_count: toFiniteNumOrNull(r?.events_within_5km_count),
        events_within_10km_count: toFiniteNumOrNull(r?.events_within_10km_count),
        // useful for UI decisions without inventing routes
        available_next_views: r?.available_next_views ?? null
      };
    });
    const effective_day_date = resolved_horizon === "day" && day_row ? ymdFromAnyDate2(day_row?.date) : (override_day_date ?? (date ?? selected_date)).slice(0, 10);
    const first_selected_date = effective_dates[0] ? String(effective_dates[0]).slice(0, 10) : null;
    let primary = null;
    const secondary = [];
    if (resolved_horizon === "month") {
      if (month_redirect_url) {
        primary = {
          type: "redirect",
          url: month_redirect_url,
          label: resolved_intent === "WINDOW_WORST_DAYS" ? "Ouvrir le mois (jours à éviter)" : "Ouvrir le mois (shortlist)"
        };
      }
    } else if (resolved_horizon === "day") {
      const url = buildMonthRedirectUrl({
        window_start_date: effective_day_date,
        focus: "shortlist",
        from_prompt: true
      });
      primary = { type: "redirect", url, label: "Ouvrir le mois (ancré sur ce jour)" };
    } else if (resolved_horizon === "selected_days") {
      if (first_selected_date) {
        const url = buildMonthRedirectUrl({
          window_start_date: first_selected_date,
          focus: "shortlist",
          from_prompt: true
        });
        primary = { type: "redirect", url, label: "Ouvrir le mois (ancré sur la 1ère date)" };
      }
    }
    const actions = {
      month_redirect_url: month_redirect_url ?? null,
      primary,
      secondary
    };
    const decision_used_dates = (() => {
      if (resolved_horizon === "selected_days") {
        const qd = (override_compare_dates.length > 0 ? override_compare_dates : effective_dates).map((d) => String(d).slice(0, 10)).slice(0, 7);
        return qd;
      }
      if (resolved_horizon === "day") {
        return [effective_day_date];
      }
      if (resolved_intent === "WINDOW_WORST_DAYS") {
        return worstlist_rows.map((r) => ymdFromAnyDate2(r?.date)).slice(0, top_k);
      }
      return shortlist_rows.map((r) => ymdFromAnyDate2(r?.date)).slice(0, top_k);
    })();
    const decision_payload = (() => {
      if (!isScoringIntent(resolved_intent)) {
        return {
          kind: "lookup",
          horizon: "lookup_event",
          intent: "EVENT_LOOKUP",
          used_dates: [],
          signals: {}
        };
      }
      const scoring_horizon = resolved_horizon === "lookup_event" ? "month" : resolved_horizon;
      return {
        kind: "scoring",
        horizon: scoring_horizon,
        intent: resolved_intent,
        used_dates: decision_used_dates,
        signals: buildDecisionSignals({
          q,
          intent: resolved_intent,
          horizon: scoring_horizon,
          internal_context,
          shortlist_rows,
          worstlist_rows,
          day_row,
          selected_days_rows
        })
      };
    })();
    const deterministic_reasons = buildDeterministicReasons({
      horizon: resolved_horizon,
      intent: resolved_intent,
      signals: decision_payload.kind === "scoring" ? decision_payload.signals : {},
      top_dates,
      month_window
    });
    const shouldRunV3ClaudeMonth = resolved_horizon === "month" && (resolved_intent === "WINDOW_TOP_DAYS" || resolved_intent === "WINDOW_WORST_DAYS") && ai?.mode === "month_pending_packaging";
    if (shouldRunV3ClaudeMonth) {
      window_aggregates_v3 = buildWindowAggregatesV3({ month_window, month_days });
      ui_packaging_v3 = buildUiPackagingV3Month({
        intent: resolved_intent,
        used_dates: decision_used_dates,
        month_window,
        month_days
      });
      try {
        const SUBMODE_BY_INTENT = {
          WINDOW_TOP_DAYS: "window_summary",
          WINDOW_WORST_DAYS: "window_worst_days"
        };
        const submode = SUBMODE_BY_INTENT[resolved_intent];
        const llmPayload = {
          user_question: qRaw,
          meta: { horizon: resolved_horizon, intent: resolved_intent, used_dates: decision_used_dates },
          internal_context,
          decision_policy_rules,
          decision_payload,
          window_aggregates_v3,
          top_dates: shortlist_rows.map((r) => ({
            date: ymdFromAnyDate2(r.date),
            regime: r.opportunity_regime,
            score: Math.round(Number(r.opportunity_score_final_local) || 0),
            medal: r.opportunity_medal ?? null,
            driver_label: r.v3_primary_driver,
            driver_impact: r.v3_driver_impact,
            driver_confidence: r.v3_driver_confidence,
            signals: r.v3_signals
          }))
        };
        const claude = await runAIPackagerClaude({
          mode: "month",
          submode,
          // ✅ IMPORTANT: top-level, not inside row
          row: llmPayload,
          aiLocationContextRow: internal_context
        });
        const hasOutput = claude && claude.ok === true && claude.output && typeof claude.output === "object";
        if (!hasOutput) {
          const msg = Array.isArray(claude?.errors) && claude.errors[0] || "Claude returned no usable output.";
          throw new Error(msg);
        }
        ai = claude;
        producer = "v3_claude";
      } catch (e) {
        const rows = resolved_intent === "WINDOW_WORST_DAYS" ? Array.isArray(worstlist_rows) ? worstlist_rows : [] : Array.isArray(shortlist_rows) ? shortlist_rows : [];
        const out = resolved_intent === "WINDOW_WORST_DAYS" ? windowWorstDaysDeterministic({ rows }) : windowTopDaysDeterministic({ rows });
        const contextBits = [
          typeof internal_context?.location_type === "string" ? `lieu ${String(internal_context.location_type)}` : null,
          typeof internal_context?.company_activity_type === "string" ? `activité ${String(internal_context.company_activity_type)}` : null,
          typeof internal_context?.event_time_profile === "string" ? `rythme ${String(internal_context.event_time_profile)}` : null
        ].filter(Boolean);
        const dateBits = rows.map((r) => ymdFromAnyDate2(r?.date)).filter((d) => d && typeof d === "string");
        const signals = decision_payload.kind === "scoring" ? decision_payload.signals : {};
        const signalFacts = [
          signals.weather?.explanation ?? null,
          signals.competition?.explanation ?? null,
          signals.calendar?.explanation ?? null
        ].filter(Boolean);
        const fallbackSummary = rows.map((r) => {
          const d = ymdFromAnyDate2(r?.date);
          const driver = r?.v3_primary_driver ?? "ND";
          const impact = r?.v3_driver_impact ?? "neutral";
          const conf = r?.v3_driver_confidence ?? "low";
          return `${d} — ${driver} (${impact}, confiance ${conf})`;
        }).join(" | ");
        ai = {
          ok: true,
          mode: resolved_intent === "WINDOW_WORST_DAYS" ? "deterministic_window_worst_days_v1" : "deterministic_window_top_days_v1",
          output: {
            headline: out.headline,
            summary: fallbackSummary || out.summary,
            key_facts: signalFacts.length ? signalFacts.slice(0, 3) : out.key_facts,
            caveat: out.caveat
          },
          raw_text: "",
          errors: [],
          warnings: [`Claude unavailable: ${(e?.message ?? String(e)).slice(0, 140)}`]
        };
        producer = "v3_fallback_deterministic";
      }
    }
    const normalized_ai_base = normalizeAiOutput(
      ai,
      {
        horizon: resolved_horizon,
        intent: resolved_intent,
        used_dates: decision_used_dates
      },
      actions
    );
    const normalized_ai = {
      ...normalized_ai_base,
      caveats: asStringArray(normalized_ai_base.caveats),
      // Reasons: only for day / selected_days (fallback to deterministic if AI has none)
      reasons: resolved_horizon === "day" || resolved_horizon === "selected_days" ? Array.isArray(normalized_ai_base.reasons) && normalized_ai_base.reasons.length > 0 ? normalized_ai_base.reasons : deterministic_reasons : []
    };
    return new Response(
      JSON.stringify({
        ok: true,
        meta: {
          location_id,
          resolved_horizon,
          resolved_intent,
          producer
        },
        // ✅ Backward-compat UI contract: keep legacy ai.output.*
        // Keep normalized_ai as the canonical v1 contract you control.
        ai: {
          ...normalized_ai,
          // Legacy UI readers often detect "displayable content" via ai.output.summary/headline
          output: {
            headline: normalized_ai.headline,
            answer: typeof normalized_ai.answer === "string" ? normalized_ai.answer : "",
            key_facts: Array.isArray(normalized_ai.key_facts) ? normalized_ai.key_facts : [],
            reasons: Array.isArray(normalized_ai.reasons) ? normalized_ai.reasons : [],
            caveats: Array.isArray(normalized_ai.caveats) ? normalized_ai.caveats.filter(Boolean) : []
          }
        },
        actions,
        top_dates,
        decision_payload,
        window_aggregates_v3,
        ui_packaging_v3,
        // ✅ keep raw only for debugging
        debug: {
          ai_raw: ai,
          lookup_hit,
          lookup_mode,
          lookup_sql_used,
          thread_context_out: {
            v: 1,
            location_id,
            turn: typeof thread_context?.turn === "number" ? thread_context.turn + 1 : 1,
            selected_date: resolved_horizon === "day" && day_row ? ymdFromAnyDate2(day_row?.date) : selected_date.slice(0, 10),
            last: {
              horizon: resolved_horizon,
              intent: resolved_intent,
              used_dates: decision_used_dates,
              top_dates
            }
          },
          internal_context: {
            source_view: `${semanticProjectId}.semantic.vw_insight_event_ai_location_context`,
            row: internal_context
          },
          daywhy_input: resolved_horizon === "day" ? {
            date: day_row ? ymdFromAnyDate2(day_row?.date) : null,
            day_row,
            location_context: internal_context
          } : null,
          decision_policy_rules: {
            source_view: `${semanticProjectId}.semantic.vw_ms_insight_ai_decision_policy_rules`,
            rows: decision_policy_rules
          },
          score_debug: (() => {
            const rows = Array.isArray(month_days) ? month_days : [];
            const scores = rows.map((r) => {
              const n = typeof r?.opportunity_score_final_local === "number" ? r.opportunity_score_final_local : Number(r?.opportunity_score_final_local);
              return Number.isFinite(n) ? n : null;
            }).filter((x) => x !== null);
            scores.sort((a, b) => a - b);
            const min = scores.length ? Math.round(scores[0]) : null;
            const max = scores.length ? Math.round(scores[scores.length - 1]) : null;
            return { min, max, n_scored_days: scores.length, n_month_days: rows.length };
          })(),
          calendar_coverage_debug: (() => {
            const rows = Array.isArray(month_days) ? month_days : [];
            const isNull = (v) => v === null || v === void 0;
            const miss = (key) => rows.filter((r) => isNull(r?.[key])).length;
            return {
              n_month_days: rows.length,
              miss_is_weekend: miss("is_weekend"),
              miss_is_public_holiday_fr_flag: miss("is_public_holiday_fr_flag"),
              miss_is_school_holiday_flag: miss("is_school_holiday_flag"),
              miss_is_commercial_event_flag: miss("is_commercial_event_flag")
            };
          })(),
          semantic_truth: {
            month_window,
            month_days,
            day: day_row,
            selected_days: selected_days_rows,
            shortlist
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (err) {
    console.error("PROMPT_API_ERROR:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message ?? "Unknown error",
        stack: process.env.NODE_ENV === "development" ? String(err?.stack ?? "") : void 0
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" }
      }
    );
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
