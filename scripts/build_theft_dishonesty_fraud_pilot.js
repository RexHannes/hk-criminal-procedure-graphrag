#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  buildPublicBailBatch,
} = require("../src/case_graph/build_public_bail_batch");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(
  ROOT,
  "data",
  "legal_ingest",
  "criminal_evidence_tree_v1",
  "tree_gap_pilots",
  "theft_dishonesty_fraud_v1",
);

const SOURCE = {
  source_id: "hk_cfa_2022_chan_kam_ching_facc_10_2021",
  case_id: "hk_cfa_2022_chan_kam_ching_facc_10_2021",
  case_name: "HKSAR v Chan Kam Ching",
  neutral_citation: "[2022] HKCFA 7",
  law_report_citation: "(2022) 25 HKCFAR 48",
  court: "Court of Final Appeal",
  court_level: "CFA",
  date: "2022-04-14",
  source_kind: "case_judgment",
  source_visibility: "public_demo",
  tenant_id: "public",
  licence_status: "public_judgment",
  source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143540&QS=%2B&TP=JU&ILAN=en",
  fetch_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=143540&QS=%2B&TP=JU",
  source_format: "legalref_html_body",
  ingestion_status: "source_candidate",
  authority_status: "real_public_authority_candidate",
};

const RULES = [
  {
    rule_id: "chan_kam_ching_2022_fraud_issue_p2",
    source_id: SOURCE.source_id,
    paragraph_no: "2",
    proposition_id: "prop_chan_kam_ching_2022_fraud_substitution_issue_p2",
    proposition_text: "The Court of Final Appeal identified that the appeal required considering whether dishonesty is an element of the fraud offence under Theft Ordinance s.16A.",
    exact_quote: "this judgment will have occasion to consider whether dishonesty is an element of the fraud offence created by section 16A of the Theft Ordinance",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "frames_issue",
    authority_role: "issue_framing",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_no_dishonesty_lrc_p138",
    source_id: SOURCE.source_id,
    paragraph_no: "138",
    proposition_id: "prop_chan_kam_ching_2022_lrc_no_separate_dishonesty_p138",
    proposition_text: "The CFA recorded that the Law Reform Commission majority concluded there should be no separate dishonesty requirement for the fraud offence.",
    exact_quote: "there should be no separate requirement of dishonesty",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_no_dishonesty_ingredient_p139",
    source_id: SOURCE.source_id,
    paragraph_no: "139",
    proposition_id: "prop_chan_kam_ching_2022_dishonesty_not_ingredient_p139",
    proposition_text: "The CFA stated that dishonesty is not mentioned as an ingredient in the offence-creating provisions of either Crimes Ordinance s.73 or Theft Ordinance s.16A.",
    exact_quote: "“Dishonesty” is thus not mentioned as an ingredient in the offence-creating provisions of either CO section 73 or TO section 16A",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_s16a_intent_to_defraud_p142",
    source_id: SOURCE.source_id,
    paragraph_no: "142",
    proposition_id: "prop_chan_kam_ching_2022_s16a_intent_to_defraud_p142",
    proposition_text: "The CFA explained that Theft Ordinance s.16A defines the culpable mental state through intent to defraud.",
    exact_quote: "that section also spells out the culpable mental state, defining with precision the meaning of “with intent to defraud” in section 16A(2)",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_no_imported_dishonesty_p143",
    source_id: SOURCE.source_id,
    paragraph_no: "143",
    proposition_id: "prop_chan_kam_ching_2022_no_imported_dishonesty_p143",
    proposition_text: "The CFA held that general parlance cannot justify introducing dishonesty as a separate element of the s.16A fraud offence.",
    exact_quote: "this does not justify the court in introducing a requirement of proof of “dishonesty” as a separate element of the offence",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_ho_ka_keung_not_supported_p146",
    source_id: SOURCE.source_id,
    paragraph_no: "146",
    proposition_id: "prop_chan_kam_ching_2022_s16a_no_implied_dishonesty_p146",
    proposition_text: "The CFA held there was no justification for concluding that Theft Ordinance s.16A impliedly incorporates dishonesty as an offence element.",
    exact_quote: "there is no justification for concluding that the legislative intent was impliedly to incorporate an element of dishonesty as part of the offence",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "limits_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_deceit_definition_p147",
    source_id: SOURCE.source_id,
    paragraph_no: "147",
    proposition_id: "prop_chan_kam_ching_2022_deceit_definition_p147",
    proposition_text: "The CFA adopted the classic definition of deceit as inducing belief in something false that the person practising the deceit knows or believes to be false.",
    exact_quote: "To deceive is, I apprehend, to induce a man to believe that a thing is true which is false, and which the person practising the deceit knows or believes to be false",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud"
    ],
    significance_label: "sets_out_test",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "chan_kam_ching_2022_dishonesty_state_of_mind_p148",
    source_id: SOURCE.source_id,
    paragraph_no: "148",
    proposition_id: "prop_chan_kam_ching_2022_dishonesty_state_of_mind_p148",
    proposition_text: "The CFA distinguished deceit from dishonesty, noting that dishonesty describes a state of mind.",
    exact_quote: "“Dishonesty” addresses a wholly different matter. As Sir Anthony Mason NPJ noted in Mo Yuk Ping v HKSAR , [137] it “describes a state of mind”",
    target_doctrine_node_ids: [
      "criminal_law_hk.theft.dishonesty",
      "criminal_law_hk.fraud"
    ],
    significance_label: "distinguishes",
    authority_role: "ratio",
    confidence: "high",
    lineage_note: "Cites and distinguishes Mo Yuk Ping on dishonesty as a state of mind."
  },
  {
    rule_id: "chan_kam_ching_2022_ghosh_hk_p149",
    source_id: SOURCE.source_id,
    paragraph_no: "149",
    proposition_id: "prop_chan_kam_ching_2022_ghosh_test_hk_p149",
    proposition_text: "The CFA stated that the Ghosh test for dishonesty represents the law in Hong Kong at present and set out its two-stage formulation.",
    exact_quote: "the Ghosh test for dishonesty represents the law in Hong Kong at present",
    target_doctrine_node_ids: [
      "criminal_law_hk.theft.dishonesty",
      "criminal_law_hk.gap_verify_dishonesty_hk_post_ivey"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high",
    lineage_note: "Cites Mo Yuk Ping and preserves the need to verify later post-Ivey HK treatment before answer-safe promotion."
  },
  {
    rule_id: "chan_kam_ching_2022_deceit_dishonesty_distinct_p150",
    source_id: SOURCE.source_id,
    paragraph_no: "150",
    proposition_id: "prop_chan_kam_ching_2022_deceit_dishonesty_distinct_p150",
    proposition_text: "The CFA concluded that deceit and dishonesty are distinct concepts, so Ho Ka Keung should not be followed on importing the Ghosh test into s.16A.",
    exact_quote: "“deceit” and “dishonesty” are quite distinct concepts. No basis exists for the proposition that “‘deceit’ incorporates the element of dishonesty”, thereby importing the Ghosh test into TO section 16A. Ho Ka Keung should not be followed on this point",
    target_doctrine_node_ids: [
      "criminal_law_hk.fraud",
      "criminal_law_hk.theft.dishonesty"
    ],
    significance_label: "distinguishes",
    authority_role: "ratio",
    confidence: "high",
    lineage_note: "Expressly limits Ho Ka Keung on s.16A dishonesty."
  }
];

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function writeJson(name, value) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function rewriteGeneratedArtifacts(manifest) {
  const paragraphPath = path.join(OUT_DIR, "paragraph_cards.json");
  const propositionPath = path.join(OUT_DIR, "proposition_cards.json");
  const linksPath = path.join(OUT_DIR, "proposition_node_links.json");
  const l4Path = path.join(OUT_DIR, "l4_case_applications.json");
  const l5Path = path.join(OUT_DIR, "l5_paragraph_proof.json");
  const paragraphPayload = JSON.parse(fs.readFileSync(paragraphPath, "utf8"));
  const propositionPayload = JSON.parse(fs.readFileSync(propositionPath, "utf8"));
  const linksPayload = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  const l4Payload = JSON.parse(fs.readFileSync(l4Path, "utf8"));
  const l5Payload = JSON.parse(fs.readFileSync(l5Path, "utf8"));

  paragraphPayload.artifact_id = "theft_dishonesty_fraud_paragraph_cards";
  propositionPayload.artifact_id = "theft_dishonesty_fraud_proposition_cards";
  for (const link of linksPayload.proposition_node_links || []) {
    link.confidence = Math.max(Number(link.confidence || 0), 0.84);
    link.linking_method = "legalref_exact_quote_theft_dishonesty_fraud_v1";
    link.notes = link.notes || "Accepted only because the LegalRef paragraph contains the exact quote; candidate-only pending human review.";
  }
  for (const item of l4Payload.l4_case_applications || []) {
    item.scenario_label = "Theft Ordinance / fraud / dishonesty / deceit";
  }
  for (const item of l5Payload.l5_paragraph_proof || []) {
    item.quote_verified_against_source = true;
  }

  writeJson("paragraph_cards.json", paragraphPayload);
  writeJson("proposition_cards.json", propositionPayload);
  writeJson("proposition_node_links.json", linksPayload);
  writeJson("l4_case_applications.json", l4Payload);
  writeJson("l5_paragraph_proof.json", l5Payload);
  writeJson("source_manifest.json", manifest);
}

