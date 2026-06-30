#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BATCH = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_procedure_hk");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function doctrineNodeIdFor(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function collectDoctrineIds() {
  const manifest = readJson(path.join(DOMAIN_DIR, "consolidated.json"));
  const ids = new Set();
  for (const section of manifest.sections || []) {
    const payload = readJson(path.join(DOMAIN_DIR, section.node_file));
    for (const node of payload.nodes || []) ids.add(doctrineNodeIdFor(node, "criminal_procedure_hk"));
  }
  return ids;
}

const errors = [];
function assert(condition, message) {
  if (!condition) errors.push(message);
}

const manifest = readJson(path.join(BATCH, "source_manifest.json"));
const paragraphPayload = readJson(path.join(BATCH, "paragraph_cards.json"));
const propositionPayload = readJson(path.join(BATCH, "proposition_cards.json"));
const linksPayload = readJson(path.join(BATCH, "proposition_node_links.json"));
const l4Payload = readJson(path.join(BATCH, "l4_case_applications.json"));
const l5Payload = readJson(path.join(BATCH, "l5_paragraph_proof.json"));
const report = readJson(path.join(BATCH, "parse_report.json"));
const doctrineIds = collectDoctrineIds();
const paragraphs = paragraphPayload.paragraph_cards || [];
const propositions = propositionPayload.proposition_cards || [];
const links = linksPayload.proposition_node_links || [];
const l4 = l4Payload.l4_case_applications || [];
const l5 = l5Payload.l5_paragraph_proof || [];
const paragraphById = new Map(paragraphs.map(item => [item.paragraph_id, item]));
const propositionById = new Map(propositions.map(item => [item.proposition_id, item]));

assert(manifest.scope === "bail_only", "batch must remain bail_only");
assert(manifest.source_policy?.public_sources_only === true, "batch must be public-source only");
assert(manifest.source_policy?.private_or_licensed_sources_allowed === false, "private/licensed sources must be blocked");
assert(manifest.source_policy?.bulk_auto_attach_allowed === false, "bulk auto attach must be blocked");
assert(manifest.scale_policy?.large_cross_domain_crawl_allowed === false, "large cross-domain crawl must remain blocked");
assert(manifest.scale_policy?.requires_review_before_next_rung === true, "next scale rung must require review first");
assert((manifest.sources || []).length <= (manifest.scale_policy?.max_sources_without_force || 50), "source count exceeds gated scale policy");
assert(report.proposition_count >= 3, "expected at least three quote-verified propositions");
assert(report.rejected_count === 0, "no extraction rule should be silently rejected in the committed batch");
assert(paragraphs.length >= 3, "expected paragraph cards");
assert(propositions.length >= 3, "expected proposition cards");
assert(links.length >= propositions.length, "expected doctrine links");
assert(l4.length === propositions.length, "L4 applications should align with proposition cards");
assert(l5.length === propositions.length, "L5 proof cards should align with proposition cards");

for (const source of manifest.sources || []) {
  assert(source.source_visibility === "public_demo", `${source.source_id}: source_visibility must be public_demo`);
  assert(source.tenant_id === "public", `${source.source_id}: tenant must be public`);
  assert(source.licence_status === "public_judgment", `${source.source_id}: source must be public_judgment`);
  assert(!/private|licensed_book|firm/i.test(`${source.source_kind} ${source.licence_status} ${source.source_url_or_path}`), `${source.source_id}: private/licensed marker not allowed`);
}

for (const paragraph of paragraphs) {
  assert(paragraph.source_visibility === "public_demo", `${paragraph.paragraph_id}: paragraph must be public_demo`);
  assert(paragraph.tenant_id === "public", `${paragraph.paragraph_id}: paragraph tenant must be public`);
  assert(/^[0-9a-f]{64}$/.test(paragraph.chunk_hash || ""), `${paragraph.paragraph_id}: invalid chunk hash`);
  assert(!/fixture:\/\/|not_real_authority/i.test(`${paragraph.source_url || ""} ${paragraph.authority_status || ""}`), `${paragraph.paragraph_id}: public batch cannot be synthetic fixture`);
}

