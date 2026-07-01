#!/usr/bin/env node
/* Build native viewer evidence artifacts from the frozen PR #6 case corpus. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CASE_CORPUS_DIR = path.join(ROOT, "data/legal_ingest/case_corpus");

const NODE_MAP = {
  map_id: "pr6_viewer_node_evidence_map",
  generated_at: "2026-06-30T00:00:00.000Z",
  source_corpus: "frozen_pr6_l1_l35_120_case_sample",
  mappings: [
    {
      issue_tag: "criminal_law.theft",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_theft"],
      doctrine_node_ids: ["criminal_law_hk.theft"],
      flow_step_ids: [],
      query_ids: ["A"],
      demo_query: "If I forgot to pay at a shop, what are the dishonesty issues?",
      label: "Theft",
      summary: "Paragraph-proof theft evidence from the frozen PR #6 corpus.",
    },
    {
      issue_tag: "criminal_law.theft.dishonesty",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_theft_dishonesty"],
      doctrine_node_ids: ["criminal_law_hk.theft.dishonesty"],
      flow_step_ids: [],
      query_ids: ["A"],
      demo_query: "If I forgot to pay at a shop, what are the dishonesty issues?",
      label: "Theft / dishonesty",
      summary: "Research-only HK paragraph proof for theft dishonesty and mens rea questions.",
    },
    {
      issue_tag: "criminal_law.theft.appropriation",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_theft_appropriation"],
      doctrine_node_ids: ["criminal_law_hk.theft.appropriation"],
      flow_step_ids: [],
      query_ids: [],
      demo_query: "",
      label: "Appropriation",
      summary: "Research-only appropriation-linked theft evidence.",
    },
    {
      issue_tag: "criminal_law.theft.belonging_to_another",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_theft"],
      doctrine_node_ids: ["criminal_law_hk.theft"],
      flow_step_ids: [],
      query_ids: ["C"],
      demo_query: "How does Hong Kong theft law handle property belonging to another?",
      label: "Belonging to another",
      summary: "Attached under the existing Theft node because the Fable seed graph has no standalone belonging-to-another element node.",
      mapping_note: "No new graph node is invented; the source-proofed evidence appears in the native Verified Case Demo and under the existing Theft inspector.",
    },
    {
      issue_tag: "criminal_law.theft.intention_permanently_deprive",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_theft_intent_deprive"],
      doctrine_node_ids: ["criminal_law_hk.theft.intent.deprive"],
      flow_step_ids: [],
      query_ids: ["B"],
      demo_query: "What does intention permanently to deprive mean in theft?",
      label: "Intention permanently to deprive",
      summary: "Research-only paragraph proof for intention permanently to deprive.",
    },
    {
      issue_tag: "criminal_law.fraud",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_fraud"],
      doctrine_node_ids: ["criminal_law_hk.fraud"],
      flow_step_ids: [],
      query_ids: [],
      demo_query: "",
      label: "Fraud",
      summary: "Research-only fraud/deception boundary evidence.",
    },
    {
      issue_tag: "criminal_law.deception",
      domain_id: "criminal_law_hk",
      viewer_node_ids: ["crim_fraud"],
      doctrine_node_ids: ["criminal_law_hk.deception"],
      flow_step_ids: [],
      query_ids: [],
      demo_query: "",
      label: "Deception",
      summary: "Research-only deception-linked evidence.",
    },
    {
      issue_tag: "criminal_procedure.bail",
      domain_id: "criminal_procedure_hk",
      viewer_node_ids: ["bail_factors", "bail_right_to_bail", "bail_pending_appeal"],
      doctrine_node_ids: ["criminal_procedure_hk.bail"],
      flow_step_ids: ["bail_flow_step3", "bail_flow_step4", "bail_flow_step5"],
      query_ids: ["D"],
      demo_query: "What bail factors matter in a theft or dishonesty-related case?",
      label: "Bail",
      summary: "Research-only paragraph proof for bail/procedure issues in the frozen PR #6 sample.",
    },
  ],
};

function readJsonl(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function byId(rows, idKey) {
  return new Map(rows.map(row => [row[idKey], row]));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function sourceAnchor(url, paraNo) {
  const match = String(url || "").match(/#p\d+$/);
  if (match) return match[0];
  return paraNo ? `#p${paraNo}` : "";
}

function buildEntry({ mapping, issueMap, paragraph, proposition, principle }) {
  const exactQuote = proposition?.exact_quote_support || principle?.exact_quote_support || "";
  return {
    evidence_id: `${mapping.issue_tag}::${paragraph.paragraph_id}`,
    issue_tag: mapping.issue_tag,
    domain_id: mapping.domain_id,
    viewer_node_id: mapping.viewer_node_ids[0] || "",
    viewer_node_ids: mapping.viewer_node_ids,
    doctrine_node_id: mapping.doctrine_node_ids[0] || "",
    doctrine_node_ids: mapping.doctrine_node_ids,
    issue_tags: unique([
      mapping.issue_tag,
      ...(paragraph.issue_tags_candidate || []),
      ...(proposition?.issue_tags || []),
      ...(principle?.issue_tags || []),
    ]),
    flow_step_id: mapping.flow_step_ids[0] || "",
    flow_step_ids: mapping.flow_step_ids,
    query_id: mapping.query_ids[0] || "",
    query_ids: mapping.query_ids,
    demo_query: mapping.demo_query,
    case_id: paragraph.case_id,
    case_name: paragraph.case_name,
    citation: paragraph.neutral_citation,
    neutral_citation: paragraph.neutral_citation,
    court: paragraph.court || proposition?.court || principle?.court || "",
    judgment_date: paragraph.judgment_date || "",
    paragraph_id: paragraph.paragraph_id,
    paragraph_number: paragraph.para_no,
    para_no: paragraph.para_no,
    exact_quote: exactQuote,
    supporting_quote: exactQuote,
    paragraph_text: paragraph.paragraph_text,
    source_url: paragraph.source_url,
    source_anchor: sourceAnchor(paragraph.source_url, paragraph.para_no),
    source_system: paragraph.source_system || "hklii",
    checksum: paragraph.checksum,
    proposition_id: proposition?.proposition_id || issueMap.proposition_ids?.[0] || "",
    proposition_text: proposition?.proposition_text || "",
    principle_id: principle?.principle_id || "",
    principle_text: principle?.principle_text || "",
    principle_quality_status: principle?.principle_quality_status || "needs_review",
    liability_relevance: principle?.liability_relevance || proposition?.legal_function || "",
    authority_role: paragraph.authority_role_candidate || proposition?.authority_role_candidate || "",
    verification_status: "paragraph_linked_public_source",
    source_verification_status: paragraph.verification_status || proposition?.verification_status || "source_verified_public",
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    answer_safe: false,
    review_status: paragraph.review_status || proposition?.review_status || "machine_candidate",
    lawyer_review_status: "unreviewed",
    professional_advice_certified: false,
    usable_in_research_prototype: true,
    current_treatment_status: principle?.current_treatment_status || "unchecked",
    usable_in_answer_layer: principle?.usable_in_answer_layer === true,
    lineage_note: principle?.limits || issueMap.relevance_reason || "Frozen PR #6 viewer evidence; source-linked public paragraph proof for the research prototype.",
  };
}

function optionalJson(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function normalizeSeedEvidenceEntry(item) {
  const issueTag = (item.issue_tags || [])[0] || `seed_case.${item.source_node_ids?.[0] || item.evidence_id}`;
  return {
    evidence_id: item.evidence_id,
    issue_tag: issueTag,
    domain_id: (item.doctrine_node_ids?.[0] || "").split(".")[0] || "",
    viewer_node_id: item.source_node_ids?.[0] || "",
    viewer_node_ids: item.source_node_ids || [],
    doctrine_node_id: item.doctrine_node_ids?.[0] || "",
    doctrine_node_ids: item.doctrine_node_ids || [],
    issue_tags: item.issue_tags || [issueTag],
    flow_step_id: "",
    flow_step_ids: [],
    query_id: "",
    query_ids: [],
    demo_query: "",
    case_id: item.case_id || item.paragraph_id || item.evidence_id,
    case_name: item.case_name,
    citation: item.neutral_citation || item.law_report_citation || "",
    neutral_citation: item.neutral_citation || "",
    law_report_citation: item.law_report_citation || "",
    court: item.court || "",
    judgment_date: item.judgment_date || "",
    paragraph_id: item.paragraph_id,
    paragraph_number: item.para_no,
    para_no: item.para_no,
    exact_quote: item.exact_quote || item.supporting_quote || "",
    supporting_quote: item.supporting_quote || item.exact_quote || "",
    paragraph_text: item.paragraph_text,
    source_url: item.source_url,
    source_anchor: sourceAnchor(item.source_url, item.para_no),
    source_system: item.source_system || "",
    checksum: item.checksum || "",
    proposition_id: item.proposition_id || "",
    proposition_text: item.proposition_text || "",
    principle_id: item.principle_id || "",
    principle_text: item.principle_text || "",
    principle_quality_status: "needs_review",
    liability_relevance: item.liability_relevance || "",
    authority_role: item.authority_role || "public_paragraph_proof_for_seed_identity_only",
    verification_status: "paragraph_linked_public_source",
    source_verification_status: item.source_verification_status || "source_verified_public",
    answer_layer_status: "research_only",
    answer_mode: item.answer_mode || "research_prototype",
    answer_safe: false,
    review_status: item.review_status || "machine_candidate",
    lawyer_review_status: item.lawyer_review_status || "unreviewed",
    professional_advice_certified: item.professional_advice_certified === true ? true : false,
    usable_in_research_prototype: true,
    current_treatment_status: item.current_treatment_status || "unchecked",
    usable_in_answer_layer: false,
    lineage_note: item.seed_alignment_warning || "Verified seed paragraph proof for the research prototype.",
  };
}

function seedEvidenceMappings(seedEntries) {
  return seedEntries.map(item => {
    const issueTag = item.issue_tag;
    return {
      issue_tag: issueTag,
      domain_id: item.domain_id,
      viewer_node_ids: item.viewer_node_ids,
      doctrine_node_ids: item.doctrine_node_ids,
      flow_step_ids: [],
      query_ids: [],
      demo_query: "",
      label: item.case_name,
      summary: item.principle_text || item.proposition_text || "Verified seed paragraph proof.",
      mapping_note: "Seed identity proof only; does not promote the parent graph issue unless separately mapped.",
    };
  });
}

function build() {
  const paragraphs = readJsonl("data/legal_ingest/case_corpus/paragraph_cards_sample_100.jsonl");
  const propositions = readJsonl("data/legal_ingest/case_corpus/proposition_cards_sample_100.jsonl");
  const principles = readJsonl("data/legal_ingest/case_corpus/principle_cards_sample_100.jsonl");
  const issueMaps = readJsonl("data/legal_ingest/case_corpus/issue_case_map_sample_100.jsonl");

  const paragraphById = byId(paragraphs, "paragraph_id");
  const propositionById = byId(propositions, "proposition_id");
  const principleById = byId(principles, "principle_id");
  const entries = [];
  const seen = new Set();

  for (const mapping of NODE_MAP.mappings) {
    for (const issueMap of issueMaps.filter(item => item.issue_id === mapping.issue_tag)) {
      for (const paragraphId of issueMap.paragraph_ids || []) {
        const paragraph = paragraphById.get(paragraphId);
        if (!paragraph || !paragraph.source_url || !/#p\d+/.test(paragraph.source_url)) continue;
        const proposition = (issueMap.proposition_ids || [])
          .map(id => propositionById.get(id))
          .find(item => (item?.source_paragraph_ids || []).includes(paragraphId))
          || propositionById.get(issueMap.proposition_ids?.[0]);
        const principle = (issueMap.principle_ids || [])
          .map(id => principleById.get(id))
          .find(item => (item?.source_paragraph_ids || []).includes(paragraphId))
          || (issueMap.demoted_principle_ids || [])
            .map(id => principleById.get(id))
            .find(item => (item?.source_paragraph_ids || []).includes(paragraphId))
          || principleById.get(issueMap.principle_ids?.[0])
          || principleById.get(issueMap.demoted_principle_ids?.[0]);
        const entry = buildEntry({ mapping, issueMap, paragraph, proposition, principle });
        if (!entry.exact_quote || !paragraph.paragraph_text.includes(entry.exact_quote)) continue;
        if (seen.has(entry.evidence_id)) continue;
        seen.add(entry.evidence_id);
        entries.push(entry);
      }
    }
  }

  const seedSourcePayload = optionalJson("data/legal_ingest/case_corpus/viewer_seed_case_public_sources.json");
  const seedEntries = (seedSourcePayload?.evidence || [])
    .filter(item => item.source_url && /#p\d+/i.test(item.source_url) && item.exact_quote && item.paragraph_text?.includes(item.exact_quote))
    .map(normalizeSeedEvidenceEntry);
  for (const entry of seedEntries) {
    if (seen.has(entry.evidence_id)) continue;
    seen.add(entry.evidence_id);
    entries.push(entry);
  }
  const mappings = NODE_MAP.mappings.concat(seedEvidenceMappings(seedEntries));

  const index = {
    index_id: "pr6_viewer_evidence_index",
    generated_at: NODE_MAP.generated_at,
    source_corpus: NODE_MAP.source_corpus,
    answer_layer_status: "research_only",
    answer_mode: "research_prototype",
    answer_safe_count: 0,
    lawyer_review_status: "unreviewed",
    professional_advice_certified: false,
    current_treatment_status: "unchecked",
    verification_status: "paragraph_linked_public_source",
    safe_demo_claim: optionalJson("artifacts/demo_freeze_report.json")?.safe_demo_claim || "",
    corpus_counts: optionalJson("artifacts/demo_freeze_report.json")?.corpus_counts
      || optionalJson("artifacts/case_corpus_l1_l35_status.json")
      || {},
    issue_coverage: optionalJson("artifacts/demo_freeze_report.json")?.issue_coverage
      || optionalJson("artifacts/case_corpus_issue_coverage.json")?.coverage
      || [],
    mappings,
    evidence: entries,
    counts: {
      mappings: mappings.length,
      evidence_entries: entries.length,
      hklii_or_legalref_links: entries.filter(item => /(?:hklii\.hk|legalref\.judiciary\.hk)/i.test(item.source_url)).length,
      paragraph_anchors: entries.filter(item => /#p\d+/.test(item.source_url)).length,
      exact_quotes: entries.filter(item => item.exact_quote && item.paragraph_text.includes(item.exact_quote)).length,
    },
  };

  fs.writeFileSync(path.join(CASE_CORPUS_DIR, "viewer_node_evidence_map.json"), `${JSON.stringify(NODE_MAP, null, 2)}\n`);
  fs.writeFileSync(path.join(CASE_CORPUS_DIR, "viewer_evidence_index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

const index = build();
console.log(`Wrote viewer case evidence index with ${index.counts.evidence_entries} evidence entries.`);
