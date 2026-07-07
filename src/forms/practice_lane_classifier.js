const fs = require("fs");
const path = require("path");

const TAXONOMY_PATH = path.join(process.cwd(), "data", "forms", "practice_lane_taxonomy.json");

function loadPracticeLaneTaxonomy(filePath = TAXONOMY_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function laneForTemplate(template, taxonomy = loadPracticeLaneTaxonomy()) {
  const practice = String(template.practiceArea || "").toLowerCase();
  const intent = String(template.documentIntent || "");
  const stage = String(template.proceduralStage || "");
  const title = String(template.title || "").toLowerCase();
  const matterTypes = new Set(template.applicableMatterTypes || []);
  const lanes = taxonomy.lanes || [];

  const scored = lanes.map(lane => {
    let score = 0;
    if (lane.laneId === practice) score += 8;
    if (lane.laneId === "commercial_contract" && practice === "commercial_contracts") score += 8;
    if (lane.laneId === "company_winding_up" && intent === "COMPANY_WINDING_UP_PETITION") score += 12;
    if (lane.laneId === "company_winding_up" && /winding|liquidation|statutory demand|creditor/.test(title)) score += 8;
    if (lane.laneId === "commercial_contract" && /shareholders|agreement|lease|contract|clause/.test(title)) score += 8;
    if (lane.laneId === "probate" && /\bformw\d|probate|grant|affidavit|will\b/.test(title)) score += 8;
    if ((lane.commonDocumentIntents || []).includes(intent)) score += 5;
    if ((lane.workflowStages || []).includes(stage)) score += 3;
    for (const matterType of lane.matterTypes || []) if (matterTypes.has(matterType)) score += 2;
    return { lane, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].lane : lanes.find(lane => lane.laneId === "general_civil_procedure");
}

function classifyPracticeLane(template, taxonomy = loadPracticeLaneTaxonomy()) {
  const lane = laneForTemplate(template, taxonomy);
  return {
    practiceLane: lane?.laneId || "general_civil_procedure",
    taxonomyVersion: taxonomy.taxonomy_version,
    sourceBoundary: lane?.sourceBoundary || "private_template_metadata_only",
    requiredFacts: lane?.requiredFacts || [],
    blockedConditions: lane?.blockedConditions || [],
    suggestedNextTasks: lane?.suggestedNextTasks || [],
  };
}

module.exports = {
  classifyPracticeLane,
  laneForTemplate,
  loadPracticeLaneTaxonomy,
};
