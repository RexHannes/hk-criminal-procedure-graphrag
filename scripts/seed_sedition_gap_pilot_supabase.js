#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PILOT_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "tree_gap_pilots",
  "sedition_public_expression_v1",
);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) env[key.trim()] = value;
  }
  return env;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...process.env,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

async function request(ctx, { pathAndQuery, method = "GET", body, ok = [200, 201, 204] }) {
  const response = await fetch(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: ctx.serviceRoleKey,
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!ok.includes(response.status)) {
    const error = new Error(`Supabase HTTP ${response.status} ${method} ${pathAndQuery}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function patchOrInsert(ctx, table, filterColumn, row) {
  const value = row[filterColumn];
  const filter = `${filterColumn}=eq.${encodeURIComponent(value)}`;
  const existing = await request(ctx, {
    pathAndQuery: `${table}?${filter}&select=${encodeURIComponent(filterColumn)}&limit=1`,
    ok: [200],
  });
  if (Array.isArray(existing) && existing.length) {
    await request(ctx, { pathAndQuery: `${table}?${filter}`, method: "PATCH", body: row });
    return "updated";
  }
  await request(ctx, { pathAndQuery: table, method: "POST", body: row });
  return "inserted";
}

function loadPilot() {
  const manifest = readJson(path.join(PILOT_DIR, "source_manifest.json"));
  const paragraphPayload = readJson(path.join(PILOT_DIR, "paragraph_cards.json"));
  const propositionPayload = readJson(path.join(PILOT_DIR, "proposition_cards.json"));
  const linksPayload = readJson(path.join(PILOT_DIR, "proposition_node_links.json"));
  return {
    manifest,
    cases: paragraphPayload.cases || [],
    paragraphs: paragraphPayload.paragraph_cards || [],
    propositions: propositionPayload.proposition_cards || [],
    links: linksPayload.proposition_node_links || [],
  };
}

function loadDoctrineNodes() {
  const payload = readJson(path.join(
    ROOT,
    "data",
    "legal_domain_packs",
    "demo_maps",
    "criminal_law_hk",
    "nodes",
    "09_sedition_public_expression.json",
  ));
  const parentById = {
    "criminal_law_hk.sedition.seditious_intention": "criminal_law_hk.sedition_public_expression",
    "criminal_law_hk.sedition.section10_offences": "criminal_law_hk.sedition_public_expression",
    "criminal_law_hk.sedition.constitutionality_expression": "criminal_law_hk.sedition_public_expression",
    "criminal_law_hk.sedition.meaning_context": "criminal_law_hk.sedition_public_expression",
    "criminal_law_hk.sedition.procedure_jurisdiction": "criminal_law_hk.sedition_public_expression",
    "criminal_law_hk.public_order.expression_offences": "criminal_law_hk.sedition_public_expression",
  };
  return (payload.nodes || []).map(node => ({
    doctrine_node_id: node.doctrine_node_id || `criminal_law_hk.${node.id}`,
    domain_id: "criminal_law_hk",
    parent_doctrine_node_id: parentById[node.doctrine_node_id || `criminal_law_hk.${node.id}`] || null,
    title: node.label || node.id,
    node_type: node.type || "legal_issue",
    section_id: node.section || "09",
    subsection: node.subsection || "",
    subtopic: node.subtopic || "",
    summary: node.summary || "",
    area_of_law: "Substantive Criminal Law",
    topic: "Sedition and Public Expression Offences",
    issue: node.label || "Sedition and Public Expression Offences",
    subissue: node.subsection || "",
    path: `criminal_law_hk.section_09.${node.id}`,
    verification_status: node.verification_status || "needs_source_card_verification",
    answer_layer_status: node.answer_layer_status || "not_product_answer_layer",
    authority_status: node.authority_status || "candidate_tree_seed",
    human_review_status: node.human_review_status || "unreviewed",
    source_file: "data/legal_domain_packs/demo_maps/criminal_law_hk/nodes/09_sedition_public_expression.json",
  }));
}

function assertQuoteIntegrity(pilot) {
  const paragraphById = new Map(pilot.paragraphs.map(item => [item.paragraph_id, item]));
  const errors = [];
  for (const card of pilot.propositions) {
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) errors.push(`${card.proposition_id}:missing_paragraph`);
    else if (!paragraph.text.includes(card.exact_quote)) errors.push(`${card.proposition_id}:quote_not_found`);
    if (card.answer_safe === true || card.review_state === "answer_safe") errors.push(`${card.proposition_id}:answer_safe_forbidden`);
  }
  if (errors.length) throw new Error(`Quote integrity failed: ${errors.join("; ")}`);
}

function buildRows(pilot) {
  const source = pilot.manifest.sources[0];
  return {
    doctrineNodes: loadDoctrineNodes(),
    sourceRegistry: [{
      source_id: source.source_id,
      source_type: "case",
      title: source.case_name,
      jurisdiction: "Hong Kong",
      court: source.court_level || source.court,
      citation: source.neutral_citation,
      source_url: source.source_url_or_path,
      raw_file_uri: null,
      license_status: "public_judgment",
      storage_policy: "public_metadata_public_raw",
      checksum: sha256(`${source.source_id}:${source.neutral_citation}:${source.fetch_url}`),
      ingest_status: "parsed",
      review_status: "lawyer_review_required",
      visibility: "public_source",
      rag_policy: {
        batch_id: pilot.manifest.batch_id,
        source_visibility: "public_demo",
        tenant_id: "public",
        answer_safe_by_default: false,
        human_review_required: true,
        tree_gap_candidate: true
      },
      notes: "Sedition/public-expression tree-gap pilot. NotebookLM proposed branch only; proposition quotes verified from LegalRef.",
    }],
    sourceDocuments: pilot.cases.map(item => ({
      id: item.case_id,
      source_type: item.source_kind || "case_judgment",
      source_url: item.source_url_or_path,
      sha256: sha256(`${item.case_id}:${item.neutral_citation}`),
      raw_text: null,
      parse_status: "parsed",
      rights_note: `${item.licence_status} · public_judgment · ${pilot.manifest.batch_id}`,
    })),
    legalCases: pilot.cases.map(item => ({
      id: item.case_id,
      neutral_citation: item.neutral_citation,
      court: item.court,
      court_code: item.court_level,
      court_level: item.court_level,
      title_en: item.case_name,
      legal_domain: "criminal_law_hk",
      source_url: item.source_url_or_path,
      source_document_id: item.case_id,
      review_status: "lawyer_review_required",
      treatment_warnings: ["tree_gap_candidate"],
      good_law_flags: [],
    })),
    legalParagraphs: pilot.paragraphs.map(paragraph => ({
      id: paragraph.paragraph_id,
      case_id: paragraph.case_id,
      para_no: paragraph.paragraph_no || "",
      heading_path: ["Sedition and Public Expression Offences"],
      text: paragraph.text,
      role_label: "public_judgment_excerpt",
      proposition_type: null,
      source_url: paragraph.source_url,
      extractor_version: "sedition_public_expression_tree_gap_pilot_v1",
      review_status: "quote_verified",
      treatment_warnings: ["candidate_tree_gap_branch"],
      good_law_flags: [],
    })),
    propositionCards: pilot.propositions.map(card => ({
      id: card.proposition_id,
      case_id: card.case_id,
      canonical_para_id: card.paragraph_id,
      proposition_text: card.proposition_text,
      proposition_type: card.authority_role || "applied_principle",
      issue_tags: card.target_doctrine_node_ids || [],
      doctrine_tags: card.tree_node_ids || [],
      confidence: card.confidence === "high" ? 0.88 : card.confidence === "medium" ? 0.65 : 0.35,
      extractor_version: "sedition_public_expression_tree_gap_pilot_v1",
      review_status: "review_required",
      mentioned_cases: [],
      mentioned_statutes: ["Cap 200", "Cap 245"],
    })),
    humanReviewItems: pilot.propositions.map(card => ({
      item_type: "proposition_card",
      item_id: card.proposition_id,
      reason: `Review sedition tree-gap pilot ${card.proposition_id}: ${card.proposition_text}`,
      payload_json: {
        batch_id: pilot.manifest.batch_id,
        neutral_citation: pilot.cases.find(item => item.case_id === card.case_id)?.neutral_citation || "",
        exact_quote: card.exact_quote,
        target_doctrine_node_ids: card.target_doctrine_node_ids || [],
        promote_answer_safe: false,
        source_url: card.source_url,
        tree_gap_candidate: true,
      },
      status: "open",
    })),
    propositionNodeLinks: pilot.links.map(link => ({
      proposition_id: link.proposition_id,
      doctrine_node_id: link.doctrine_node_id,
      link_type: link.link_type || "candidate",
      confidence: typeof link.confidence === "number" ? link.confidence : 0.65,
      linking_method: link.linking_method || "notebooklm_tree_proposal_plus_legalref_exact_quote_v1",
      linking_notes: JSON.stringify({
        notes: link.notes || "",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        source_visibility: link.source_visibility || "public_demo",
      }),
      review_status: "machine_candidate",
    })),
  };
}

async function main() {
  const env = loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const pilot = loadPilot();
  assertQuoteIntegrity(pilot);
  const rows = buildRows(pilot);
  const report = {
    batch_id: pilot.manifest.batch_id,
    dry_run: dryRun,
    counts: {
      doctrine_nodes: rows.doctrineNodes.length,
      source_registry: rows.sourceRegistry.length,
      source_documents: rows.sourceDocuments.length,
      legal_cases: rows.legalCases.length,
      legal_paragraphs: rows.legalParagraphs.length,
      proposition_cards: rows.propositionCards.length,
      human_review_items: rows.humanReviewItems.length,
      proposition_node_links: rows.propositionNodeLinks.length,
    },
    review_policy: "machine_candidate_only_no_answer_safe_promotion",
  };
  if (dryRun) {
    report.status = "dry_run_ready";
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const ctx = { supabaseUrl, serviceRoleKey };
  for (const row of rows.doctrineNodes) await patchOrInsert(ctx, "doctrine_nodes", "doctrine_node_id", row);
  for (const row of rows.sourceRegistry) await patchOrInsert(ctx, "source_registry", "source_id", row);
  for (const row of rows.sourceDocuments) await patchOrInsert(ctx, "source_documents", "id", row);
  for (const row of rows.legalCases) await patchOrInsert(ctx, "legal_cases", "id", row);
  for (const row of rows.legalParagraphs) await patchOrInsert(ctx, "legal_paragraphs", "id", row);
  for (const row of rows.propositionCards) await patchOrInsert(ctx, "proposition_cards", "id", row);
  for (const row of rows.humanReviewItems) await patchOrInsert(ctx, "human_review_items", "item_id", row);
  for (const row of rows.propositionNodeLinks) {
    const filter = [
      `proposition_id=eq.${encodeURIComponent(row.proposition_id)}`,
      `doctrine_node_id=eq.${encodeURIComponent(row.doctrine_node_id)}`,
      `link_type=eq.${encodeURIComponent(row.link_type)}`,
    ].join("&");
    const existing = await request(ctx, { pathAndQuery: `proposition_node_links?${filter}&select=id&limit=1`, ok: [200] });
    if (Array.isArray(existing) && existing.length) await request(ctx, { pathAndQuery: `proposition_node_links?${filter}`, method: "PATCH", body: row });
    else await request(ctx, { pathAndQuery: "proposition_node_links", method: "POST", body: row });
  }
  report.status = "seeded";
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
  process.exit(1);
});