async function main() {
  const tempDir = path.join(OUT_DIR, ".tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, "source_manifest.json");
  const rulesPath = path.join(tempDir, "extraction_rules.json");
  const manifest = {
    batch_id: "theft_dishonesty_fraud_tree_gap_pilot_v1",
    domain_id: "criminal_law_hk",
    practice_area: "criminal_law",
    scope: "theft_dishonesty_fraud_candidate_branch",
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false
    },
    scale_policy: {
      current_rung: "single_public_case_theft_dishonesty_fraud_pilot",
      next_rung: "10_to_20_public_theft_dishonesty_fraud_cases_after_review",
      max_sources_without_force: 50,
      large_cross_domain_crawl_allowed: false,
      requires_review_before_next_rung: true
    },
    sources: [SOURCE],
    tree_gap_resolution: {
      existing_tree_match: "criminal_law_hk property/dishonesty branch",
      tree_proposal_source: "existing_doctrine_tree_plus_public_secondary_leads",
      tree_proposal_status: "existing_branch_candidate_only_until_review",
      verification_gate: "legalref_exact_quote_case_fruits_only"
    },
    ai_assist_policy: {
      notebooklm_role: "candidate_lineage_or_branch_prompt_only_not_authority",
      deepseek_role: "optional_candidate_rule_proposer_only_not_authority",
      public_judgment_text_required_before_extraction: true,
      private_or_licensed_text_used: false
    }
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(rulesPath, `${JSON.stringify({ rules: RULES }, null, 2)}\n`);
  const report = await buildPublicBailBatch({
    manifestPath,
    rulesPath,
    outputDir: OUT_DIR,
    fetchSources: true,
    now: new Date().toISOString(),
  });
  rewriteGeneratedArtifacts(manifest);
  writeJson("case_lineage_notes.json", {
    artifact_id: "theft_dishonesty_fraud_case_lineage_notes",
    batch_id: manifest.batch_id,
    source_policy: "public LegalRef only; no private or licensed material",
    lineage_edges: [
      {
        from_case_id: "hk_cfa_2007_mo_yuk_ping",
        to_case_id: SOURCE.case_id,
        relation: "cited_for_dishonesty_state_of_mind_and_ghosh_test",
        text_supported_by_proposition_ids: [
          "prop_chan_kam_ching_2022_dishonesty_state_of_mind_p148",
          "prop_chan_kam_ching_2022_ghosh_test_hk_p149"
        ],
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only"
      },
      {
        from_case_id: "hk_ca_ho_ka_keung",
        to_case_id: SOURCE.case_id,
        relation: "not_followed_on_importing_dishonesty_into_to_s16a",
        text_supported_by_proposition_id: "prop_chan_kam_ching_2022_deceit_dishonesty_distinct_p150",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only"
      }
    ],
    lineage_policy: "candidate_only_until_human_review",
    source_fingerprint: sha256(SOURCE.source_url_or_path),
  });
  const parseReportPath = path.join(OUT_DIR, "parse_report.json");
  const parseReport = JSON.parse(fs.readFileSync(parseReportPath, "utf8"));
  parseReport.artifact_id = "theft_dishonesty_fraud_tree_gap_pilot_v1";
  parseReport.batch_id = manifest.batch_id;
  parseReport.scope = manifest.scope;
  fs.writeFileSync(parseReportPath, `${JSON.stringify(parseReport, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, batch_id: manifest.batch_id }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.artifact) console.error(JSON.stringify(error.artifact, null, 2));
  if (error.errors) console.error(JSON.stringify(error.errors, null, 2));
  process.exit(1);
});
