const crypto = require("crypto");

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key, configured: Boolean(url && key) };
}

function normalizeQuery(query) {
  return String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String))).sort();
}

function legalIngestSourceFingerprint(bundle) {
  const sourceIds = unique((bundle?.source_registry || []).map(source => source.source_id));
  const propositionIds = unique((bundle?.proposition_cards || []).map(card => card.proposition_id));
  const paragraphIds = unique((bundle?.legal_paragraphs || []).map(card => card.paragraph_id));
  const formIds = unique((bundle?.form_metadata || []).map(form => form.form_id));
  const reviewStatuses = {};
  for (const card of bundle?.proposition_cards || []) {
    reviewStatuses[card.proposition_id] = [
      card.verification_status || "unknown",
      card.answer_layer_status || "unknown",
      card.review_status || "unknown",
    ].join(":");
  }
  return sha256(JSON.stringify({
    sourceIds,
    propositionIds,
    paragraphIds,
    formIds,
    reviewStatuses,
  }));
}

function retrievalStatusForBundle(bundle) {
  const cards = bundle?.proposition_cards || [];
  if (!cards.length) return "research_only";
  if (cards.every(card => card.answer_layer_status === "answer_safe" && card.review_status === "approved")) return "answer_safe";
  if (cards.every(card => ["source_verified", "quote_verified", "verified"].includes(card.verification_status))) return "source_verified";
  return "research_only";
}

function cacheIds(query, fingerprint) {
  const queryHash = sha256(normalizeQuery(query));
  const short = sha256(`${queryHash}:${fingerprint}`).slice(0, 32);
  return {
    queryHash,
    bundleId: `retrieval_bundle_${short}`,
    answerId: `legal_answer_${short}`,
    playbookId: `sop_playbook_${short}`,
  };
}

async function supabaseRest(pathAndQuery, { method = "GET", body } = {}) {
  const { url, key, configured } = supabaseConfig();
  if (!configured) {
    const err = new Error("answer_cache_supabase_not_configured");
    err.status = "not_configured";
    throw err;
  }
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const err = new Error(`answer_cache_supabase_${response.status}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

function buildRetrievalBundleRecord({ query, legalIngestBundle, applied, fingerprint }) {
  const ids = cacheIds(query, fingerprint);
  const sourceIds = unique((legalIngestBundle?.source_registry || []).map(source => source.source_id));
  const propositionIds = unique((legalIngestBundle?.proposition_cards || []).map(card => card.proposition_id));
  const paragraphIds = unique((legalIngestBundle?.legal_paragraphs || []).map(card => card.paragraph_id));
  const formIds = unique((legalIngestBundle?.form_metadata || []).map(form => form.form_id));
  const retrievalStatus = retrievalStatusForBundle(legalIngestBundle);
  return {
    bundle_id: ids.bundleId,
    query_hash: ids.queryHash,
    normalized_query: normalizeQuery(query),
    domain: applied?.answer_contract?.domain || "general_legal_research",
    scenario_family: applied?.answer_contract?.scenario_family || null,
    scenario_subtype: applied?.answer_contract?.scenario_subtype || applied?.classification?.scenario || null,
    user_perspective: applied?.classification?.user_perspective || null,
    corpus_fingerprint: fingerprint,
    source_card_ids: sourceIds,
    proposition_ids: propositionIds,
    paragraph_ids: paragraphIds,
    form_ids: formIds,
    retrieval_filters: {
      source: "legal_ingest_vertical",
      vertical_id: legalIngestBundle?.vertical_id,
    },
    retrieval_summary: {
      source_count: sourceIds.length,
      proposition_count: propositionIds.length,
      paragraph_count: paragraphIds.length,
      form_count: formIds.length,
    },
    source_audit: {
      vertical_id: legalIngestBundle?.vertical_id,
      status: legalIngestBundle?.status,
      verification_status: applied?.source_audit?.verification_status,
    },
    retrieval_status: retrievalStatus,
    review_status: retrievalStatus === "answer_safe" ? "approved" : "lawyer_review_required",
  };
}

function buildAnswerSnapshotRecord({ query, legalIngestBundle, applied, fingerprint, responsePayload }) {
  const ids = cacheIds(query, fingerprint);
  const retrievalStatus = retrievalStatusForBundle(legalIngestBundle);
  return {
    answer_id: ids.answerId,
    bundle_id: ids.bundleId,
    contract_id: applied?.answer_contract?.contract_id || null,
    query_hash: ids.queryHash,
    answer_mode: applied?.applied_answer?.mode || "professional_source_gated",
    answer_json: {
      applied_answer: responsePayload.applied_answer,
      answer_contract: responsePayload.answer_contract,
      classification: responsePayload.classification,
      source_backed_rules: responsePayload.source_backed_rules || [],
      form_candidates: responsePayload.form_candidates || [],
      unsupported_claims: responsePayload.unsupported_claims || [],
      source_audit: responsePayload.source_audit,
    },
    source_fingerprint: fingerprint,
    unsupported_claims: responsePayload.unsupported_claims || [],
    verification_report: {
      legal_source_card_count: responsePayload.legal_source_card_count || 0,
      warnings: responsePayload.warnings || [],
      source_audit_status: responsePayload.source_audit?.verification_status,
    },
    answer_status: retrievalStatus,
    review_status: retrievalStatus === "answer_safe" ? "approved" : "lawyer_review_required",
    usage_count: 0,
  };
}

function sectionItems(applied, headingPattern) {
  const sections = applied?.applied_answer?.sections || [];
  return sections
    .filter(section => headingPattern.test(String(section.heading || "")))
    .flatMap(section => (section.items || []).map(item => ({
      heading: section.heading,
      text: String(item),
    })));
}

function buildSopPlaybookRecord({ query, legalIngestBundle, applied, fingerprint }) {
  const ids = cacheIds(query, fingerprint);
  const sourceIds = unique((legalIngestBundle?.source_registry || []).map(source => source.source_id));
  const propositionIds = unique((legalIngestBundle?.proposition_cards || []).map(card => card.proposition_id));
  const paragraphIds = unique((legalIngestBundle?.legal_paragraphs || []).map(card => card.paragraph_id));
  const formIds = unique((legalIngestBundle?.form_metadata || []).map(form => form.form_id));
  const retrievalStatus = retrievalStatusForBundle(legalIngestBundle);
  const status = retrievalStatus === "answer_safe"
    ? "answer_safe"
    : retrievalStatus === "source_verified"
      ? "source_verified"
      : "draft";
  return {
    playbook_id: ids.playbookId,
    domain: applied?.answer_contract?.domain || "general_legal_research",
    scenario_family: applied?.answer_contract?.scenario_family || "general_legal_research",
    scenario_subtype: applied?.answer_contract?.scenario_subtype || applied?.classification?.scenario || null,
    title: applied?.applied_answer?.title || "Source-gated legal SOP playbook",
    contract_id: applied?.answer_contract?.contract_id || null,
    retrieval_bundle_id: ids.bundleId,
    answer_snapshot_id: ids.answerId,
    steps: sectionItems(applied, /application|procedural|risk|caveat/i),
    forms_or_documents: sectionItems(applied, /documents|forms/i),
    missing_facts: sectionItems(applied, /missing facts/i),
    source_card_ids: sourceIds.concat(paragraphIds),
    proposition_ids: propositionIds,
    form_ids: formIds,
    source_fingerprint: fingerprint,
    status,
    review_status: status === "answer_safe" ? "approved" : "lawyer_review_required",
    firm_id: null,
  };
}

async function upsertRows(table, conflictKey, rows) {
  if (!rows.length) return [];
  return supabaseRest(`${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
    method: "POST",
    body: rows,
  });
}

