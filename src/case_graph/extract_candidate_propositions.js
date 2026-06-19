const fs = require("fs");
const path = require("path");
const { propositionCard, validatePropositionCard } = require("./proposition_card_schema");

function extractCandidatePropositions({ fixturePath, paragraphArtifactPath, outputPath, llmProvider = process.env.CASE_GRAPH_LLM_PROVIDER || "none" } = {}) {
  if (!fixturePath) throw new Error("fixturePath required");
  if (llmProvider !== "none") {
    throw new Error("case_graph_llm_disabled_by_default");
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const paragraphArtifact = paragraphArtifactPath && fs.existsSync(paragraphArtifactPath)
    ? JSON.parse(fs.readFileSync(paragraphArtifactPath, "utf8"))
    : { paragraph_cards: [] };
  const paragraphById = new Map((paragraphArtifact.paragraph_cards || []).map(paragraph => [paragraph.paragraph_id, paragraph]));
  const propositionCards = [];
  const errors = [];

  for (const rawCase of fixture.cases || []) {
    for (const rawParagraph of rawCase.paragraphs || []) {
      const paragraphId = `${rawCase.case_id}_p${rawParagraph.paragraph_no}`;
      for (const rawProposition of rawParagraph.candidate_propositions || []) {
        const card = propositionCard({
          ...rawProposition,
          case_id: rawCase.case_id,
          paragraph_id: paragraphId,
          source_paragraph: rawParagraph.paragraph_no,
          source_visibility: rawCase.source_visibility,
          tenant_id: rawCase.tenant_id,
          fixture_status: rawCase.fixture_status,
          authority_status: rawCase.authority_status,
          review_state: "machine_candidate",
          human_review_required: true,
        });
        errors.push(...validatePropositionCard(card, paragraphById).map(error => `${card.proposition_id}:${error}`));
        propositionCards.push(card);
      }
    }
  }

  const result = {
    artifact_id: "criminal_evidence_candidate_proposition_cards_v1",
    generated_at: new Date().toISOString(),
    fixture_set_id: fixture.fixture_set_id,
    llm_provider: llmProvider,
    proposition_count: propositionCards.length,
    proposition_cards: propositionCards,
    errors,
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
  return result;
}

module.exports = {
  extractCandidatePropositions,
};
