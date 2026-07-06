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
];

function loadPiMotorAccidentFlow() {
  const file = path.join(process.cwd(), "data", "workflow", "pi_motor_accident_flow.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = {
  WORKFLOW_STAGES,
  loadPiMotorAccidentFlow,
};
