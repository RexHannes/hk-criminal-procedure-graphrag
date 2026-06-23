#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const {
  collapseForQuote,
  extractNumberedParagraph,
  stripHtmlToText,
} = require("../src/case_graph/build_public_bail_batch");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "tree_gap_pilots",
  "sedition_public_expression_v1",
);

const SOURCE = {
  source_id: "hk_ca_2024_tam_tak_chi_cacc_62_2022",
  case_id: "hk_ca_2024_tam_tak_chi_cacc_62_2022",
  case_name: "HKSAR v Tam Tak Chi",
  neutral_citation: "[2024] HKCA 231",
  court: "Court of Appeal",
  court_level: "CA",
  date: "2024-03-07",
  source_kind: "case_judgment",
  source_visibility: "public_demo",
  tenant_id: "public",
  licence_status: "public_judgment",
  source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=158600&QS=%2B&TP=JU&ILAN=en",
  fetch_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=158600&QS=%2B&TP=JU",
  source_format: "legalref_html_body",
  ingestion_status: "source_candidate",
  authority_status: "real_public_authority_candidate",
};

const TREE_PROPOSAL = {
  proposal_id: "notebooklm_sedition_public_expression_tree_proposal_v1",
  source: "notebooklm_logged_in_private_notebook",
  proposal_status: "candidate_only_requires_public_source_verification",
  generated_from_prompt_at: "2026-06-24T02:16:00+08:00",
  domain_id: "criminal_law_hk",
  proposed_branch_id: "criminal_law_hk.sedition_public_expression",
  branch_label: "Sedition and Public Order Expression Offences",
  parent_candidates: [
    "offences_against_the_crown",
    "public_order_offences",
    "national_security_offences"
  ],
  notes: [
    "NotebookLM output was used only to propose branch structure.",
    "NotebookLM citations were not trusted; case fruits below are built from LegalRef exact-quote validation.",
    "No node or proposition is answer-safe."
  ],
};

const RULES = [
  {
    rule_id: "tam_tak_chi_2024_s9_definition_p47",
    paragraph_no: "47",
    proposition_id: "prop_tam_tak_chi_2024_s9_seditious_intention_p47",
    proposition_text: "The Court of Appeal set out Cap 200 s.9 seditious intention and the statutory non-seditious circumstances in s.9(2).",
    exact_quote: "Section 9(1) of the CO provides that: “(1) A seditious intention is an intention",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.seditious_intention"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_s10_offence_p48",
    paragraph_no: "48",
    proposition_id: "prop_tam_tak_chi_2024_s10_offences_p48",
    proposition_text: "The Court of Appeal set out the Cap 200 s.10 sedition offences, including uttering seditious words and seditious publications.",
    exact_quote: "Section 10 goes on to provide: “(1) Any person who",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.section10_offences"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_nsl_jurisdiction_context_p55",
    paragraph_no: "55",
    proposition_id: "prop_tam_tak_chi_2024_nsl_jurisdiction_context_p55",
    proposition_text: "The Court of Appeal recorded that sedition under Parts I and II of the Crimes Ordinance had been identified as an offence endangering national security for NSL procedural context.",
    exact_quote: "the Court identified the ‘offences of treason, incitement to disaffection or sedition under Parts I and II of [the CO]’ as instances of offences endangering national security",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.procedure_jurisdiction",
      "criminal_law_hk.sedition_public_expression"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
    lineage_note: "Uses Ng Hau Yi Sidney / Lai Chee Ying line as recited by the CA.",
  },
  {
    rule_id: "tam_tak_chi_2024_prescribed_by_law_p131",
    paragraph_no: "131",
    proposition_id: "prop_tam_tak_chi_2024_prescribed_by_law_p131",
    proposition_text: "The Court of Appeal held that Cap 200 ss.9 and 10 satisfy the prescribed-by-law requirement.",
    exact_quote: "we hold that section 9 of the CO and consequently section 10 as well satisfy the “prescribed by law” requirement",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.constitutionality_expression"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_violence_not_required_p140",
    paragraph_no: "140",
    proposition_id: "prop_tam_tak_chi_2024_violence_not_required_p140",
    proposition_text: "The Court of Appeal held that the absence of an intention to incite violence does not by itself render the sedition offence disproportionate.",
    exact_quote: "The mere absence of an intention to incite violence does not render the offence disproportionate",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.constitutionality_expression",
      "criminal_law_hk.sedition.seditious_intention"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_sj_consent_safeguard_p141",
    paragraph_no: "141",
    proposition_id: "prop_tam_tak_chi_2024_sj_consent_safeguard_p141",
    proposition_text: "The Court of Appeal treated the Secretary for Justice written-consent requirement as a procedural safeguard for sedition prosecutions.",
    exact_quote: "no prosecution of a section 10 offence shall be instituted without the written consent of the Secretary for Justice",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.procedure_jurisdiction",
      "criminal_law_hk.sedition.constitutionality_expression"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_meaning_context_p149",
    paragraph_no: "149",
    proposition_id: "prop_tam_tak_chi_2024_meaning_context_p149",
    proposition_text: "The Court of Appeal described the meaning of alleged seditious words as an objective contextual assessment by the court as a reasonable person.",
    exact_quote: "It is a question of fact, entailing an objective assessment by the court as a reasonable person to ascertain the meaning of the words in the context in which they were uttered",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.meaning_context"
    ],
    significance_label: "sets_out_test",
    authority_role: "ratio",
    confidence: "high",
  },
  {
    rule_id: "tam_tak_chi_2024_audience_context_p150",
    paragraph_no: "150",
    proposition_id: "prop_tam_tak_chi_2024_audience_context_p150",
    proposition_text: "The Court of Appeal held that audience understanding depends on context; ordinary public language is assessed by the court using its own reasonable-person judgment.",
    exact_quote: "The relevance of the audience’s understanding of the meaning of the words depends on the specific context",
    target_doctrine_node_ids: [
      "criminal_law_hk.sedition.meaning_context"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
  }
];

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function writeJson(name, value) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

