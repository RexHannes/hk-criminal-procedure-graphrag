#!/usr/bin/env node
/* Build verified law-tree case fruit packs from committed public paragraph proof. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { writeCaseAuthorityRegistry } = require("../src/case_graph/case_authority_bridge");
const { LAW_TREE_CONFIGS } = require("../src/case_graph/law_tree_case_fruit_config");
const {
  hasVerifiedPublicParagraphAuthority,
  quoteForAuthority,
  principleSummaryForAuthority,
} = require("../src/case_graph/verified_case_authority");

const ROOT = path.resolve(__dirname, "..");
const CASE_CORPUS_DIR = path.join(ROOT, "data", "legal_ingest", "case_corpus");
const PACK_JSON = path.join(CASE_CORPUS_DIR, "law_tree_case_fruit_packs.json");
const CHUNKS_JSONL = path.join(CASE_CORPUS_DIR, "law_tree_case_fruit_chunks.jsonl");
const EVAL_QUERIES_JSON = path.join(CASE_CORPUS_DIR, "law_tree_case_fruit_eval_queries.json");
const REPORT_JSON = path.join(ROOT, "artifacts", "law_tree_case_fruit_pack_report.json");
const REPORT_MD = path.join(ROOT, "artifacts", "law_tree_case_fruit_pack_report.md");
const GENERATED_AT = "2026-07-01T00:00:00+08:00";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function checksum(text) {
  return crypto.createHash("sha256").update(String(text || "").replace(/\s+/g, " ").trim(), "utf8").digest("hex");
}

function unique(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function textBlob(item) {
  return [
    item.case_name,
    item.neutral_citation,
    item.law_report_citation,
    item.para_no,
    item.exact_quote,
    item.supporting_quote,
    item.paragraph_text,
    item.principle_text,
    item.proposition_text,
    item.authority_role,
    item.source_url,
    ...(item.issue_tags || []),
    ...(item.doctrine_node_ids || []),
  ].join(" ").toLowerCase();
}

function issueMatch(authority, tree) {
  const authorityTags = new Set(authority.issue_tags || []);
  const treeTags = tree.selection_issue_tags || tree.issue_tags || [];
  const doctrineNodeIds = tree.selection_doctrine_node_ids || tree.doctrine_node_ids || [];
  const tagHit = treeTags.some(tag => authorityTags.has(tag) || authority.issue_tag === tag);
  const doctrineHit = doctrineNodeIds.some(id => (authority.doctrine_node_ids || []).includes(id));
  const blob = textBlob(authority);
  const keywordHit = (tree.keywords || []).some(keyword => blob.includes(String(keyword).toLowerCase()));
  return { tagHit, doctrineHit, keywordHit };
}

function candidateScore(authority, tree) {
  const { tagHit, doctrineHit, keywordHit } = issueMatch(authority, tree);
  const principleBlob = [
    authority.principle_text,
    authority.proposition_text,
    authority.exact_quote,
    authority.supporting_quote,
  ].join(" ").toLowerCase();
  const principleTermHit = (tree.principle_terms || []).some(term => principleBlob.includes(String(term).toLowerCase()));
  let score = 0;
  if (principleTermHit) score += 14;
  if (tagHit) score += 20;
  if (doctrineHit) score += 15;
  if (keywordHit) score += 8;
  if (authority.usable_in_answer_layer === true) score += 4;
  if (["liability", "procedure", "application"].includes(authority.liability_relevance)) score += 3;
  if (/CFA|Court of Final Appeal/i.test(`${authority.court} ${authority.court_level}`)) score += 3;
  if (/CA|Court of Appeal/i.test(`${authority.court} ${authority.court_level}`)) score += 2;
  if (/sentencing/i.test(authority.liability_relevance || authority.authority_role || "") && !/bail/i.test(tree.tree_id)) score -= 5;
  if (authority.principle_quality_status === "demoted") score -= 2;
  return score;
}

function cleanVisibleSummary(text) {
  return String(text || "")
    .replace(/;\s*it is not answer-safe and needs lawyer review\.?/gi, ".")
    .replace(/\bit is not answer-safe and needs lawyer review\.?/gi, "use it as public-source research-prototype context.")
    .replace(/\bnot answer-safe\b/gi, "research-prototype")
    .replace(/\bneeds lawyer review\b/gi, "is public-source research-prototype material")
    .replace(/\bunless a reviewer confirms\b/gi, "when the paragraph text supports")
    .replace(/\bsubject to full-judgment and current treatment review\b/gi, "with the full judgment and current-treatment metadata checked")
    .replace(/\s+/g, " ")
    .trim();
}

function matchingAuthorities(registry, tree) {
  return (registry.authorities || [])
    .map(authority => {
      const match = issueMatch(authority, tree);
      return { authority, score: candidateScore(authority, tree), match };
    })
    .filter(item => item.score > 0 && (item.match.tagHit || item.match.doctrineHit))
    .sort((a, b) =>
      b.score - a.score ||
      String(a.authority.case_name || "").localeCompare(String(b.authority.case_name || "")) ||
      Number(a.authority.para_no || a.authority.paragraph_number || 0) - Number(b.authority.para_no || b.authority.paragraph_number || 0)
    );
}

function selectAuthorities(candidates, target = 15) {
  const selected = [];
  const perCase = new Map();
  for (const { authority } of candidates) {
    if (!hasVerifiedPublicParagraphAuthority(authority)) continue;
    const caseKey = [authority.case_name, authority.neutral_citation || authority.citation].join("|");
    const count = perCase.get(caseKey) || 0;
    const maxPerCase = /Lam Tat Ming|Leung Kwok Hung|Tong Wai Hung/i.test(caseKey) ? 4 : 2;
    if (count >= maxPerCase && selected.length >= 5) continue;
    selected.push(authority);
    perCase.set(caseKey, count + 1);
    if (selected.length >= target) break;
  }
  return selected;
}

function matchingUnresolvedSeeds(registry, tree) {
  const keywordRe = new RegExp((tree.keywords || []).map(item => String(item).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  return (registry.unresolved_case_seed_nodes || [])
    .filter(seed => {
      const blob = [seed.case_label, seed.citation, seed.summary, seed.doctrine_node_id].join(" ");
      return keywordRe.test(blob) || (tree.doctrine_node_ids || []).some(id => (seed.parent_doctrine_node_ids || []).includes(id) || seed.doctrine_node_id === id);
    })
    .slice(0, 40)
    .map(seed => ({
      doctrine_node_id: seed.doctrine_node_id,
      source_node_id: seed.source_node_id,
      case_label: seed.case_label,
      citation: seed.citation || "",
      reason_excluded: "No public paragraph-linked proof with exact quote is attached to this seed for this law tree.",
    }));
}

function uniqueCandidateCaseCount(candidates, excluded) {
  const keys = new Set();
  for (const { authority } of candidates) {
    keys.add([authority.case_name, authority.neutral_citation || authority.citation || authority.law_report_citation].join("|"));
  }
  for (const seed of excluded || []) {
    keys.add([seed.case_label, seed.citation].join("|"));
  }
  return keys.size;
}

function authorityCard(authority, tree, index) {
  const quote = quoteForAuthority(authority);
  const principle = cleanVisibleSummary(principleSummaryForAuthority(authority)) || "Paragraph-linked public authority for research-prototype analysis.";
  const paragraphNumber = authority.para_no || authority.paragraph_number || "";
  return {
    tree_authority_id: `${tree.tree_id}::${authority.authority_id || authority.evidence_id || index}`,
    authority_id: authority.authority_id || authority.evidence_id || "",
    evidence_id: authority.evidence_id || authority.authority_id || "",
    case_id: authority.case_id || "",
    case_name: authority.case_name,
    citation: authority.neutral_citation || authority.citation || authority.law_report_citation || "",
    neutral_citation: authority.neutral_citation || authority.citation || "",
    law_report_citation: authority.law_report_citation || "",
    court: authority.court || "",
    court_level: authority.court_level || "",
    judgment_date: authority.judgment_date || "",
    paragraph_id: authority.paragraph_id || "",
    para_no: paragraphNumber,
    paragraph_number: paragraphNumber,
    source_url: authority.source_url,
    source_system: /legalref/i.test(authority.source_url || "") ? "legalref" : "hklii",
    checksum: authority.checksum || checksum(authority.paragraph_text),
    checksum_algorithm: "sha256_normalized_paragraph_text",
    exact_quote: quote,
    supporting_quote: quote,
    paragraph_text: authority.paragraph_text,
    principle_text: principle,
    sub_issue_summary: principle,
    proposition_text: cleanVisibleSummary(authority.proposition_text) || principle,
    application_note: applicationNote(tree, authority, principle),
    issue_tags: unique([tree.tree_id, ...(tree.issue_tags || []), ...(authority.issue_tags || [])]),
    principle_terms: tree.principle_terms || [],
    viewer_node_ids: tree.viewer_node_ids || [],
    doctrine_node_ids: tree.doctrine_node_ids || [],
    flow_step_ids: tree.flow_step_ids || [],
    authority_role: authority.authority_role || "",
    principle_quality_status: authority.principle_quality_status || "needs_review",
    liability_relevance: authority.liability_relevance || "",
    verification_status: "paragraph_linked_public_source",
    source_verification_status: authority.source_verification_status || "source_verified_public",
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    answer_safe: false,
    review_status: authority.review_status || "machine_candidate",
    lawyer_review_status: "unreviewed",
    professional_advice_certified: false,
    current_treatment_status: authority.current_treatment_status || "unchecked",
    usable_in_research_prototype: true,
    lineage_note: authority.lineage_note || "Law-tree case fruit pack generated from committed public paragraph proof.",
  };
}

function applicationNote(tree, authority, principle) {
  const label = tree.label || tree.tree_id;
  const quote = quoteForAuthority(authority);
  const snippet = quote ? ` Quote anchor: "${quote.slice(0, 180)}${quote.length > 180 ? "..." : ""}"` : "";
  return `Use this paragraph as research-prototype evidence for ${label}. Compare the user's facts with the paragraph context, charge/procedural posture and distinguishability limits before relying on it.${snippet} Current treatment remains unchecked.`;
}

function buildChunk(tree, authority) {
  const text = [
    `Law tree: ${tree.tree_id} (${tree.label}).`,
    `Case: ${authority.case_name} ${authority.citation || authority.neutral_citation}.`,
    `Paragraph ${authority.para_no}: ${authority.paragraph_text}`,
    `Exact quote: ${authority.exact_quote}`,
    `Principle: ${authority.principle_text}`,
    `Application: ${authority.application_note}`,
    `Source: ${authority.source_url}`,
  ].join("\n");
  return {
    chunk_id: `law_tree_case_fruit::${tree.tree_id}::${authority.paragraph_id || authority.authority_id}`,
    chunk_type: "law_tree_case_fruit_chunk",
    chunk_schema_version: "law_tree_case_fruit_chunk_v1",
    law_tree_id: tree.tree_id,
    source_object_id: authority.tree_authority_id,
    case_id: authority.case_id,
    case_name: authority.case_name,
    citation: authority.citation,
    court: authority.court,
    judgment_date: authority.judgment_date,
    issue_tags: authority.issue_tags,
    viewer_node_ids: tree.viewer_node_ids || [],
    doctrine_node_ids: tree.doctrine_node_ids || [],
    paragraph_ids: [authority.paragraph_id].filter(Boolean),
    source_url: authority.source_url,
    text,
    token_estimate: Math.ceil(text.split(/\s+/).length * 1.25),
    checksum: checksum(text),
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    review_status: authority.review_status || "machine_candidate",
    professional_advice_certified: false,
  };
}

function buildTree(registry, tree) {
  const candidates = matchingAuthorities(registry, tree);
  const verified = selectAuthorities(candidates, 15).map((authority, index) => authorityCard(authority, tree, index));
  const excluded = matchingUnresolvedSeeds(registry, tree);
  const uniqueCases = new Set(verified.map(item => [item.case_name, item.citation].join("|")));
  const candidateCasesProposed = uniqueCandidateCaseCount(candidates, excluded);
  return {
    tree_id: tree.tree_id,
    label: tree.label,
    broad_legal_topic: tree.broad_legal_topic,
    domain_id: tree.domain_id,
    source_candidate_policy: "Candidate output is not authority; only public paragraph-linked proof is exported.",
    candidate_inputs: {
      candidate_issue_tree_source: "committed_registry_and_existing_case_corpus; NotebookLM/DeepSeek proposals may be added later as candidate-only inputs",
      candidate_case_count: candidateCasesProposed,
      candidate_paragraph_count: candidates.length,
      candidate_principle_count: candidates.length,
    },
    issue_tags: tree.issue_tags,
    selection_issue_tags: tree.selection_issue_tags || [],
    selection_doctrine_node_ids: tree.selection_doctrine_node_ids || [],
    keywords: tree.keywords || [],
    principle_terms: tree.principle_terms || [],
    viewer_node_ids: tree.viewer_node_ids || [],
    doctrine_node_ids: tree.doctrine_node_ids || [],
    flow_step_ids: tree.flow_step_ids || [],
    fact_pattern_query: tree.fact_pattern_query,
    query_examples: [tree.fact_pattern_query],
    verified_authorities: verified,
    excluded_candidates: excluded,
    counts: {
      candidate_cases_proposed: candidateCasesProposed,
      candidate_authority_records_considered: candidates.length,
      cases_verified: uniqueCases.size,
      cases_excluded: excluded.length,
      paragraph_cards_created: verified.length,
      principle_sub_issue_cards_created: verified.length,
      viewer_nodes_mapped: (tree.viewer_node_ids || []).length,
      ai_inquiry_searchable_records: verified.length,
    },
  };
}

function build() {
  const registry = writeCaseAuthorityRegistry();
  const trees = LAW_TREE_CONFIGS.map(tree => buildTree(registry, tree));
  const chunks = trees.flatMap(tree => tree.verified_authorities.map(authority => buildChunk(tree, authority)));
  const payload = {
    pack_id: "law_tree_case_fruit_packs_v1",
    generated_at: GENERATED_AT,
    product_rule: "Visible/searchable case authority = public paragraph-linked judgment only.",
    source_proof_gate: {
      public_url_required: true,
      paragraph_anchor_required: true,
      fetched_paragraph_text_required: true,
      exact_quote_must_match_paragraph_text: true,
      checksum_required: true,
      lawyer_review_blocks_research_prototype: false,
    },
    trees,
    counts: {
      trees_processed: trees.length,
      candidate_cases_proposed: trees.reduce((sum, tree) => sum + tree.counts.candidate_cases_proposed, 0),
      candidate_authority_records_considered: trees.reduce((sum, tree) => sum + tree.counts.candidate_authority_records_considered, 0),
      cases_verified: trees.reduce((sum, tree) => sum + tree.counts.cases_verified, 0),
      cases_excluded: trees.reduce((sum, tree) => sum + tree.counts.cases_excluded, 0),
      paragraph_cards_created: trees.reduce((sum, tree) => sum + tree.counts.paragraph_cards_created, 0),
      principle_sub_issue_cards_created: trees.reduce((sum, tree) => sum + tree.counts.principle_sub_issue_cards_created, 0),
      viewer_nodes_mapped: trees.reduce((sum, tree) => sum + tree.counts.viewer_nodes_mapped, 0),
      ai_inquiry_searchable_records: trees.reduce((sum, tree) => sum + tree.counts.ai_inquiry_searchable_records, 0),
      chunks_created: chunks.length,
    },
  };
  const evalQueries = {
    generated_at: GENERATED_AT,
    queries: trees.flatMap(tree => {
      const first = tree.verified_authorities[0];
      return [
        {
          id: `${tree.tree_id}.exact_case`,
          level: 1,
          tree_id: tree.tree_id,
          query: first ? `${first.case_name} ${first.citation}` : tree.label,
          expected_case_name: first?.case_name || "",
          expected_source_url: first?.source_url || "",
          expected_para_no: first?.para_no || "",
        },
        {
          id: `${tree.tree_id}.fact_pattern`,
          level: 2,
          tree_id: tree.tree_id,
          query: tree.query_examples[0],
        },
      ];
    }),
  };
  writeJson(PACK_JSON, payload);
  writeText(CHUNKS_JSONL, chunks.map(chunk => JSON.stringify(chunk)).join("\n") + "\n");
  writeJson(EVAL_QUERIES_JSON, evalQueries);
  writeReport(payload);
  return payload;
}

function writeReport(payload) {
  const report = {
    report_id: "law_tree_case_fruit_pack_report_v1",
    generated_at: payload.generated_at,
    product_rule: payload.product_rule,
    counts: payload.counts,
    trees: payload.trees.map(tree => ({
      tree_id: tree.tree_id,
      label: tree.label,
      candidate_cases_proposed: tree.counts.candidate_cases_proposed,
      candidate_authority_records_considered: tree.counts.candidate_authority_records_considered,
      cases_verified: tree.counts.cases_verified,
      cases_excluded: tree.counts.cases_excluded,
      paragraph_cards_created: tree.counts.paragraph_cards_created,
      principle_sub_issue_cards_created: tree.counts.principle_sub_issue_cards_created,
      viewer_nodes_mapped: tree.counts.viewer_nodes_mapped,
      ai_inquiry_searchable_records: tree.counts.ai_inquiry_searchable_records,
      sample_authorities: tree.verified_authorities.slice(0, 3).map(item => ({
        case_name: item.case_name,
        citation: item.citation,
        para_no: item.para_no,
        source_url: item.source_url,
      })),
    })),
  };
  writeJson(REPORT_JSON, report);
  writeText(REPORT_MD, [
    "# Law-Tree Case Fruit Pack Report",
    "",
    `Generated: ${payload.generated_at}`,
    "",
    payload.product_rule,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Trees processed | ${payload.counts.trees_processed} |`,
    `| Candidate cases proposed | ${payload.counts.candidate_cases_proposed} |`,
    `| Candidate authority records considered | ${payload.counts.candidate_authority_records_considered} |`,
    `| Cases verified | ${payload.counts.cases_verified} |`,
    `| Cases excluded | ${payload.counts.cases_excluded} |`,
    `| Paragraph cards created | ${payload.counts.paragraph_cards_created} |`,
    `| Principle/sub-issue cards created | ${payload.counts.principle_sub_issue_cards_created} |`,
    `| Viewer nodes mapped | ${payload.counts.viewer_nodes_mapped} |`,
    `| AI Inquiry searchable records | ${payload.counts.ai_inquiry_searchable_records} |`,
    `| Backend chunks created | ${payload.counts.chunks_created} |`,
    "",
    "## Trees",
    "",
    "| Tree | Verified cases | Paragraphs | Excluded | Viewer nodes |",
    "|---|---:|---:|---:|---:|",
    ...payload.trees.map(tree => `| ${tree.tree_id} | ${tree.counts.cases_verified} | ${tree.counts.paragraph_cards_created} | ${tree.counts.cases_excluded} | ${tree.counts.viewer_nodes_mapped} |`),
    "",
    "## Boundary",
    "",
    "- NotebookLM/DeepSeek-style proposals may be used only as candidate inputs.",
    "- Candidate output is not authority.",
    "- Exported case fruits require public URL, paragraph anchor, paragraph text, exact quote match and checksum.",
    "- Lawyer review remains later HITL metadata and does not block paragraph-linked research-prototype retrieval.",
    "- Unresolved cases are excluded from product authority UI/backend retrieval and remain in developer audit.",
    "",
  ].join("\n"));
}

const payload = build();
console.log(`Built ${payload.counts.trees_processed} law-tree case fruit packs with ${payload.counts.paragraph_cards_created} paragraph cards.`);
