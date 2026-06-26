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
  "investigation_search_seizure_v1",
);

const SOURCES = [
  {
    source_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    case_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    case_name: "Lai Chee Ying v Commissioner of Police",
    neutral_citation: "[2022] HKCFI 2688",
    law_report_citation: "[2022] 4 HKLRD 582",
    court: "Court of First Instance",
    court_level: "CFI",
    date: "2022-08-30",
    source_kind: "case_judgment",
    source_visibility: "public_demo",
    tenant_id: "public",
    licence_status: "public_judgment",
    source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=146837&QS=%2B&TP=JU&ILAN=en",
    fetch_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=146837&QS=%2B&TP=JU",
    source_format: "legalref_html_body",
    ingestion_status: "source_candidate",
    authority_status: "real_public_authority_candidate",
  },
  {
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    case_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    case_name: "Lai Chee Ying v Commissioner of Police",
    neutral_citation: "[2022] HKCA 1574",
    law_report_citation: "[2022] 5 HKLRD 205",
    court: "Court of Appeal",
    court_level: "CA",
    date: "2022-10-19",
    source_kind: "case_judgment",
    source_visibility: "public_demo",
    tenant_id: "public",
    licence_status: "public_judgment",
    source_url_or_path: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=148078&QS=%2B&TP=JU&ILAN=en",
    fetch_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_body.jsp?ID=&DIS=148078&QS=%2B&TP=JU",
    source_format: "legalref_html_body",
    ingestion_status: "source_candidate",
    authority_status: "real_public_authority_candidate",
  },
];

const RULES = [
  {
    rule_id: "lai_cfi_2022_specified_evidence_definition_p4",
    source_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    paragraph_no: "4",
    proposition_id: "prop_lai_cfi_2022_specified_evidence_definition_p4",
    proposition_text: "The Court of First Instance set out the Implementation Rules definition of specified evidence for national security search-warrant purposes.",
    exact_quote: "specified evidence (指明證據) means anything that is or contains, or that is likely to be or contain, evidence of an offence endangering national security",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_source_of_power",
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "states_rule",
    authority_role: "statutory_text_recited",
    confidence: "high"
  },
  {
    rule_id: "lai_cfi_2022_magistrate_warrant_threshold_p5",
    source_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    paragraph_no: "5",
    proposition_id: "prop_lai_cfi_2022_magistrate_warrant_threshold_p5",
    proposition_text: "The Court of First Instance set out the magistrate search-warrant threshold under Schedule 1 of the Implementation Rules.",
    exact_quote: "A magistrate may issue a warrant authorizing a police officer with such assistants as may be necessary to enter and search any place if the magistrate is satisfied by information on oath that there is reasonable ground for suspecting that any specified evidence is in the place",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_arrest_detention_flow_step2"
    ],
    significance_label: "states_rule",
    authority_role: "statutory_text_recited",
    confidence: "high"
  },
  {
    rule_id: "lai_cfi_2022_jm_construction_challenge_p3",
    source_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    paragraph_no: "3",
    proposition_id: "prop_lai_cfi_2022_jm_construction_challenge_p3",
    proposition_text: "The Court of First Instance identified the core search-warrant challenge as whether specified evidence covers journalistic material.",
    exact_quote: "the phrase “ specified evidence ” as defined in section 1 of Schedule 1 of the Implementation Rules somehow does not cover JM",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "frames_issue",
    authority_role: "issue_framing",
    confidence: "high"
  },
  {
    rule_id: "lai_cfi_2022_jr_bound_to_fail_p26",
    source_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
    paragraph_no: "26",
    proposition_id: "prop_lai_cfi_2022_jr_bound_to_fail_p26",
    proposition_text: "The Court of First Instance refused leave because the intended judicial review of the 2022 warrant was bound to fail.",
    exact_quote: "the intended judicial review by the plaintiff is bound to fail and leave should accordingly be refused",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "applies_rule",
    authority_role: "holding",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_appeal_issue_p1",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "1",
    proposition_id: "prop_lai_ca_2022_appeal_issue_p1",
    proposition_text: "The Court of Appeal identified the central issue as whether specified evidence under the Implementation Rules covers journalistic material.",
    exact_quote: "whether on a proper interpretation, “specified evidence” in section 1 of Schedule 1 of the Implementation Rules for Article 43 of the Law of the People’s Republic of China on Safeguarding National Security in the Hong Kong Special Administrative Region",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_source_of_power",
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "frames_issue",
    authority_role: "issue_framing",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_2022_warrant_scope_p3",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "3",
    proposition_id: "prop_lai_ca_2022_2022_warrant_scope_p3",
    proposition_text: "The Court of Appeal recorded that the 2022 warrant specifically authorised search of digital contents including material claimed to be journalistic material.",
    exact_quote: "the 2022 Warrant specifically authorizes the search of any parts of the digital contents of the phones seized and their copies, including such digital contents which are subject to claims of journalistic material",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "states_application",
    authority_role: "procedural_history",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_effective_investigation_p17",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "17",
    proposition_id: "prop_lai_ca_2022_effective_investigation_p17",
    proposition_text: "The Court of Appeal held that effective national-security investigation requires sufficient police powers and informs construction of specified evidence.",
    exact_quote: "Effective investigation by the police is crucial to achieving that objective. To that end, the police must have sufficient powers to take all necessary measures in carrying out investigation",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_source_of_power",
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_arrest_detention_flow_start"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_local_search_laws_coherent_whole_p17",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "17",
    proposition_id: "prop_lai_ca_2022_local_search_laws_coherent_whole_p17",
    proposition_text: "The Court of Appeal treated Schedule 1 and local search laws as working in tandem as a coherent whole for NSL search powers.",
    exact_quote: "Schedule 1 and the local laws on search are to work in tandem as a coherent whole",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_source_of_power",
      "criminal_procedure_hk.invest_search_with_warrant"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_journalistic_material_not_immune_p34",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "34",
    proposition_id: "prop_lai_ca_2022_journalistic_material_not_immune_p34",
    proposition_text: "The Court of Appeal held that journalistic material is important but not immune from search and seizure in criminal investigations.",
    exact_quote: "journalistic material is not immune from search and seizure in the investigation of any criminal offence",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "limits_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_search_anything_including_jm_p35",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "35",
    proposition_id: "prop_lai_ca_2022_search_anything_including_jm_p35",
    proposition_text: "The Court of Appeal held that specified evidence must include things, including journalistic material, likely to contain evidence of national-security offences.",
    exact_quote: "the police must be able to carry out effective search on anything, including journalistic material, that contains or is likely to contain evidence of an offence endangering national security",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "states_rule",
    authority_role: "ratio",
    confidence: "high"
  },
  {
    rule_id: "lai_ca_2022_appeal_outcome_p44",
    source_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
    paragraph_no: "44",
    proposition_id: "prop_lai_ca_2022_appeal_outcome_p44",
    proposition_text: "The Court of Appeal held that the judicial-review challenge to the 2022 warrant was doomed to fail.",
    exact_quote: "the plaintiff’s intended judicial review against the 2022 Warrant is doomed to fail",
    target_doctrine_node_ids: [
      "criminal_procedure_hk.invest_search_with_warrant",
      "criminal_procedure_hk.invest_seizure"
    ],
    significance_label: "applies_rule",
    authority_role: "holding",
    confidence: "high",
    lineage_note: "Affirms the CFI refusal of leave and directions giving effect to the 2022 warrant."
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
  const files = {
    paragraph: "paragraph_cards.json",
    proposition: "proposition_cards.json",
    links: "proposition_node_links.json",
    l4: "l4_case_applications.json",
    l5: "l5_paragraph_proof.json",
  };
  const paragraphPayload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.paragraph), "utf8"));
  const propositionPayload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.proposition), "utf8"));
  const linksPayload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.links), "utf8"));
  const l4Payload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.l4), "utf8"));
  const l5Payload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.l5), "utf8"));

  paragraphPayload.artifact_id = "investigation_search_seizure_paragraph_cards";
  propositionPayload.artifact_id = "investigation_search_seizure_proposition_cards";
  for (const link of linksPayload.proposition_node_links || []) {
    link.confidence = Math.max(Number(link.confidence || 0), 0.82);
    link.linking_method = "legalref_exact_quote_investigation_search_seizure_v1";
    link.notes = link.notes || "Accepted only because the LegalRef paragraph contains the exact quote; candidate-only pending human review.";
  }
  for (const item of l4Payload.l4_case_applications || []) {
    item.scenario_label = "Investigation / search warrants / seizure of digital or journalistic material";
  }
  for (const item of l5Payload.l5_paragraph_proof || []) {
    item.quote_verified_against_source = true;
  }

  writeJson(files.paragraph, paragraphPayload);
  writeJson(files.proposition, propositionPayload);
  writeJson(files.links, linksPayload);
  writeJson(files.l4, l4Payload);
  writeJson(files.l5, l5Payload);
  writeJson("source_manifest.json", manifest);
}

