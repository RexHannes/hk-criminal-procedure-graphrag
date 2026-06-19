const fs = require("fs");
const path = require("path");

function missingMetadata(card = {}) {
  const missing = [];
  for (const field of ["proposition_id", "case_id", "paragraph_id", "exact_quote", "proposition_text", "significance_label", "authority_role", "review_state"]) {
    if (!card[field]) missing.push(field);
  }
  if (!Array.isArray(card.tree_node_ids) || card.tree_node_ids.length === 0) missing.push("tree_node_ids");
  return missing;
}

function buildPropositionReviewQueue({ propositionArtifactPath, outputPath } = {}) {
  if (!propositionArtifactPath) throw new Error("propositionArtifactPath required");
  const artifact = JSON.parse(fs.readFileSync(propositionArtifactPath, "utf8"));
  const items = (artifact.proposition_cards || []).map(card => {
    const missing = missingMetadata(card);
    const priority = card.significance_label === "not_authority_party_argument" || card.authority_role === "party_submission"
      ? "authority_role_check"
      : missing.length
        ? "metadata_fix"
        : card.confidence === "low" || (card.tree_node_ids || []).includes("unattached")
          ? "attachment_review"
          : "normal_review";
    return {
      item_id: `review_${card.proposition_id}`,
      proposition_id: card.proposition_id,
      case_id: card.case_id,
      tree_node_ids: card.tree_node_ids || [],
      significance_label: card.significance_label,
      authority_role: card.authority_role,
      confidence: card.confidence,
      review_state: card.review_state || "machine_candidate",
      human_review_required: true,
      priority,
      missing_metadata: missing,
      group_keys: {
        by_tree_node: (card.tree_node_ids || ["unattached"])[0],
        by_significance_label: card.significance_label || "missing",
        by_confidence: card.confidence || "missing",
        by_case: card.case_id || "missing",
      },
    };
  });
  const result = {
    queue_id: "criminal_evidence_proposition_review_queue_v1",
    generated_at: new Date().toISOString(),
    source_artifact_id: artifact.artifact_id,
    item_count: items.length,
    items,
  };
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
  return result;
}

module.exports = {
  buildPropositionReviewQueue,
  missingMetadata,
};
