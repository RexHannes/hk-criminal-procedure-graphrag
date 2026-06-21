const path = require("path");
const { localCaseFruitEvidenceForNode } = require("./local_case_fruit_evidence");
const { lineageRankEvidence } = require("./case_fruit_lineage");
const {
  buildAnswerSnapshotRecord,
  buildRetrievalBundleRecord,
  buildSopPlaybookRecord,
  cacheIds,
  legalIngestSourceFingerprint,
  writeLegalAnswerCache,
} = require("../../api/legal-ingest/cache");

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String))).sort();
}

function evidenceReviewStatus(item) {
  if (item.answer_layer_status === "answer_safe") return "approved";
  if (item.answer_layer_status === "paragraph_verified") return "source_verified";
  return item.verification_status || "machine_candidate";
}

function legalIngestBundleFromEvidence({ doctrineNodeId, evidence }) {
  return {
    vertical_id: "criminal_case_fruit_sop_bridge_v1",
    status: evidence.length ? "research_only_candidate_evidence" : "no_evidence",
    source_registry: evidence.map(item => ({
      source_id: item.case_id || item.proposition_id,
      source_type: "case",
      title: item.case_name || item.case_id,
      citation: item.neutral_citation,
      source_url: item.source_url,
      visibility: "public_source",
      review_status: evidenceReviewStatus(item),
    })),
    legal_paragraphs: evidence.map(item => ({
      paragraph_id: item.paragraph_id,
      source_id: item.case_id || item.proposition_id,
      para_no: item.para_no,
      paragraph_text: item.paragraph_text,
      verification_status: item.supporting_quote ? "quote_verified" : "machine_candidate",
      answer_layer_status: item.answer_layer_status || "candidate_only",
      review_status: evidenceReviewStatus(item),
    })),
    proposition_cards: evidence.map(item => ({
      proposition_id: item.proposition_id,
      paragraph_id: item.paragraph_id,
      proposition_text: item.proposition_text,
      supporting_quote: item.supporting_quote,
      issue_tags: [doctrineNodeId],
      authority_role: item.authority_role,
      verification_status: item.answer_layer_status === "answer_safe" ? "source_verified" : "machine_candidate",
      answer_layer_status: item.answer_layer_status === "answer_safe" ? "answer_safe" : "candidate_only",
      review_status: evidenceReviewStatus(item),
      human_review_required: item.answer_layer_status !== "answer_safe",
    })),
    form_metadata: [],
  };
}

function lineItems(evidence) {
  return evidence.map(item => {
    const citation = [item.neutral_citation, item.para_no ? `para ${item.para_no}` : ""].filter(Boolean).join(", ");
    return [
      item.proposition_text || item.supporting_quote || "Candidate case fruit",
      citation ? `(${citation})` : "",
      item.answer_layer_status !== "answer_safe" ? "[research-only, review required]" : "[answer-safe]",
    ].filter(Boolean).join(" ");
  });
}

function appliedSopFromEvidence({ doctrineNodeId, query, evidence }) {
  const candidateItems = lineItems(evidence);
  const lineageNotes = unique(evidence.map(item => item.lineage_note || item.notes).filter(Boolean));
  return {
    answer_contract: {
      contract_id: `case_fruit_sop_contract_${doctrineNodeId.replace(/[^a-z0-9]+/gi, "_")}`,
      domain: "criminal_procedure_hk",
      scenario_family: "case_fruit_doctrine_branch",
      scenario_subtype: doctrineNodeId,
      required_sections: [
        "Case Fruit Source Trail",
        "SOP Use",
        "Missing Facts / Review Gates",
        "Lineage / Treatment Notes",
      ],
      no_source_no_answer: true,
    },
    classification: {
      domain: "criminal_procedure_hk",
      doctrine_node_id: doctrineNodeId,
      task_type: "sop_from_case_fruits",
      evidence_status: evidence.length ? "candidate_research_only" : "no_evidence",
    },
    applied_answer: {
      mode: "case_fruit_sop_bridge_no_llm",
      title: `SOP Candidate - ${doctrineNodeId}`,
      short_answer: evidence.length
        ? "Candidate case fruits are recallable for this doctrine branch, but they remain research-only unless promoted through human review."
        : "No case fruits are currently attached to this doctrine branch.",
      sections: [
        {
          heading: "Case Fruit Source Trail",
          items: candidateItems.length ? candidateItems : ["No source-backed case fruit is available for this doctrine node."],
        },
        {
          heading: "SOP Use",
          items: [
            "Use these case fruits as a source trail for issue spotting and internal SOP drafting only.",
            "Before final legal output, check the paragraph quote, authority role, court level, and lineage note.",
            "Do not present candidate-only material as final law.",
          ],
        },
        {
          heading: "Missing Facts / Review Gates",
          items: [
            "Human legal review is required before any proposition becomes answer-safe.",
            "If a retrieved proposition is off-branch, send it to the correction queue instead of using it in the SOP.",
            "If the source fingerprint changes, recompute or downgrade the cached SOP.",
          ],
        },
        {
          heading: "Lineage / Treatment Notes",
          items: lineageNotes.length ? lineageNotes : ["No explicit lineage note is attached to the recalled fruits."],
        },
      ],
    },
    source_audit: {
      verification_status: evidence.length ? "quote_verified_research_only_human_review_required" : "no_evidence",
      doctrine_node_id: doctrineNodeId,
      evidence_count: evidence.length,
    },
  };
}

