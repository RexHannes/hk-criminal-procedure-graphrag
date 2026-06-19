const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildBailCaseFruitLinks({ mappingPath, propositionArtifactPath, paragraphArtifactPath, outputDir } = {}) {
  if (!mappingPath) throw new Error("mappingPath required");
  if (!propositionArtifactPath) throw new Error("propositionArtifactPath required");
  if (!paragraphArtifactPath) throw new Error("paragraphArtifactPath required");
  const mapping = readJson(mappingPath);
  const propositions = readJson(propositionArtifactPath);
  const paragraphs = readJson(paragraphArtifactPath);
  const propositionById = new Map((propositions.proposition_cards || []).map(card => [card.proposition_id, card]));
  const paragraphById = new Map((paragraphs.paragraph_cards || []).map(card => [card.paragraph_id, card]));
  const links = [];
  const l4Applications = [];
  const l5Proof = [];
  const errors = [];

  for (const item of mapping.mappings || []) {
    const proposition = propositionById.get(item.proposition_id);
    if (!proposition) {
      errors.push(`${item.proposition_id}:unknown_proposition_id`);
      continue;
    }
    const paragraph = paragraphById.get(proposition.paragraph_id);
    if (!paragraph) errors.push(`${item.proposition_id}:unknown_paragraph_id`);
    if (paragraph && !paragraph.text.includes(proposition.exact_quote)) {
      errors.push(`${item.proposition_id}:exact_quote_not_found`);
    }
    for (const doctrineNodeId of item.target_doctrine_node_ids || []) {
      links.push({
        link_id: `${item.proposition_id}__${doctrineNodeId}`,
        proposition_id: item.proposition_id,
        doctrine_node_id: doctrineNodeId,
        source_tree_node_ids: item.source_tree_node_ids || [],
        link_type: item.link_type || "candidate",
        authority_role: item.authority_role || proposition.authority_role || "unknown",
        significance_label: proposition.significance_label,
        confidence: item.confidence,
        linking_method: item.linking_method || "manual_fixture_mapping",
        review_status: item.review_status || "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        notes: item.notes || "",
        source_visibility: proposition.source_visibility || "public_demo",
        tenant_id: proposition.tenant_id || "public",
      });
    }
    l4Applications.push({
      l4_application_id: `l4_${item.proposition_id}`,
      proposition_id: item.proposition_id,
      case_id: proposition.case_id,
      paragraph_id: proposition.paragraph_id,
      scenario_label: "Bail conditions / surety / flight-risk management",
      application_summary: proposition.proposition_text,
      target_doctrine_node_ids: item.target_doctrine_node_ids || [],
      significance_label: proposition.significance_label,
      authority_role: proposition.authority_role,
      review_status: item.review_status || "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: proposition.source_visibility || "public_demo",
      tenant_id: proposition.tenant_id || "public",
    });
    l5Proof.push({
      l5_proof_id: `l5_${item.proposition_id}`,
      proposition_id: item.proposition_id,
      case_id: proposition.case_id,
      paragraph_id: proposition.paragraph_id,
      para_no: proposition.source_paragraph,
      exact_quote: proposition.exact_quote,
      paragraph_text: paragraph?.text || "",
      chunk_hash: paragraph?.chunk_hash || "",
      quote_verified_against_fixture: Boolean(paragraph && paragraph.text.includes(proposition.exact_quote)),
      review_status: item.review_status || "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: proposition.source_visibility || "public_demo",
      tenant_id: proposition.tenant_id || "public",
    });
  }

  const artifact = {
    artifact_id: "criminal_bail_case_fruits_pilot_artifact_v1",
    generated_at: new Date().toISOString(),
    mapping_id: mapping.mapping_id,
    domain_id: mapping.domain_id,
    status: "fixture_only_candidate_links",
    proposition_node_links: links,
    l4_case_applications: l4Applications,
    l5_paragraph_proof: l5Proof,
    errors,
  };

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "proposition_node_links.json"), JSON.stringify({ proposition_node_links: links }, null, 2));
    fs.writeFileSync(path.join(outputDir, "l4_case_applications.json"), JSON.stringify({ l4_case_applications: l4Applications }, null, 2));
    fs.writeFileSync(path.join(outputDir, "l5_paragraph_proof.json"), JSON.stringify({ l5_paragraph_proof: l5Proof }, null, 2));
    fs.writeFileSync(path.join(outputDir, "case_fruits_artifact.json"), JSON.stringify(artifact, null, 2));
  }
  return artifact;
}

module.exports = {
  buildBailCaseFruitLinks,
};