async function findCachedLegalAnswer({ query, legalIngestBundle }) {
  if (process.env.LEGAL_ANSWER_CACHE === "0") return { status: "disabled" };
  const fingerprint = legalIngestSourceFingerprint(legalIngestBundle);
  const ids = cacheIds(query, fingerprint);
  try {
    const rows = await supabaseRest(
      `legal_answer_snapshots?answer_id=eq.${encodeURIComponent(ids.answerId)}&source_fingerprint=eq.${encodeURIComponent(fingerprint)}&select=answer_id,bundle_id,answer_json,answer_status,review_status,usage_count&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.review_status === "rejected" || row.answer_status === "stale" || row.answer_status === "blocked") {
      return { status: row ? "stale_or_blocked" : "miss", fingerprint, ids };
    }
    return {
      status: "hit",
      fingerprint,
      ids,
      answer_json: row.answer_json,
      answer_status: row.answer_status,
      review_status: row.review_status,
      usage_count: row.usage_count || 0,
    };
  } catch (error) {
    return { status: "unavailable", warning: error.message, fingerprint, ids };
  }
}

async function writeLegalAnswerCache({ query, legalIngestBundle, applied, responsePayload }) {
  if (process.env.LEGAL_ANSWER_CACHE === "0") return { status: "disabled" };
  if (!legalIngestBundle) return { status: "skipped_no_legal_ingest_bundle" };
  const fingerprint = legalIngestSourceFingerprint(legalIngestBundle);
  const ids = cacheIds(query, fingerprint);
  const bundleRecord = buildRetrievalBundleRecord({ query, legalIngestBundle, applied, fingerprint });
  const answerRecord = buildAnswerSnapshotRecord({ query, legalIngestBundle, applied, fingerprint, responsePayload });
  const sopRecord = buildSopPlaybookRecord({ query, legalIngestBundle, applied, fingerprint });
  try {
    await upsertRows("retrieval_bundles", "bundle_id", [bundleRecord]);
    await upsertRows("legal_answer_snapshots", "answer_id", [answerRecord]);
    await upsertRows("sop_playbooks", "playbook_id", [sopRecord]);
    return {
      status: "written",
      bundle_id: ids.bundleId,
      answer_id: ids.answerId,
      playbook_id: ids.playbookId,
      source_fingerprint: fingerprint,
      answer_status: answerRecord.answer_status,
      review_status: answerRecord.review_status,
    };
  } catch (error) {
    return {
      status: "write_failed",
      warning: error.message,
      bundle_id: ids.bundleId,
      answer_id: ids.answerId,
      playbook_id: ids.playbookId,
    };
  }
}

module.exports = {
  buildAnswerSnapshotRecord,
  buildRetrievalBundleRecord,
  buildSopPlaybookRecord,
  cacheIds,
  findCachedLegalAnswer,
  legalIngestSourceFingerprint,
  normalizeQuery,
  retrievalStatusForBundle,
  writeLegalAnswerCache,
};
