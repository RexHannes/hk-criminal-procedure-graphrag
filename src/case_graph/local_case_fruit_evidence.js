const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PILOT_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_pilot");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function localCaseFruitEvidenceForNode(doctrineNodeId) {
  const linksPayload = readJsonIfExists(path.join(PILOT_DIR, "proposition_node_links.json"));
  const l4Payload = readJsonIfExists(path.join(PILOT_DIR, "l4_case_applications.json"));
  const l5Payload = readJsonIfExists(path.join(PILOT_DIR, "l5_paragraph_proof.json"));
  if (!linksPayload || !l4Payload || !l5Payload) return [];

  const l4ByProposition = new Map((l4Payload.l4_case_applications || []).map(item => [item.proposition_id, item]));
  const l5ByProposition = new Map((l5Payload.l5_paragraph_proof || []).map(item => [item.proposition_id, item]));
  return (linksPayload.proposition_node_links || [])
    .filter(link => link.doctrine_node_id === doctrineNodeId)
    .map(link => {
      const l4 = l4ByProposition.get(link.proposition_id) || {};
      const l5 = l5ByProposition.get(link.proposition_id) || {};
      return {
        case_name: l4.case_id || "Demo bail fixture",
        neutral_citation: "[Demo fixture - not authority]",
        court_level: "",
        case_id: l4.case_id || l5.case_id || "",
        paragraph_id: l5.paragraph_id || "",
        para_no: l5.para_no || "",
        proposition_id: link.proposition_id,
        proposition_text: l4.application_summary || "",
        supporting_quote: l5.exact_quote || "",
        paragraph_text: l5.paragraph_text || "",
        source_url: "fixture://criminal_evidence_tree_v1/bail_pilot",
        link_type: link.link_type || "candidate",
        authority_role: link.authority_role || "application",
        significance_label: link.significance_label || "",
        verification_status: link.review_status || "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_status: "unreviewed",
        validator_flags: [
          "fixture_only",
          "not_real_authority",
          "needs_human_review",
        ],
        l4_application_id: l4.l4_application_id || "",
        l5_proof_id: l5.l5_proof_id || "",
      };
    });
}

module.exports = {
  localCaseFruitEvidenceForNode,
};
