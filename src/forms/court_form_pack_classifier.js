const { classifyFormTemplate } = require("./form_system");
const { classifyPracticeLane } = require("./practice_lane_classifier");

function classifyCourtFormDocument(doc, context = {}) {
  const template = classifyFormTemplate(doc, context);
  const lane = classifyPracticeLane(template);
  return {
    ...template,
    practiceLane: lane.practiceLane,
    laneTaxonomyVersion: lane.taxonomyVersion,
    sourceBoundary: lane.sourceBoundary,
    laneRequiredFacts: lane.requiredFacts,
    laneBlockedConditions: lane.blockedConditions,
    laneSuggestedNextTasks: lane.suggestedNextTasks,
  };
}

function summarizeCourtFormClassifications(templates = []) {
  const countBy = key => templates.reduce((acc, template) => {
    const value = template[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return {
    templates: templates.length,
    laneDistribution: countBy("practiceLane"),
    documentIntentDistribution: countBy("documentIntent"),
    workflowStageDistribution: countBy("proceduralStage"),
    reviewStatusDistribution: countBy("reviewStatus"),
    classificationStatusDistribution: countBy("classificationStatus"),
  };
}

module.exports = {
  classifyCourtFormDocument,
  summarizeCourtFormClassifications,
};
