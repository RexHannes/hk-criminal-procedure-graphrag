const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const CASE_FRUIT_DIRS = [
  {
    dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_pilot"),
    sourceUrl: "fixture://criminal_evidence_tree_v1/bail_pilot",
    flags: ["fixture_only", "not_real_authority", "needs_human_review"],
    fallbackCaseName: "Demo bail fixture",
    fallbackCitation: "[Demo fixture - not authority]",
  },
  {
    dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1"),
    sourceUrl: "https://legalref.judiciary.hk/",
    flags: ["public_source_candidate", "needs_human_review"],
    fallbackCaseName: "Public bail source candidate",
    fallbackCitation: "[Public source candidate]",
  },
  {
    dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "sedition_public_expression_v1"),
    sourceUrl: "https://legalref.judiciary.hk/",
    flags: ["public_source_candidate", "quote_verified", "needs_human_review", "tree_gap_candidate"],
    fallbackCaseName: "Sedition/public-expression source candidate",
    fallbackCitation: "[Public source candidate]",
  },
  {
    dir: path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "public_order_riot_v1"),
    sourceUrl: "https://legalref.judiciary.hk/",
    flags: ["public_source_candidate", "quote_verified", "needs_human_review", "tree_gap_candidate"],
    fallbackCaseName: "Public-order source candidate",
    fallbackCitation: "[Public source candidate]",
  },
];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function localEvidenceFromDir(doctrineNodeId, config) {
  const linksPayload = readJsonIfExists(path.join(config.dir, "proposition_node_links.json"));
  const l4Payload = readJsonIfExists(path.join(config.dir, "l4_case_applications.json"));
  const l5Payload = readJsonIfExists(path.join(config.dir, "l5_paragraph_proof.json"));
  const paragraphPayload = readJsonIfExists(path.join(config.dir, "paragraph_cards.json"));
  if (!linksPayload || !l4Payload || !l5Payload) return [];

  const l4ByProposition = new Map((l4Payload.l4_case_applications || []).map(item => [item.proposition_id, item]));
  const l5ByProposition = new Map((l5Payload.l5_paragraph_proof || []).map(item => [item.proposition_id, item]));
  const caseById = new Map((paragraphPayload?.cases || []).map(item => [item.case_id, item]));
  return (linksPayload.proposition_node_links || [])
    .filter(link => link.doctrine_node_id === doctrineNodeId)
    .map(link => {
      const l4 = l4ByProposition.get(link.proposition_id) || {};
      const l5 = l5ByProposition.get(link.proposition_id) || {};
      const caseRecord = caseById.get(l4.case_id || l5.case_id) || {};
      const quote = l5.exact_quote || "";
      const paragraphText = l5.paragraph_text || "";
      const quoteVerified = Boolean(quote && paragraphText && paragraphText.includes(quote));
      return {
        case_name: l4.case_name || l5.case_name || l4.case_id || config.fallbackCaseName,
        neutral_citation: l4.neutral_citation || l5.neutral_citation || config.fallbackCitation,
        law_report_citation: caseRecord.law_report_citation || "",
        court: caseRecord.court || "",
        court_level: caseRecord.court_level || "",
        date: caseRecord.date || "",
        authority_status: caseRecord.authority_status || "",
        case_id: l4.case_id || l5.case_id || "",
        paragraph_id: l5.paragraph_id || "",
        para_no: l5.para_no || "",
        proposition_id: link.proposition_id,
        proposition_text: l4.application_summary || "",
        supporting_quote: quote,
        exact_quote: quote,
        paragraph_text: paragraphText,
        source_url: l5.source_url || caseRecord.source_url_or_path || config.sourceUrl,
        link_type: link.link_type || "candidate",
        authority_role: link.authority_role || "application",
        significance_label: link.significance_label || "",
        verification_status: link.review_status || "machine_candidate",
        answer_layer_status: quoteVerified ? "paragraph_verified" : "candidate_only",
        quote_verified: quoteVerified,
        human_review_status: "unreviewed",
        validator_flags: config.flags,
        l4_application_id: l4.l4_application_id || "",
        l5_proof_id: l5.l5_proof_id || "",
        lineage_note: l4.lineage_note || link.notes || "",
      };
    });
}

function localCaseFruitEvidenceForNode(doctrineNodeId) {
  return CASE_FRUIT_DIRS.flatMap(config => localEvidenceFromDir(doctrineNodeId, config));
}

module.exports = {
  localCaseFruitEvidenceForNode,
};