for (const proposition of propositions) {
  const paragraph = paragraphById.get(proposition.paragraph_id);
  const isAnswerSafe = proposition.answer_safe === true || proposition.review_state === "answer_safe" || proposition.answer_layer_status === "answer_safe";
  const isGold = proposition.gold_set_member === true || isAnswerSafe;
  assert(paragraph, `${proposition.proposition_id}: missing paragraph`);
  assert(paragraph && paragraph.text.includes(proposition.exact_quote), `${proposition.proposition_id}: exact quote not found in paragraph`);
  if (isAnswerSafe) {
    assert(proposition.review_status === "approved", `${proposition.proposition_id}: answer_safe requires approved review_status`);
    assert(proposition.verification_status === "source_verified", `${proposition.proposition_id}: answer_safe requires source_verified`);
    assert(proposition.human_review_required === false, `${proposition.proposition_id}: answer_safe should not require further human review`);
    assert(Boolean(proposition.reviewed_by), `${proposition.proposition_id}: answer_safe requires reviewed_by`);
    assert(Boolean(proposition.review_note), `${proposition.proposition_id}: answer_safe requires review_note`);
    assert(Boolean(proposition.citation && proposition.pinpoint && proposition.supporting_quote), `${proposition.proposition_id}: answer_safe requires citation, pinpoint and supporting_quote`);
    assert(paragraph && paragraph.text.includes(proposition.supporting_quote), `${proposition.proposition_id}: supporting_quote not found in paragraph`);
  } else if (!isGold) {
    assert(proposition.review_state === "machine_candidate", `${proposition.proposition_id}: must remain machine_candidate unless answer_safe reviewed`);
    assert(proposition.answer_safe === false, `${proposition.proposition_id}: must not be answer_safe without review`);
    assert(proposition.human_review_required === true, `${proposition.proposition_id}: must require human review unless answer_safe reviewed`);
  }
  assert(proposition.source_visibility === "public_demo", `${proposition.proposition_id}: must be public_demo`);
  assert(proposition.tenant_id === "public", `${proposition.proposition_id}: tenant must be public`);
  assert(Array.isArray(proposition.target_doctrine_node_ids) && proposition.target_doctrine_node_ids.length > 0, `${proposition.proposition_id}: missing target doctrine nodes`);
  for (const doctrineNodeId of proposition.target_doctrine_node_ids || []) {
    assert(doctrineIds.has(doctrineNodeId), `${proposition.proposition_id}: unknown doctrine node ${doctrineNodeId}`);
  }
}

const manifestAllow = new Set(manifest.target_doctrine_node_ids || []);
if (manifestAllow.size) {
  for (const proposition of propositions) {
    for (const doctrineNodeId of proposition.target_doctrine_node_ids || []) {
      assert(manifestAllow.has(doctrineNodeId), `${proposition.proposition_id}: doctrine node ${doctrineNodeId} outside manifest allow-list`);
    }
  }
}

for (const link of links) {
  assert(propositionById.has(link.proposition_id), `${link.link_id}: unknown proposition`);
  assert(doctrineIds.has(link.doctrine_node_id), `${link.link_id}: unknown doctrine node`);
  assert(link.review_status === "machine_candidate", `${link.link_id}: link must be machine_candidate`);
  assert(link.answer_layer_status === "candidate_only", `${link.link_id}: link must be candidate_only`);
  assert(link.human_review_required === true, `${link.link_id}: link must require human review`);
  assert(link.source_visibility === "public_demo" && link.tenant_id === "public", `${link.link_id}: source visibility/tenant mismatch`);
}

for (const proof of l5) {
  assert(propositionById.has(proof.proposition_id), `${proof.l5_proof_id}: unknown proposition`);
  assert(proof.quote_verified_against_source === true, `${proof.l5_proof_id}: quote must be source-verified`);
  assert(proof.paragraph_text.includes(proof.exact_quote), `${proof.l5_proof_id}: exact quote missing from proof paragraph`);
  assert(proof.answer_layer_status === "candidate_only", `${proof.l5_proof_id}: proof must be candidate_only`);
  assert(proof.review_status === "machine_candidate", `${proof.l5_proof_id}: proof must be machine_candidate`);
}

if (errors.length) {
  console.error("Public bail batch validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Public bail batch validation passed.");
