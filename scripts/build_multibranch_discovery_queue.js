#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PLAN = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "multibranch_expansion_plan_2500.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "multibranch_discovery_queue_2500.json");

const SEED_CASE_LEADS = {
  theft_dishonesty_fraud: [
    {
      case_name: "HKSAR v Chan Kam Ching",
      possible_citation: "[2022] HKCFA 7; (2022) 25 HKCFAR 48",
      reason_for_relevance: "CFA treatment of fraud/deceit issues under the Theft Ordinance; lead only until public judgment paragraphs are verified.",
      lead_source_url: "https://www.hk-lawyer.org/content/%E2%80%9Cdeceit%E2%80%9D-and-%E2%80%9Cdeception%E2%80%9D-after-chan-kam-ching-deceivingly-simple-concepts",
      suggested_issue_tags: ["criminal_law_hk.fraud", "criminal_law_hk.theft.dishonesty"],
    },
    {
      case_name: "HKSAR v Lam Hin Fai",
      possible_citation: "[2016] 2 HKLRD 1210",
      reason_for_relevance: "Court of Appeal discussion of whether a Ghosh dishonesty direction is necessary; lead only until public judgment paragraphs are verified.",
      lead_source_url: "https://www.hk-lawyer.org/content/hksar-v-lam-hin-fai",
      suggested_issue_tags: ["criminal_law_hk.theft.dishonesty", "criminal_law_hk.fraud"],
    },
    {
      case_name: "Mo Yuk Ping v HKSAR",
      possible_citation: "(2007) 10 HKCFAR 386",
      reason_for_relevance: "CFA authority commonly cited for dishonesty/Ghosh treatment in Hong Kong; lead only until public judgment paragraphs are verified.",
      lead_source_url: "https://researchblog.law.hku.hk/2017/11/michael-jackson-on-determining-criminal.html",
      suggested_issue_tags: ["criminal_law_hk.theft.dishonesty"],
    },
    {
      case_name: "HKSAR v Lai Kin Hang Erwin and Others",
      possible_citation: "[2019] HKCA 547",
      reason_for_relevance: "Candidate post-Ivey/Ghosh dishonesty treatment; lead only until public judgment paragraphs are verified.",
      lead_source_url: "https://www.hkcfa.hk/data.json?case_court_sys=FA&case_ser_no=6&case_type=CC&case_yr=2019&i_doc_int_no=2&lang=E&src=pdf_printedcase_pdf",
      suggested_issue_tags: ["criminal_law_hk.theft.dishonesty"],
    },
  ],
  investigation_arrest_search_detention: [
    {
      case_name: "HKSAR v Lam Tat Ming",
      possible_citation: "(2000) 3 HKCFAR 168",
      reason_for_relevance: "CFA authority on confession/admissibility and law-enforcement evidence-gathering safeguards; public LegalRef/HKCFA paragraph verification required.",
      lead_source_url: "https://legalref.judiciary.hk/",
      suggested_issue_tags: ["criminal_procedure_hk.hksar_v_lam_tat_ming", "criminal_procedure_hk.invest_detention_after_arrest"],
    },
    {
      case_name: "HKSAR v Lai Man Ling",
      possible_citation: "[2021] HKCFA 28",
      reason_for_relevance: "Candidate search/seizure investigative-powers authority from existing doctrine tree; public judgment paragraphs required.",
      lead_source_url: "https://legalref.judiciary.hk/",
      suggested_issue_tags: ["criminal_procedure_hk.hksar_v_lai_man_ling", "criminal_procedure_hk.invest_search_with_warrant"],
    },
  ],
  public_order_riot_unlawful_assembly: [
    {
      case_name: "Secretary for Justice v Tong Wai Hung and Others",
      possible_citation: "[2021] HKCA 404",
      reason_for_relevance: "Existing exact-quote public-order pilot anchor; use for lineage expansion and related later-treatment cases.",
      lead_source_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=134508&QS=%2B&TP=JU&ILAN=en",
      suggested_issue_tags: ["criminal_law_hk.public_order.riot", "criminal_law_hk.public_order.joint_enterprise_accessory"],
    },
  ],
  sedition_public_expression: [
    {
      case_name: "HKSAR v Tam Tak Chi",
      possible_citation: "[2024] HKCA 231",
      reason_for_relevance: "Existing exact-quote sedition/public-expression pilot anchor; use for lineage expansion and related later-treatment cases.",
      lead_source_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=158600&QS=%2B&TP=JU&ILAN=en",
      suggested_issue_tags: ["criminal_law_hk.sedition_public_expression"],
    },
  ],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function parseArgs(argv) {
  const args = { plan: DEFAULT_PLAN, output: DEFAULT_OUTPUT, maxBranches: 8 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--plan") args.plan = path.resolve(ROOT, argv[++i] || args.plan);
    else if (arg === "--output") args.output = path.resolve(ROOT, argv[++i] || args.output);
    else if (arg === "--max-branches") args.maxBranches = Number(argv[++i] || args.maxBranches);
  }
  return args;
}

function queryTemplates(branch) {
  const samples = (branch.sample_node_ids || []).slice(0, 5);
  const root = branch.notebooklm_prompt_hint || branch.branch_family;
  return [
    `site:legalref.judiciary.hk "${branch.branch_family.replace(/_/g, " ")}" "HKSAR v"`,
    `site:legalref.judiciary.hk "${root.slice(0, 80)}"`,
    `site:hklii.hk "${branch.branch_family.replace(/_/g, " ")}" "Hong Kong"`,
    ...samples.map(nodeId => `site:legalref.judiciary.hk "${nodeId.replace(/^criminal_(law|procedure)_hk\./, "").replace(/[._]/g, " ")}"`),
  ].slice(0, 8);
}

function normalizeLead(branch, lead, index) {
  return {
    seed_id: `case_seed_${sha256(`${branch.branch_family}:${lead.case_name}:${lead.possible_citation}`).slice(0, 16)}`,
    branch_family: branch.branch_family,
    status: "search_result_candidate_needs_public_judgment_verification",
    seed_source: "search_or_secondary_public_lead",
    case_name: lead.case_name,
    possible_citation: lead.possible_citation,
    lead_source_url: lead.lead_source_url,
    reason_for_relevance: lead.reason_for_relevance,
    suggested_issue_tags: lead.suggested_issue_tags || [],
    priority_rank: index + 1,
    required_before_ingestion: [
      "verify_public_judgment_url_on_legalref_hklii_or_judiciary",
      "fetch_public_judgment",
      "paragraphize_source",
      "exact_quote_validate_every_proposition",
      "candidate_only_review_state",
    ],
    answer_safe_allowed: false,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = readJson(args.plan);
  const branches = (plan.branch_allocations || []).slice(0, args.maxBranches);
  const queue = {
    queue_id: "hk_criminal_multibranch_public_discovery_queue_v1",
    generated_at: new Date().toISOString(),
    source_plan_id: plan.plan_id,
    status: "candidate_discovery_only_not_ingested",
    purpose: "Branch-sorted candidate case discovery queue before public-source verification, paragraphization, extraction and Qdrant upsert.",
    policy: {
      public_judgment_required_before_ingestion: true,
      allowed_verified_sources: ["LegalRef", "HKLII", "Judiciary", "HKCFA"],
      secondary_public_leads_are_not_authority: true,
      deepseek_outputs_are_not_authority: true,
      exact_quote_required: true,
      private_or_licensed_sources_allowed: false,
      answer_safe_by_default: false,
    },
    branch_discovery: branches.map(branch => {
      const leads = (SEED_CASE_LEADS[branch.branch_family] || []).map((lead, index) => normalizeLead(branch, lead, index));
      return {
        branch_family: branch.branch_family,
        priority: branch.priority,
        target_case_quota: branch.target_case_quota,
        initial_rung_case_count: branch.initial_rung_case_count,
        sample_node_ids: branch.sample_node_ids || [],
        search_queries: queryTemplates(branch).map((query, index) => ({
          query_id: `search_${sha256(`${branch.branch_family}:${query}`).slice(0, 12)}`,
          query,
          status: "ready_for_allowlisted_public_search",
          priority_rank: index + 1,
        })),
        candidate_case_leads: leads,
        next_action: leads.length
          ? "verify_seed_leads_against_public_judgment_sources_then_extract"
          : "run_allowlisted_search_then_create_verified_public_case_registry",
      };
    }),
  };
  writeJson(args.output, queue);
  console.log(JSON.stringify({
    output: path.relative(ROOT, args.output),
    status: queue.status,
    branch_count: queue.branch_discovery.length,
    candidate_case_leads: queue.branch_discovery.reduce((sum, branch) => sum + branch.candidate_case_leads.length, 0),
    search_query_count: queue.branch_discovery.reduce((sum, branch) => sum + branch.search_queries.length, 0),
    first_branches: queue.branch_discovery.slice(0, 5).map(branch => ({
      branch_family: branch.branch_family,
      target_case_quota: branch.target_case_quota,
      seed_leads: branch.candidate_case_leads.length,
      search_queries: branch.search_queries.length,
    })),
  }, null, 2));
}

main();
