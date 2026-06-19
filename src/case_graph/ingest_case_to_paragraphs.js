const fs = require("fs");
const path = require("path");
const { caseCard, paragraphCard, validateCaseCard, validateParagraphCard } = require("./case_card_schema");

function loadCaseFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ingestCasesToParagraphs({ fixturePath, outputPath } = {}) {
  if (!fixturePath) throw new Error("fixturePath required");
  const fixture = loadCaseFixture(fixturePath);
  const errors = [];
  const cases = [];
  const paragraphs = [];

  for (const rawCase of fixture.cases || []) {
    const card = caseCard(rawCase);
    errors.push(...validateCaseCard(card).map(error => `${card.case_id}:${error}`));
    cases.push(card);
    for (const rawParagraph of rawCase.paragraphs || []) {
      const paragraph = paragraphCard({
        ...rawParagraph,
        case_id: card.case_id,
        source_visibility: card.source_visibility,
        tenant_id: card.tenant_id,
        fixture_status: card.fixture_status,
        authority_status: card.authority_status,
      });
      errors.push(...validateParagraphCard(paragraph).map(error => `${paragraph.paragraph_id}:${error}`));
      paragraphs.push(paragraph);
    }
  }

  const result = {
    artifact_id: "criminal_evidence_paragraph_cards_v1",
    generated_at: new Date().toISOString(),
    fixture_set_id: fixture.fixture_set_id,
    fixture_warning: fixture.fixture_warning,
    case_count: cases.length,
    paragraph_count: paragraphs.length,
    cases,
    paragraph_cards: paragraphs,
    errors,
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
  return result;
}

module.exports = {
  ingestCasesToParagraphs,
  loadCaseFixture,
};
