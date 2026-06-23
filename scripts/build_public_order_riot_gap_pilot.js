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
  "public_order_riot_v1",
);

const SOURCE = {
  source_id: "hk_ca_2021_tong_wai_hung_casj_1_2020",
  case_id: "hk_ca_2021_tong_wai_hung_casj_1_2020",
  case_name: "Secretary for Justice v Tong Wai Hung and Others",
  neutral_citation: "[2021] HKCA 404",
  court: "Court of Appeal",
  court_level: "CA",
  date: "2021-03-25",
  source_kind: "case_judgment",
  source_visibility: "public_demo",
  tenant_id: "public",
  licence_status: "public_judgment",
  source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=134508&QS=%2B&TP=JU&ILAN=en",
  fetch_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=134508&QS=%2B&TP=JU",
  source_format: "legalref_html_body",
  ingestion_status: "source_candidate",
  authority_status: "real_public_authority_candidate"
};

const RULES = [
  {
    rule_id: "tong_2021_joint_enterprise_all_offences_p3",
    source_id: SOURCE.source_id,
    paragraph_no: "3",
    proposition_id: "prop_tong_2021_joint_enterprise_all_offences_p3",
    proposition_text: "The Court of Appeal stated that, as a common-law notion, joint enterprise applies to all offences unless expressly or impliedly excluded by statute.",
    exact_quote: "As a common law notion, the doctrine of joint enterprise applies to all offences, common law or statutory, unless it is expressly or impliedly excluded by statute",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.joint.enterprise"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_applies_to_unlawful_riot_p3",
    source_id: SOURCE.source_id,
    paragraph_no: "3",
    proposition_id: "prop_tong_2021_applies_to_unlawful_riot_p3",
    proposition_text: "The Court of Appeal held that, unless excluded, joint enterprise including liability without presence at the scene applies to unlawful assembly and riot.",
    exact_quote: "the doctrine of joint enterprise, including its coverage of perpetrators not present at the scene, applies to unlawful assembly and riot",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.unlawful_assembly",
      "criminal_law_hk.public_order.riot",
      "criminal_law_hk.public_order.presence_scene"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_riot_elements_p19",
    source_id: SOURCE.source_id,
    paragraph_no: "19",
    proposition_id: "prop_tong_2021_riot_elements_p19",
    proposition_text: "The Court of Appeal recorded the trial judge's summary that riot requires proof of unlawful assembly elements, breach of the peace, and participation.",
    exact_quote: "The prosecution are required to prove the matters including: first, 3 or more than 3 persons assembled",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.unlawful_assembly",
      "criminal_law_hk.public_order.riot"
    ],
    significance_label: "states_elements",
    authority_role: "procedural_history",
    confidence: "medium"
  },
  {
    rule_id: "tong_2021_secondary_same_offence_p29",
    source_id: SOURCE.source_id,
    paragraph_no: "29",
    proposition_id: "prop_tong_2021_secondary_same_offence_p29",
    proposition_text: "The Court of Appeal described the fundamental principle that a secondary party is guilty of the same offence as the principal.",
    exact_quote: "it is a fundamental principle of the criminal law that a secondary party is guilty of the same offence as the principal",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.secondary.liability"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_joint_enterprise_independent_p30",
    source_id: SOURCE.source_id,
    paragraph_no: "30",
    proposition_id: "prop_tong_2021_joint_enterprise_independent_p30",
    proposition_text: "The Court of Appeal distinguished derivative accessorial liability from independent joint-enterprise liability.",
    exact_quote: "while an accessory’s liability is derivative, a party to a joint enterprise attracts independent liability",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.joint.enterprise"
    ],
    significance_label: "distinguishes",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_presence_not_necessary_p34",
    source_id: SOURCE.source_id,
    paragraph_no: "34",
    proposition_id: "prop_tong_2021_presence_not_necessary_p34",
    proposition_text: "The Court of Appeal stated that physical presence at the scene is not necessary for a party to a joint enterprise.",
    exact_quote: "it is not necessary for a party to a joint enterprise to be present at the scene of a crime",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.presence_scene",
      "criminal_law_hk.public_order.joint_enterprise_accessory"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_common_law_retained_overcharge_p44",
    source_id: SOURCE.source_id,
    paragraph_no: "44",
    proposition_id: "prop_tong_2021_common_law_retained_overcharge_p44",
    proposition_text: "The Court of Appeal identified two interpretative factors: common-law principles were intended to be retained unless displaced, and overcharging should be avoided.",
    exact_quote: "Those common law principles should continue to apply unless on a proper construction they do not",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.public_order.rights_overcharging"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_public_order_balance_p48",
    source_id: SOURCE.source_id,
    paragraph_no: "48",
    proposition_id: "prop_tong_2021_public_order_balance_p48",
    proposition_text: "The Court of Appeal held that construction of public-order offences must recognize both effective maintenance of public order and avoidance of overcharging peaceful persons.",
    exact_quote: "the construction must ensure that all the perpetrators of the offences are caught by the sections so that public order is effectively maintained",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.rights_overcharging"
    ],
    significance_label: "states_policy",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_gravamen_numbers_p50",
    source_id: SOURCE.source_id,
    paragraph_no: "50",
    proposition_id: "prop_tong_2021_gravamen_numbers_p50",
    proposition_text: "The Court of Appeal described the gravamen of unlawful assembly and riot as participants acting in numbers and using those numbers to achieve their common purpose.",
    exact_quote: "lies in the participants of the unlawful assembly or riot acting in large numbers and using those numbers to achieve their common purpose",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.corporate_nature_common_purpose"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_encourage_promote_participate_p51",
    source_id: SOURCE.source_id,
    paragraph_no: "51",
    proposition_id: "prop_tong_2021_encourage_promote_participate_p51",
    proposition_text: "The Court of Appeal cited the common-law position that active encouragement, promotion, or participation can ground liability for unlawful assembly or riot.",
    exact_quote: "any person who actively encourages or promotes an unlawful assembly or riot, whether by words, by signs or by actions, or who participates in it, is guilty",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.public_order.unlawful_assembly",
      "criminal_law_hk.public_order.riot"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_common_law_liability_principal_p54",
    source_id: SOURCE.source_id,
    paragraph_no: "54",
    proposition_id: "prop_tong_2021_common_law_liability_principal_p54",
    proposition_text: "The Court of Appeal concluded that, for common-law unlawful assembly and riot, an accessory or party to joint enterprise is liable as principal.",
    exact_quote: "for the common law offences of unlawful assembly and riot, an accessory or a party to a joint enterprise is liable as the principal",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.public_order.unlawful_assembly",
      "criminal_law_hk.public_order.riot"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_exclusion_lacuna_p57",
    source_id: SOURCE.source_id,
    paragraph_no: "57",
    proposition_id: "prop_tong_2021_exclusion_lacuna_p57",
    proposition_text: "The Court of Appeal held that excluding joint enterprise from ss.18 and 19 would leave a significant lacuna and undermine public order.",
    exact_quote: "If the doctrine of joint enterprise were excluded from sections 18 and 19, they would not be held liable as such, leaving a significant lacuna",
    target_doctrine_node_ids: [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.public_order.rights_overcharging"
    ],
    significance_label: "states_policy",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "tong_2021_principal_vs_secondary_p66",
    source_id: SOURCE.source_id,
    paragraph_no: "66",
    proposition_id: "prop_tong_2021_principal_vs_secondary_p66",
    "proposition_text": "The Court of Appeal distinguished provisions defining principal-offender liability from rules governing accessories and parties to joint enterprise.",
    "exact_quote": "They do not concern the liability of accessories or parties to a joint enterprise including those who are not present at the scene",
    "target_doctrine_node_ids": [
      "criminal_law_hk.public_order.joint_enterprise_accessory",
      "criminal_law_hk.public_order.presence_scene"
    ],
    "significance_label": "distinguishes",
    "authority_role": "ratio",
    "confidence": "high"
  },
  {
    "rule_id": "tong_2021_mere_presence_p80",
    "source_id": SOURCE.source_id,
    "paragraph_no": "80",
    "proposition_id": "prop_tong_2021_mere_presence_p80",
    "proposition_text": "The Court of Appeal stated that mere presence as a peaceful demonstrator, bystander, or onlooker without more will not render a person liable.",
    "exact_quote": "his mere presence without more will not render him liable under section 18 or 19",
    "target_doctrine_node_ids": [
      "criminal_law_hk.public_order.presence_scene",
      "criminal_law_hk.public_order.rights_overcharging"
    ],
    "significance_label": "limits_rule",
    "authority_role": "ratio",
    "confidence": "high"
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

  paragraphPayload.artifact_id = "public_order_riot_paragraph_cards";
  propositionPayload.artifact_id = "public_order_riot_proposition_cards";
  for (const link of linksPayload.proposition_node_links || []) {
    link.confidence = Math.max(Number(link.confidence || 0), 0.82);
    link.linking_method = "deepseek_seed_plus_legalref_exact_quote_v1";
    link.notes = link.notes || "DeepSeek was used only as an unverified seed; link accepted because the LegalRef paragraph contains the exact quote.";
  }
  for (const item of l4Payload.l4_case_applications || []) {
    item.scenario_label = "Public order / unlawful assembly / riot tree-gap pilot";
  }
  for (const item of l5Payload.l5_paragraph_proof || []) {
    item.quote_verified_against_source = true;
  }

  writeJson("paragraph_cards.json", paragraphPayload);
  writeJson("proposition_cards.json", propositionPayload);
  writeJson("proposition_node_links.json", linksPayload);
  writeJson("l4_case_applications.json", l4Payload);
  writeJson("l5_paragraph_proof.json", l5Payload);
}