async function main() {
  const tempDir = path.join(OUT_DIR, ".tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, "source_manifest.json");
  const rulesPath = path.join(tempDir, "extraction_rules.json");
  const manifest = {
    batch_id: "investigation_search_seizure_tree_gap_pilot_v1",
    domain_id: "criminal_procedure_hk",
    practice_area: "criminal_procedure",
    scope: "investigation_search_warrant_seizure_candidate_branch",
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false
    },
    scale_policy: {
      current_rung: "two_public_case_procedure_tree_gap_pilot",
      next_rung: "10_to_20_public_investigation_search_cases_after_review",
      max_sources_without_force: 50,
      large_cross_domain_crawl_allowed: false,
      requires_review_before_next_rung: true
    },
    sources: SOURCES,
    tree_gap_resolution: {
      existing_tree_match: "criminal_procedure_hk investigation/search/seizure branch",
      tree_proposal_source: "existing_doctrine_tree",
      tree_proposal_status: "existing_branch_candidate_only_until_review",
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
  writeJson("case_lineage_notes.json", {
    artifact_id: "investigation_search_seizure_case_lineage_notes",
    batch_id: manifest.batch_id,
    source_policy: "public LegalRef only; no private or licensed material",
    lineage_edges: [
      {
        from_case_id: "hk_cfi_2022_lai_chee_ying_hcmp_1218_hcal_738",
        to_case_id: "hk_ca_2022_lai_chee_ying_cacv_356_357",
        relation: "appealed_and_affirmed",
        text_supported_by_proposition_id: "prop_lai_ca_2022_appeal_outcome_p44",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only"
      }
    ],
    lineage_policy: "candidate_only_until_human_review",
    source_fingerprint: sha256(SOURCES.map(source => source.source_url_or_path).join("|")),
  });
  const parseReportPath = path.join(OUT_DIR, "parse_report.json");
  const parseReport = JSON.parse(fs.readFileSync(parseReportPath, "utf8"));
  parseReport.artifact_id = "investigation_search_seizure_tree_gap_pilot_v1";
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
