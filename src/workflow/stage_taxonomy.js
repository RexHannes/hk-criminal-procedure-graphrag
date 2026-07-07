const fs = require("fs");
const path = require("path");

const WORKFLOW_STAGES = [
  "INTAKE",
  "URGENT_ACTIONS",
  "EVIDENCE_COLLECTION",
  "MEDICAL_EVIDENCE",
  "LIABILITY_ASSESSMENT",
  "PRE_ACTION_CORRESPONDENCE",
  "SETTLEMENT_NEGOTIATION",
  "COMMENCEMENT",
  "PLEADINGS",
  "DISCOVERY",
  "EXPERT_EVIDENCE",
  "MEDIATION",
  "TRIAL_PREPARATION",
  "TRIAL",
  "POST_JUDGMENT",
  "COSTS",
  "CLOSURE",
  "DOCUMENT_DRAFTING",
  "TRANSACTIONAL_DRAFTING",
  "PROBATE_APPLICATION",
  "COMPANY_WINDING_UP",
  "COMPANY_COMPLIANCE",
  "REGULATORY_COMPLIANCE",
];

function loadPiMotorAccidentFlow() {
  const file = path.join(process.cwd(), "data", "workflow", "pi_motor_accident_flow.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = {
  WORKFLOW_STAGES,
  loadPiMotorAccidentFlow,
};