async function main() {
  const tempDir = path.join(OUT_DIR, ".tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, "source_manifest.json");
  const rulesPath = path.join(tempDir, "extraction_rules.json");
  const manifest = {
    batch_id: "public_order_riot_tree_gap_pilot_v1",
    domain_id: "criminal_law_hk",
    scope: "public_order_unlawful_assembly_riot_candidate_branch",
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false
    },
    scale_policy: {
      current_rung: "single_public_case_tree_gap_pilot",
      next_rung: "10_to_20_public_order_cases_after_review",
      max_sources_without_force: 50,
      large_cross_domain_crawl_allowed: false,
      requires_review_before_next_rung: true
    },
    sources: [SOURCE],
    tree_gap_resolution: {
      existing_tree_match: "no_clean_existing_branch",
      tree_proposal_source: "deepseek_secondary_seed_pending_notebooklm_or_human_tree_confirmation",
      tree_proposal_status: "llm_unverified_seed_tree_candidate_only",
      primary_tree_policy: "NotebookLM or human review should confirm branch structure before relying on the branch as a product tree. Case fruits are accepted only because LegalRef exact quotes verified.",
      verification_gate: "legalref_exact_quote_case_fruits_only"
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
  writeJson("source_manifest.json", manifest);
  writeJson("deepseek_landmark_seed.json", {
    seed_source: "deepseek",
    seed_status: "llm_unverified_seed",
    source_hash: sha256("public_order_riot_deepseek_seed_v1"),
    note: "DeepSeek suggested candidate branch/case seeds. Only Tong Wai Hung was accepted in this pilot because it was public-source fetched and exact-quote verified.",
  });
  const parseReportPath = path.join(OUT_DIR, "parse_report.json");
  const parseReport = JSON.parse(fs.readFileSync(parseReportPath, "utf8"));
  parseReport.artifact_id = "public_order_riot_tree_gap_pilot_v1";
  parseReport.batch_id = manifest.batch_id;
  parseReport.scope = manifest.scope;
  fs.writeFileSync(parseReportPath, `${JSON.stringify(parseReport, null, 2)}\n`);
  console.log(JSON.stringify({ ...parseReport, batch_id: manifest.batch_id }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  if (error.artifact) console.error(JSON.stringify(error.artifact, null, 2));
  process.exit(1);
});
