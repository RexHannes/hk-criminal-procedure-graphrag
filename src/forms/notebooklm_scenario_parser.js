const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXPECTED_NOTE_FILES = [
  "family_service.md",
  "family_answer.md",
  "family_children.md",
  "family_ancillary_relief.md",
  "family_post_trial.md",
  "company_winding_up_provisional_liquidator.md",
  "company_winding_up_meetings.md",
  "company_winding_up_voluntary.md",
];

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function splitList(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBoolish(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "yes", "draftable", "ready"].includes(normalized)) return true;
  if (["false", "no", "blocked", "not draftable"].includes(normalized)) return false;
  return null;
}

function parseMatterFact(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const [key, raw = "true"] = trimmed.split(/\s*[:=]\s*/);
  const bool = parseBoolish(raw);
  return [key.trim(), bool === null ? raw.trim() : bool];
}

function scenarioFromPairs({ id, sourceFile, noteText, pairs }) {
  const facts = {};
  for (const item of splitList(pairs.facts || pairs.scenario_facts || "")) {
    const parsed = parseMatterFact(item);
    if (parsed) facts[parsed[0]] = parsed[1];
  }
  return {
    scenarioId: id,
    sourceFile,
    sourceHash: sha(noteText),
    sourceTextCommitted: false,
    provenance: "INTERNAL_USAGE_NOTE",
    notebooklmIsAuthority: false,
    facts,
    expected: {
      practiceLane: pairs.practice_lane || pairs.lane || "",
      workflowStage: pairs.workflow_stage || pairs.stage || "",
      recommendedForms: splitList(pairs.recommended_forms || pairs.expected_recommended_forms || ""),
      blockedForms: splitList(pairs.blocked_forms || pairs.expected_blocked_forms || ""),
      missingFacts: splitList(pairs.missing_facts || ""),
      requiredEvidence: splitList(pairs.required_evidence || ""),
      draftability: pairs.draftability || "",
      timelineTasks: splitList(pairs.timeline_tasks || pairs.tasks || ""),
      citationsOrSourceReferences: splitList(pairs.citations || pairs.source_references || ""),
    },
  };
}

function parseScenarioBlocks(noteText, sourceFile) {
  const blocks = [];
  let current = null;
  for (const line of String(noteText || "").split(/\r?\n/)) {
    const scenario = line.match(/^\s*(?:#{1,4}\s*)?Scenario\s*[:\-]\s*(.+?)\s*$/i);
    if (scenario) {
      if (current) blocks.push(current);
      current = { title: scenario[1].trim(), pairs: {} };
      continue;
    }
    const pair = line.match(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z0-9 _/-]{1,80})\s*:\s*(.*?)\s*$/);
    if (pair && current) {
      const key = pair[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      current.pairs[key] = pair[2].trim();
    }
  }
  if (current) blocks.push(current);
  if (!blocks.length && String(noteText || "").trim()) blocks.push({ title: path.basename(sourceFile, path.extname(sourceFile)), pairs: {} });
  return blocks.map((block, index) => scenarioFromPairs({
    id: `${path.basename(sourceFile, path.extname(sourceFile))}:${index + 1}`,
    sourceFile,
    noteText,
    pairs: block.pairs,
  }));
}

function fallbackScenarios() {
  return [
    {
      scenarioId: "fallback_family_service:1",
      sourceFile: "sanitized_fallback_family_service",
      sourceHash: sha("fallback_family_service"),
      sourceTextCommitted: false,
      provenance: "INTERNAL_USAGE_NOTE",
      notebooklmIsAuthority: false,
      facts: {
        proceedingsIssued: true,
        respondentIdentified: true,
        serviceAddressKnown: true,
        serviceMethodSelected: true,
      },
      expected: {
        practiceLane: "family_service",
        workflowStage: "FAMILY_SERVICE",
        recommendedForms: ["FAMILY_SERVICE_ACKNOWLEDGMENT"],
        blockedForms: [],
        missingFacts: [],
        requiredEvidence: [],
        draftability: "draftable_metadata_only",
        timelineTasks: ["Prepare family service acknowledgment metadata pack"],
        citationsOrSourceReferences: [],
      },
    },
    {
      scenarioId: "fallback_provisional_liquidator:1",
      sourceFile: "sanitized_fallback_company_winding_up_provisional_liquidator",
      sourceHash: sha("fallback_provisional_liquidator"),
      sourceTextCommitted: false,
      provenance: "INTERNAL_USAGE_NOTE",
      notebooklmIsAuthority: false,
      facts: {
        companyIdentified: true,
        standingChecked: true,
        urgencyGroundsIdentified: true,
        assetRiskEvidenceAvailable: true,
      },
      expected: {
        practiceLane: "company_winding_up",
        workflowStage: "PROVISIONAL_LIQUIDATOR",
        recommendedForms: ["COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION"],
        blockedForms: [],
        missingFacts: [],
        requiredEvidence: [],
        draftability: "draftable_metadata_only",
        timelineTasks: ["Prepare provisional liquidator application metadata pack"],
        citationsOrSourceReferences: [],
      },
    },
  ];
}

function parseNotebooklmScenarios(notesDir = path.join(process.cwd(), "private_notebooklm_notes")) {
  const files = fs.existsSync(notesDir)
    ? fs.readdirSync(notesDir).filter(name => name.endsWith(".md")).sort()
    : [];
  const scenarios = [];
  for (const file of files) {
    const fullPath = path.join(notesDir, file);
    const text = fs.readFileSync(fullPath, "utf8");
    scenarios.push(...parseScenarioBlocks(text, file));
  }
  const usedFallback = scenarios.length === 0;
  return {
    parserVersion: "notebooklm-scenario-parser-v1",
    notesDir,
    expectedNoteFiles: EXPECTED_NOTE_FILES,
    filesFound: files,
    usedFallback,
    sourceTextCommitted: false,
    notebooklmIsAuthority: false,
    provenance: "INTERNAL_USAGE_NOTE",
    scenarios: usedFallback ? fallbackScenarios() : scenarios,
  };
}

module.exports = {
  EXPECTED_NOTE_FILES,
  fallbackScenarios,
  parseNotebooklmScenarios,
  parseScenarioBlocks,
};