function buildCaseFruitSopBridge({ doctrineNodeId, query } = {}) {
  if (!doctrineNodeId) throw new Error("doctrineNodeId required");
  const evidence = lineageRankEvidence(localCaseFruitEvidenceForNode(doctrineNodeId));
  const normalizedQuery = query || `SOP from case fruits for ${doctrineNodeId}`;
  const legalIngestBundle = legalIngestBundleFromEvidence({ doctrineNodeId, evidence });
  const applied = appliedSopFromEvidence({ doctrineNodeId, query: normalizedQuery, evidence });
  const fingerprint = legalIngestSourceFingerprint(legalIngestBundle);
  const ids = cacheIds(normalizedQuery, fingerprint);
  const responsePayload = {
    applied_answer: applied.applied_answer,
    answer_contract: applied.answer_contract,
    classification: applied.classification,
    source_backed_rules: legalIngestBundle.proposition_cards,
    form_candidates: [],
    unsupported_claims: evidence.length ? [] : [{ claim: "No case fruits available", reason: "no_evidence" }],
    source_audit: applied.source_audit,
    legal_source_card_count: evidence.length,
    warnings: evidence.some(item => item.answer_layer_status !== "answer_safe")
      ? ["case_fruits_research_only_until_reviewed"]
      : [],
  };
  return {
    bridge_id: `case_fruit_sop_bridge_${doctrineNodeId.replace(/[^a-z0-9]+/gi, "_")}`,
    doctrine_node_id: doctrineNodeId,
    query: normalizedQuery,
    evidence_count: evidence.length,
    source_fingerprint: fingerprint,
    cache_ids: ids,
    legal_ingest_bundle: legalIngestBundle,
    applied,
    response_payload: responsePayload,
    cache_records: {
      retrieval_bundle: buildRetrievalBundleRecord({ query: normalizedQuery, legalIngestBundle, applied, fingerprint }),
      answer_snapshot: buildAnswerSnapshotRecord({ query: normalizedQuery, legalIngestBundle, applied, fingerprint, responsePayload }),
      sop_playbook: buildSopPlaybookRecord({ query: normalizedQuery, legalIngestBundle, applied, fingerprint }),
    },
    policy: {
      no_llm_tokens_used: true,
      auto_promote_answer_safe: false,
      private_sources_allowed: false,
      cache_status: "draft_or_research_only_until_reviewed",
    },
  };
}

async function writeCaseFruitSopBridgeCache({ doctrineNodeId, query } = {}) {
  const bridge = buildCaseFruitSopBridge({ doctrineNodeId, query });
  const result = await writeLegalAnswerCache({
    query: bridge.query,
    legalIngestBundle: bridge.legal_ingest_bundle,
    applied: bridge.applied,
    responsePayload: bridge.response_payload,
  });
  return { ...bridge, cache_write: result };
}

module.exports = {
  appliedSopFromEvidence,
  buildCaseFruitSopBridge,
  legalIngestBundleFromEvidence,
  writeCaseFruitSopBridgeCache,
};
