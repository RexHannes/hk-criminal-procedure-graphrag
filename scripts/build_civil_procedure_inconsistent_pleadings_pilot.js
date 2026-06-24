#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERTICAL_PATH = path.join(ROOT, "data", "legal_ingest", "verticals", "inconsistent_pleadings.json");
const OUT_DIR = path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "civil_procedure_inconsistent_pleadings_v1");

const NODE_MAP = {
  abuse_of_process: ["civil_procedure_hk.abuse_process.inconsistent_positions"],
  inconsistent_positions: ["civil_procedure_hk.abuse_process.inconsistent_positions"],
  estoppel: ["civil_procedure_hk.estoppel.res_judicata"],
  diametrically_opposed_positions: ["civil_procedure_hk.abuse_process.diametrically_opposed_positions"],
  integrity_of_justice: ["civil_procedure_hk.abuse_process.diametrically_opposed_positions"],
  alternative_pleading: ["civil_procedure_hk.pleadings.alternative_cases_within_knowledge"],
  party_knowledge: ["civil_procedure_hk.pleadings.alternative_cases_within_knowledge"],
  inconsistent_cases: ["civil_procedure_hk.pleadings.alternative_cases_within_knowledge"],
  summary_judgment: ["civil_procedure_hk.summary_judgment.pleaded_case_verification"],
  pleaded_case: ["civil_procedure_hk.summary_judgment.pleaded_case_verification"],
  material_deviation: ["civil_procedure_hk.summary_judgment.pleaded_case_verification"],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(name, value) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function targetNodesFor(card) {
  const out = new Set();
  for (const tag of card.issue_tags || []) {
    for (const nodeId of NODE_MAP[tag] || []) out.add(nodeId);
  }
  return [...out];
}

function caseIdFromSource(sourceId) {
  return sourceId;
}

function caseRecord(source) {
  return {
    case_id: caseIdFromSource(source.source_id),
    case_name: source.title,
    neutral_citation: source.citation,
    law_report_citation: "",
    court: source.court,
    court_level: source.court,
    date: "",
    source_url_or_path: source.source_url,
    source_visibility: source.source_visibility || "public_demo",
    tenant_id: source.tenant_id || "public",
    source_kind: "case_judgment",
    licence_status: source.license_status,
    ingestion_status: "paragraphized",
    fixture_status: "real_public_source_tree_gap_pilot",
    authority_status: "real_public_authority_candidate",
  };
}

function main() {
  const vertical = readJson(VERTICAL_PATH);
  const sourceById = new Map((vertical.source_registry || []).map(item => [item.source_id, item]));
  const paragraphById = new Map((vertical.legal_paragraphs || []).map(item => [item.paragraph_id, item]));
  const paragraphCards = [];
  const propositionCards = [];
  const links = [];
  const l4 = [];
  const l5 = [];
  const reviewItems = [];
  const rejected = [];
  const usedCaseIds = new Set();
  const usedParagraphIds = new Set();

  for (const card of vertical.proposition_cards || []) {
    const paragraph = paragraphById.get(card.paragraph_id);
    const source = sourceById.get(card.source_id);
    const targetNodeIds = targetNodesFor(card);
    const quote = String(card.supporting_quote || "");
    const paragraphText = String(paragraph?.paragraph_text || "");
    const paraNo = String(paragraph?.para_no || "");

    if (!source) {
      rejected.push({ proposition_id: card.proposition_id, reason: "source_missing" });
      continue;
    }
    if (!paragraph) {
      rejected.push({ proposition_id: card.proposition_id, reason: "paragraph_missing" });
      continue;
    }
    if (!paraNo || /pending/i.test(paraNo)) {
      rejected.push({ proposition_id: card.proposition_id, reason: "paragraph_pinpoint_pending" });
      continue;
    }
    if (card.verification_status !== "quote_verified") {
      rejected.push({ proposition_id: card.proposition_id, reason: "not_quote_verified" });
      continue;
    }
    if (!quote || !paragraphText.includes(quote)) {
      rejected.push({ proposition_id: card.proposition_id, reason: "exact_quote_not_found" });
      continue;
    }
    if (!targetNodeIds.length) {
      rejected.push({ proposition_id: card.proposition_id, reason: "no_target_doctrine_node" });
      continue;
    }

    usedCaseIds.add(source.source_id);
    if (!usedParagraphIds.has(card.paragraph_id)) {
      usedParagraphIds.add(card.paragraph_id);
      paragraphCards.push({
        paragraph_id: card.paragraph_id,
        case_id: caseIdFromSource(source.source_id),
        paragraph_no: paraNo,
        text: paragraphText,
        chunk_hash: sha256(`${source.source_id}:${paraNo}:${paragraphText}`),
        source_url: source.source_url,
        source_visibility: "public_demo",
        tenant_id: "public",
        fixture_status: "real_public_source_tree_gap_pilot",
        authority_status: "real_public_authority_candidate",
      });
    }

    propositionCards.push({
      proposition_id: card.proposition_id,
      case_id: caseIdFromSource(source.source_id),
      paragraph_id: card.paragraph_id,
      source_paragraph: paraNo,
      exact_quote: quote,
      proposition_text: card.proposition_text,
      tree_node_ids: targetNodeIds,
      target_doctrine_node_ids: targetNodeIds,
      significance_label: (card.issue_tags || []).includes("summary_judgment") ? "procedural_consequence" : "states_rule",
      authority_role: card.authority_role || "applied_principle",
      confidence: card.confidence || "medium",
      review_state: "machine_candidate",
      answer_safe: false,
      human_review_required: true,
      source_visibility: "public_demo",
      tenant_id: "public",
      fixture_status: "real_public_source_tree_gap_pilot",
      authority_status: "real_public_authority_candidate",
      source_url: source.source_url,
    });

    for (const nodeId of targetNodeIds) {
      links.push({
        link_id: `${card.proposition_id}__${nodeId}`,
        proposition_id: card.proposition_id,
        doctrine_node_id: nodeId,
        link_type: "candidate",
        authority_role: card.authority_role || "applied_principle",
        significance_label: (card.issue_tags || []).includes("summary_judgment") ? "procedural_consequence" : "states_rule",
        confidence: 0.72,
        linking_method: "inconsistent_pleadings_vertical_exact_quote_v1",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        notes: "Built from quote-verified public inconsistent-pleadings vertical; no answer-safe promotion.",
        source_visibility: "public_demo",
        tenant_id: "public",
      });
    }

    l4.push({
      l4_application_id: `${card.proposition_id}_application`,
      proposition_id: card.proposition_id,
      case_id: caseIdFromSource(source.source_id),
      case_name: source.title,
      neutral_citation: source.citation,
      application_summary: card.proposition_text,
      significance_label: (card.issue_tags || []).includes("summary_judgment") ? "procedural_consequence" : "states_rule",
      authority_role: card.authority_role || "applied_principle",
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
    });

    l5.push({
      l5_proof_id: `${card.proposition_id}_proof`,
      proposition_id: card.proposition_id,
      case_id: caseIdFromSource(source.source_id),
      paragraph_id: card.paragraph_id,
      para_no: paraNo,
      exact_quote: quote,
      paragraph_text: paragraphText,
      source_url: source.source_url,
      quote_validation_status: "exact_quote_found_in_public_paragraph",
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
    });

    reviewItems.push({
      review_item_id: `review_${card.proposition_id}`,
      item_type: "proposition_card",
      item_id: card.proposition_id,
      status: "open",
      review_status: "machine_candidate",
      human_review_required: true,
      payload_json: {
        case_id: caseIdFromSource(source.source_id),
        neutral_citation: source.citation,
        paragraph_id: card.paragraph_id,
        paragraph_no: paraNo,
        exact_quote: quote,
        proposition_text: card.proposition_text,
        target_doctrine_node_ids: targetNodeIds,
      },
    });
  }

  const usedSources = (vertical.source_registry || []).filter(source => usedCaseIds.has(source.source_id));
  const manifest = {
    batch_id: "civil_procedure_inconsistent_pleadings_tree_gap_pilot_v1",
    domain_id: "civil_procedure_hk",
    scope: "inconsistent_pleadings_abuse_estoppel_candidate_branch",
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
    },
    sources: usedSources.map(source => ({
      source_id: source.source_id,
      case_id: caseIdFromSource(source.source_id),
      case_name: source.title,
      neutral_citation: source.citation,
      court: source.court,
      court_level: source.court,
      date: "",
      source_kind: "case_judgment",
      source_visibility: "public_demo",
      tenant_id: "public",
      licence_status: "public_judgment",
      source_url_or_path: source.source_url,
      fetch_url: source.source_url,
      source_format: "stored_public_vertical_paragraph",
      ingestion_status: "source_candidate",
      authority_status: "real_public_authority_candidate",
    })),
    tree_gap_resolution: {
      existing_tree_match: "new_domain_pack_candidate_created",
      tree_proposal_source: "inconsistent_pleadings_public_vertical",
      tree_proposal_status: "candidate_only",
      verification_gate: "stored_public_vertical_exact_quote_only",
    },
  };

  const casesPayload = {
    cases: usedSources.map(caseRecord),
    paragraph_cards: paragraphCards,
  };
  const report = {
    artifact_id: "civil_procedure_inconsistent_pleadings_tree_gap_pilot_v1",
    generated_at: new Date().toISOString(),
    batch_id: manifest.batch_id,
    source_count: usedSources.length,
    paragraph_count: paragraphCards.length,
    proposition_count: propositionCards.length,
    link_count: links.length,
    review_item_count: reviewItems.length,
    rejected_count: rejected.length,
    rejected,
    status: rejected.length ? "built_with_rejections" : "built_quote_verified_candidate",
    rejected_policy_note: "DP World/Henderson pending-pinpoint card is expected to be rejected until exact paragraph proof is added.",
  };

  writeJson("source_manifest.json", manifest);
  writeJson("paragraph_cards.json", casesPayload);
  writeJson("proposition_cards.json", { proposition_cards: propositionCards });
  writeJson("proposition_node_links.json", { proposition_node_links: links });
  writeJson("l4_case_applications.json", { l4_case_applications: l4 });
  writeJson("l5_paragraph_proof.json", { l5_paragraph_proof: l5 });
  writeJson("review_queue.json", { review_items: reviewItems });
  writeJson("case_fruits_artifact.json", {
    artifact_id: "civil_procedure_inconsistent_pleadings_case_fruits_v1",
    source_manifest: "source_manifest.json",
    paragraph_cards: "paragraph_cards.json",
    proposition_cards: "proposition_cards.json",
    proposition_node_links: "proposition_node_links.json",
    l4_case_applications: "l4_case_applications.json",
    l5_paragraph_proof: "l5_paragraph_proof.json",
    review_queue: "review_queue.json",
    status: "candidate_only_requires_review",
  });
  writeJson("parse_report.json", report);
  console.log(JSON.stringify(report, null, 2));
  if (propositionCards.length < 5 || report.rejected_count > 1) process.exit(1);
}

main();
