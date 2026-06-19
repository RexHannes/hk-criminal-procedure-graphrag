#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERTICAL_PATH = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");
const OUT_PATH = path.join(ROOT, "data", "legal_ingest", "corpus", "public_corpus_manifest.generated.json");

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || "missing";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function buildManifest(vertical) {
  const sources = vertical.source_registry || [];
  const paragraphs = vertical.legal_paragraphs || [];
  const propositions = vertical.proposition_cards || [];
  const forms = vertical.form_metadata || [];
  return {
    manifest_id: "hk_public_demo_corpus_manifest_v1",
    generated_at: new Date().toISOString(),
    scope: "public_demo_only",
    status: "pilot_not_production_corpus",
    vertical_id: vertical.vertical_id,
    source_counts: {
      sources: sources.length,
      cases: sources.filter(source => source.source_type === "case").length,
      legislation: sources.filter(source => source.source_type === "legislation").length,
      practice_directions: sources.filter(source => source.source_type === "practice_direction").length,
      legal_paragraphs: paragraphs.length,
      proposition_cards: propositions.length,
      form_metadata: forms.length,
      answer_safe_propositions: propositions.filter(card => card.answer_layer_status === "answer_safe").length,
    },
    visibility_counts: countBy(sources, source => source.source_visibility || source.visibility),
    tenant_counts: countBy(sources, source => source.tenant_id || "missing"),
    review_counts: countBy(propositions, card => card.verification_status || card.review_status),
    corpus_gaps: [
      "large_public_case_corpus_not_ingested",
      "legislation_and_rules_not_ingested",
      "practice_directions_not_ingested",
      "answer_safe_review_not_complete",
      "criminal_law_corpus_not_indexed",
    ],
    private_source_policy: "private/client/licensed materials are excluded from this manifest",
    source_ids: sources.map(source => source.source_id),
  };
}

if (require.main === module) {
  const vertical = JSON.parse(fs.readFileSync(VERTICAL_PATH, "utf8"));
  const manifest = buildManifest(vertical);
  const outPath = process.argv.includes("--write")
    ? OUT_PATH
    : "";
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  }
  console.log(JSON.stringify(manifest, null, 2));
}

module.exports = { buildManifest };
