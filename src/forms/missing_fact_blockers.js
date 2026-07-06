const { routeForms } = require("./form_system");

function missingFactBlockers(args) {
  const result = routeForms(args);
  return {
    missingFacts: result.missingFacts,
    requiredEvidence: result.requiredEvidence,
    blockedForms: result.blockedForms,
    blockedClauses: result.blockedClauses,
  };
}

module.exports = { missingFactBlockers };
