const path = require("path");
const { buildPart2DocumentAdvice } = require("../advice/part2_document_advice");
const { composeWorkflowTimeline } = require("../advice/workflow_timeline_composer");
const { loadFormStore } = require("./form_system");

const STORE_BY_LANE = {
  family_service: "fixtures/forms/private_lane_family_service_store",
  company_winding_up: "fixtures/forms/private_lane_company_provisional_liquidator_store",
};

function formIdsOrIntents(items) {
  return (items || []).map(item => item.documentIntent || item.templateId || item.title || "");
}

function compareList(expected, actual) {
  const expectedSet = new Set(expected || []);
  const actualSet = new Set(actual || []);
  return {
    expected: Array.from(expectedSet),
    actual: Array.from(actualSet),
    missing: Array.from(expectedSet).filter(item => !actualSet.has(item)),
    extra: Array.from(actualSet).filter(item => !expectedSet.has(item)),
  };
}

function matterForScenario(scenario) {
  const lane = scenario.expected.practiceLane || "";
  return {
    ...(scenario.facts || {}),
    practiceArea: lane === "family_service" ? "family_service" : lane === "company_winding_up" ? "company_corporate" : lane,
    practiceLane: lane,
    matterType: lane === "family_service" ? "family_service" : lane === "company_winding_up" ? "provisional_liquidator" : lane,
    workflowStage: scenario.expected.workflowStage || "",
    clientRole: lane === "family_service" ? "applicant" : lane === "company_winding_up" ? "creditor" : "solicitor",
  };
}

function compareScenario(scenario, options = {}) {
  const lane = scenario.expected.practiceLane || "";
  const storeDir = options.storeByLane?.[lane] || STORE_BY_LANE[lane] || "";
  if (!storeDir) {
    return {
      scenarioId: scenario.scenarioId,
      lane,
      compared: false,
      mismatchCount: 1,
      mismatches: ["no_store_for_lane"],
    };
  }
  const store = loadFormStore(path.join(process.cwd(), storeDir));
  const documentIntent = (scenario.expected.recommendedForms || [])[0] || "";
  const matter = matterForScenario(scenario);
  const part2 = buildPart2DocumentAdvice({
    store,
    matter,
    query: `${lane} ${scenario.expected.workflowStage} ${documentIntent} draft form workflow`,
    documentIntent,
    workflowStage: scenario.expected.workflowStage,
  });
  const part3 = composeWorkflowTimeline({
    part1LegalAnalysis: { status: "research_required" },
    documentaryFlow: part2.documentaryFlow,
  });
  const recommended = formIdsOrIntents(part2.documentaryFlow.recommendedDocuments);
  const blocked = formIdsOrIntents(part2.documentaryFlow.blockedDocuments);
  const recommendedCompare = compareList(scenario.expected.recommendedForms || [], recommended);
  const blockedCompare = compareList(scenario.expected.blockedForms || [], blocked);
  const missingFactsCompare = compareList(scenario.expected.missingFacts || [], part2.documentaryFlow.missingCrucialInformation || []);
  const requiredEvidenceCompare = compareList(scenario.expected.requiredEvidence || [], part2.documentaryFlow.requiredEvidence || []);
  const mismatches = [
    ...recommendedCompare.missing.map(item => `missing_recommended:${item}`),
    ...blockedCompare.missing.map(item => `missing_blocked:${item}`),
    ...missingFactsCompare.missing.map(item => `missing_fact_not_reported:${item}`),
    ...requiredEvidenceCompare.missing.map(item => `required_evidence_not_reported:${item}`),
  ];
  return {
    scenarioId: scenario.scenarioId,
    lane,
    storeDir,
    compared: true,
    sourceTextCommitted: false,
    notebooklmIsAuthority: false,
    notebooklmOverridesReviewGates: false,
    publicAuthority: false,
    recommendedCompare,
    blockedCompare,
    missingFactsCompare,
    requiredEvidenceCompare,
    draftabilityActual: part2.documentaryFlow.draftableDocuments.length ? "draftable_metadata_only" : part2.documentaryFlow.placeholderOnlyDocuments.length ? "placeholder_only" : "blocked_or_no_route",
    timelineRows: part3.timeline.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
}

function compareBackendAgainstNotebooklm(scenarios, options = {}) {
  const comparisons = (scenarios || []).map(scenario => compareScenario(scenario, options));
  return {
    comparisonVersion: "notebooklm-backend-comparator-v1",
    sourceTextCommitted: false,
    notebooklmIsAuthority: false,
    notebooklmOverridesReviewGates: false,
    mismatchesAutoFixed: false,
    comparedCount: comparisons.filter(item => item.compared).length,
    mismatchCount: comparisons.reduce((sum, item) => sum + item.mismatchCount, 0),
    comparisons,
  };
}

module.exports = {
  STORE_BY_LANE,
  compareBackendAgainstNotebooklm,
  compareScenario,
};