async function main() {
  const raw = await fetchUrl(SOURCE.fetch_url);
  const judgmentText = stripHtmlToText(raw);
  const paragraphByNo = new Map();
  const paragraphCards = [];
  const propositions = [];
  const links = [];
  const l4 = [];
  const l5 = [];
  const rejected = [];

  for (const rule of RULES) {
    const paragraphText = extractNumberedParagraph(judgmentText, rule.paragraph_no);
    const collapsedParagraph = collapseForQuote(paragraphText);
    const collapsedQuote = collapseForQuote(rule.exact_quote);
    if (!collapsedParagraph || !collapsedParagraph.includes(collapsedQuote)) {
      rejected.push({
        rule_id: rule.rule_id,
        paragraph_no: rule.paragraph_no,
        reason: collapsedParagraph ? "exact_quote_not_found" : "paragraph_not_found",
      });
      continue;
    }
    const paragraphId = `${SOURCE.case_id}_p${rule.paragraph_no}`;
    if (!paragraphByNo.has(rule.paragraph_no)) {
      const paragraph = {
        paragraph_id: paragraphId,
        case_id: SOURCE.case_id,
        paragraph_no: rule.paragraph_no,
        text: collapsedParagraph,
        chunk_hash: sha256(`${SOURCE.case_id}:${rule.paragraph_no}:${collapsedParagraph}`),
        source_url: SOURCE.source_url_or_path,
        source_visibility: "public_demo",
        tenant_id: "public",
        fixture_status: "real_public_source_tree_gap_pilot",
        authority_status: "real_public_authority_candidate"
      };
      paragraphByNo.set(rule.paragraph_no, paragraph);
      paragraphCards.push(paragraph);
    }
    propositions.push({
      proposition_id: rule.proposition_id,
      case_id: SOURCE.case_id,
      paragraph_id: paragraphId,
      source_paragraph: rule.paragraph_no,
      exact_quote: rule.exact_quote,
      proposition_text: rule.proposition_text,
      tree_node_ids: rule.target_doctrine_node_ids,
      target_doctrine_node_ids: rule.target_doctrine_node_ids,
      significance_label: rule.significance_label,
      authority_role: rule.authority_role,
      confidence: rule.confidence,
      review_state: "machine_candidate",
      answer_safe: false,
      human_review_required: true,
      source_visibility: "public_demo",
      tenant_id: "public",
      fixture_status: "real_public_source_tree_gap_pilot",
      authority_status: "real_public_authority_candidate",
      source_url: SOURCE.source_url_or_path,
      lineage_note: rule.lineage_note || "",
    });
    for (const nodeId of rule.target_doctrine_node_ids) {
      links.push({
        link_id: `${rule.proposition_id}__${nodeId}`,
        proposition_id: rule.proposition_id,
        doctrine_node_id: nodeId,
        link_type: "candidate",
        authority_role: rule.authority_role,
        significance_label: rule.significance_label,
        confidence: 0.82,
        linking_method: "notebooklm_tree_proposal_plus_legalref_exact_quote_v1",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        notes: rule.lineage_note || "Tree branch proposed by NotebookLM; quote verified from LegalRef.",
        source_visibility: "public_demo",
        tenant_id: "public"
      });
    }
    l4.push({
      l4_application_id: `l4_${rule.proposition_id}`,
      proposition_id: rule.proposition_id,
      case_id: SOURCE.case_id,
      case_name: SOURCE.case_name,
      neutral_citation: SOURCE.neutral_citation,
      paragraph_id: paragraphId,
      scenario_label: "Sedition / public expression tree gap pilot",
      application_summary: rule.proposition_text,
      target_doctrine_node_ids: rule.target_doctrine_node_ids,
      significance_label: rule.significance_label,
      authority_role: rule.authority_role,
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: "public_demo",
      tenant_id: "public",
      lineage_note: rule.lineage_note || ""
    });
    l5.push({
      l5_proof_id: `l5_${rule.proposition_id}`,
      proposition_id: rule.proposition_id,
      case_id: SOURCE.case_id,
      case_name: SOURCE.case_name,
      neutral_citation: SOURCE.neutral_citation,
      paragraph_id: paragraphId,
      para_no: rule.paragraph_no,
      exact_quote: rule.exact_quote,
      paragraph_text: collapsedParagraph,
      chunk_hash: paragraphByNo.get(rule.paragraph_no).chunk_hash,
      quote_verified_against_source: true,
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: "public_demo",
      tenant_id: "public",
      source_url: SOURCE.source_url_or_path
    });
  }

  const cases = [{
    case_id: SOURCE.case_id,
    case_name: SOURCE.case_name,
    neutral_citation: SOURCE.neutral_citation,
    law_report_citation: "",
    court: SOURCE.court,
    court_level: SOURCE.court_level,
    date: SOURCE.date,
    source_url_or_path: SOURCE.source_url_or_path,
    source_visibility: SOURCE.source_visibility,
    tenant_id: SOURCE.tenant_id,
    source_kind: SOURCE.source_kind,
    licence_status: SOURCE.licence_status,
    ingestion_status: "paragraphized",
    fixture_status: "real_public_source_tree_gap_pilot",
    authority_status: SOURCE.authority_status
  }];
  const manifest = {
    batch_id: "sedition_public_expression_tree_gap_pilot_v1",
    domain_id: "criminal_law_hk",
    scope: "sedition_public_expression_candidate_branch",
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false
    },
    sources: [SOURCE],
    tree_gap_resolution: {
      existing_tree_match: "no_clean_existing_branch",
      tree_proposal_source: "notebooklm_logged_in_private_notebook",
      tree_proposal_status: "candidate_only",
      verification_gate: "legalref_exact_quote_case_fruits_only"
    }
  };
  const report = {
    artifact_id: "sedition_public_expression_tree_gap_pilot_v1",
    generated_at: new Date().toISOString(),
    batch_id: manifest.batch_id,
    source_count: cases.length,
    paragraph_count: paragraphCards.length,
    proposition_count: propositions.length,
    link_count: links.length,
    rejected_count: rejected.length,
    rejected,
    status: rejected.length ? "built_with_rejections" : "built_quote_verified_candidate"
  };

  writeJson("source_manifest.json", manifest);
  writeJson("notebooklm_tree_proposal.json", TREE_PROPOSAL);
  writeJson("paragraph_cards.json", {
    artifact_id: "sedition_public_expression_paragraph_cards",
    generated_at: report.generated_at,
    batch_id: manifest.batch_id,
    case_count: cases.length,
    paragraph_count: paragraphCards.length,
    cases,
    paragraph_cards: paragraphCards
  });
  writeJson("proposition_cards.json", {
    artifact_id: "sedition_public_expression_proposition_cards",
    generated_at: report.generated_at,
    batch_id: manifest.batch_id,
    proposition_count: propositions.length,
    proposition_cards: propositions
  });
  writeJson("proposition_node_links.json", { proposition_node_links: links });
  writeJson("l4_case_applications.json", { l4_case_applications: l4 });
  writeJson("l5_paragraph_proof.json", { l5_paragraph_proof: l5 });
  writeJson("parse_report.json", report);
  writeJson("case_fruits_artifact.json", {
    ...report,
    proposition_node_links: links,
    l4_case_applications: l4,
    l5_paragraph_proof: l5
  });

  console.log(JSON.stringify(report, null, 2));
  if (rejected.length) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
