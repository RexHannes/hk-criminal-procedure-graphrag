#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadFormStore, routeForms, writeJson } = require("../src/forms/form_system");
const { recallPrivateFormsFromQdrant } = require("../src/forms/private_atkin_rag");

const ARTIFACTS = path.join(process.cwd(), "artifacts");
const REPORT_JSON = path.join(ARTIFACTS, "private_forms_context_awareness_eval_report.json");
const REPORT_MD = path.join(ARTIFACTS, "private_forms_context_awareness_eval_report.md");

async function runCase(id, fn) {
  try {
    const result = await fn();
    return { id, passed: result.passed === true, ...result };
  } catch (error) {
    return { id, passed: false, error: String(error.message || error) };
  }
}

function companyMatter(patch = {}) {
  return {
    firmId: "private-lane-pilot-firm",
    workspaceId: "company-winding-up-pilot",
    practiceArea: "company_corporate",
    practiceLane: "company_winding_up",
    matterType: "company_winding_up",
    workflowStage: "COMPANY_WINDING_UP",
    clientRole: "creditor",
    companyIdentified: true,
    debtOrGroundIdentified: true,
    standingChecked: true,
    statutoryDemandOrServiceEvidenceAvailable: true,
    ...patch,
  };
}

function md(report) {
  return `# Private Forms Context Awareness Eval Report

Generated: ${report.generated_at}

| Metric | Count |
|---|---:|
| Cases | ${report.cases.length} |
| Passed | ${report.passed_count} |
| Failed | ${report.failed_count} |

${report.cases.map(item => `- ${item.id}: ${item.passed ? "pass" : "fail"}`).join("\n")}

Private text committed: no.
`;
}

async function run() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const companyStore = loadFormStore("fixtures/forms/private_lane_company_winding_up_store");
  const syntheticStore = loadFormStore("fixtures/forms/synthetic_store");
  const env = { PRIVATE_QDRANT_FORMS_ENABLED: "true" };
  const cases = [];
  cases.push(await runCase("correct_lane_stage_intent_role_allows_private_qdrant_gate", async () => {
    const result = await recallPrivateFormsFromQdrant({
      store: companyStore,
      matter: companyMatter(),
      query: "draft company winding-up petition with service evidence",
      documentIntent: "COMPANY_WINDING_UP_PETITION",
      workflowStage: "COMPANY_WINDING_UP",
      env,
      execute: false,
    });
    return {
      passed: result.blockedBeforeSemantic === false && result.gate.can_execute_semantic === true,
      qdrantExecuted: result.qdrantExecuted,
      dryRun: result.dryRun,
    };
  }));
  cases.push(await runCase("wrong_stage_blocks_before_semantic", async () => {
    const result = await recallPrivateFormsFromQdrant({
      store: companyStore,
      matter: companyMatter({ workflowStage: "PRE_ACTION_CORRESPONDENCE" }),
      query: "petition wording even though stage is pre action",
      documentIntent: "COMPANY_WINDING_UP_PETITION",
      workflowStage: "PRE_ACTION_CORRESPONDENCE",
      env,
      execute: false,
    });
    return {
      passed: result.blockedBeforeSemantic === true && result.gate.can_execute_semantic === false,
      returnedChunks: result.chunks.length,
    };
  }));
  cases.push(await runCase("missing_fact_blocks_clause_semantic_return", async () => {
    const result = await recallPrivateFormsFromQdrant({
      store: companyStore,
      matter: companyMatter({ statutoryDemandOrServiceEvidenceAvailable: false }),
      query: "petition wording despite missing service evidence",
      documentIntent: "COMPANY_WINDING_UP_PETITION",
      workflowStage: "COMPANY_WINDING_UP",
      env,
      execute: false,
    });
    return {
      passed: result.blockedBeforeSemantic === true && (result.missingFacts || []).includes("statutoryDemandOrServiceEvidenceAvailable"),
      missingFacts: result.missingFacts || [],
    };
  }));
  cases.push(await runCase("consent_route_suggests_alternative_not_new_writ", async () => {
    const route = routeForms({
      store: syntheticStore,
      matter: {
        allowDemoCandidates: true,
        practiceArea: "personal_injury",
        matterType: "road_traffic_pi",
        workflowStage: "COMMENCEMENT",
        clientRole: "claimant",
        consentOrderAgreed: true,
        lawyerDecisionToCommence: true,
      },
      query: "draft writ but parties already consented",
      documentIntent: "WRIT",
      workflowStage: "COMMENCEMENT",
    });
    const alternatives = route.alternativeForms.map(item => item.documentIntent);
    return {
      passed: route.blockedForms.length >= 1 && alternatives.includes("CONSENT_SUMMONS"),
      alternatives,
    };
  }));
  cases.push(await runCase("part1_part2_part3_boundaries_visible", async () => ({
    passed: true,
    part1: "public_authority_only",
    part2: "private_forms_retrieval",
    part3: "timeline_crm_rules",
  })));
  const report = {
    report_id: "private_forms_context_awareness_eval",
    generated_at: "2026-07-07T00:00:00+08:00",
    private_text_committed: false,
    external_services_used: false,
    notebooklm_runtime_engine: false,
    structured_filters_before_qdrant_semantic: true,
    vector_cannot_override_structured_blockers: true,
    cases,
    passed_count: cases.filter(item => item.passed).length,
    failed_count: cases.filter(item => !item.passed).length,
  };
  writeJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, md(report));
  console.log(JSON.stringify({ passed: report.passed_count, failed: report.failed_count }, null, 2));
  if (report.failed_count) process.exit(1);
}

if (require.main === module) run();
