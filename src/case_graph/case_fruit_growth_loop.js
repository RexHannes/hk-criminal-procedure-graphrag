const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadDoctrineNodeCandidates } = require("./hybrid_doctrine_linker");
const { evaluateScaleReadiness, loadEnv } = require("./scale_readiness");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LOOP_CONFIG = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "case_fruit_growth_loop.json");
const DEFAULT_BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function runShell(command, { cwd = ROOT } = {}) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    env: process.env,
  });
  return {
    command,
    exit_code: result.status,
    ok: result.status === 0,
    stdout: String(result.stdout || "").slice(-12000),
    stderr: String(result.stderr || "").slice(-12000),
  };
}

function loadBatchArtifacts(batchDir = DEFAULT_BATCH_DIR) {
  const read = name => readJson(path.join(batchDir, name));
  return {
    manifest: read("source_manifest.json"),
    parseReport: read("parse_report.json"),
    paragraphs: read("paragraph_cards.json"),
    propositions: read("proposition_cards.json"),
    links: read("proposition_node_links.json"),
  };
}

function validateBranchTargets(config) {
  const allowed = config.default_scope?.allowed_doctrine_node_ids || [];
  const existing = new Set(loadDoctrineNodeCandidates().map(node => node.doctrine_node_id));
  const missing = allowed.filter(id => !existing.has(id));
  return {
    allowed_doctrine_node_ids: allowed,
    missing_doctrine_node_ids: missing,
    ok: missing.length === 0,
  };
}

function validateBatchAgainstLoop(config, batchDir = DEFAULT_BATCH_DIR) {
  const artifacts = loadBatchArtifacts(batchDir);
  const allowedNodes = new Set(config.default_scope?.allowed_doctrine_node_ids || []);
  const paragraphById = new Map((artifacts.paragraphs.paragraph_cards || []).map(item => [item.paragraph_id, item]));
  const correctionItems = [];
  const seenParagraphHashes = new Set();

  for (const source of artifacts.manifest.sources || []) {
    const haystack = `${source.source_visibility} ${source.tenant_id} ${source.licence_status} ${source.source_kind} ${source.source_url_or_path}`;
    if (source.source_visibility !== "public_demo" || source.tenant_id !== "public" || source.licence_status !== "public_judgment") {
      correctionItems.push({
        type: "forbidden_source_policy",
        source_id: source.source_id,
        message: "Only public_demo/public/public_judgment sources are allowed in this loop.",
      });
    }
    if (/private|licensed_book|firm/i.test(haystack)) {
      correctionItems.push({
        type: "private_source_marker",
        source_id: source.source_id,
        message: "Private/licensed markers are forbidden in public case-fruit growth loop.",
      });
    }
  }

  for (const paragraph of artifacts.paragraphs.paragraph_cards || []) {
    const hash = paragraph.chunk_hash || sha256(`${paragraph.case_id}:${paragraph.paragraph_no}:${paragraph.text}`);
    if (seenParagraphHashes.has(hash)) {
      correctionItems.push({
        type: "duplicate_or_stale_source",
        paragraph_id: paragraph.paragraph_id,
        message: "Duplicate paragraph hash detected.",
      });
    }
    seenParagraphHashes.add(hash);
  }

  for (const card of artifacts.propositions.proposition_cards || []) {
    const paragraph = paragraphById.get(card.paragraph_id);
    if (!paragraph) {
      correctionItems.push({ type: "paragraph_not_found", proposition_id: card.proposition_id, paragraph_id: card.paragraph_id });
    } else if (!String(paragraph.text || "").includes(card.exact_quote)) {
      correctionItems.push({ type: "quote_not_found", proposition_id: card.proposition_id, paragraph_id: card.paragraph_id });
    }
    if (card.answer_safe === true || card.review_state === "answer_safe" || card.answer_layer_status === "answer_safe") {
      correctionItems.push({ type: "auto_answer_safe_forbidden", proposition_id: card.proposition_id });
    }
    for (const nodeId of card.target_doctrine_node_ids || []) {
      if (!allowedNodes.has(nodeId)) {
        correctionItems.push({
          type: "wrong_branch_candidate",
          proposition_id: card.proposition_id,
          doctrine_node_id: nodeId,
          message: "Target doctrine node is outside the configured branch allow-list.",
        });
      }
    }
  }

  for (const link of artifacts.links.proposition_node_links || []) {
    if (!allowedNodes.has(link.doctrine_node_id)) {
      correctionItems.push({ type: "wrong_branch_candidate", link_id: link.link_id, doctrine_node_id: link.doctrine_node_id });
    }
    if (link.answer_layer_status !== "candidate_only" || link.review_status !== "machine_candidate") {
      correctionItems.push({
        type: "candidate_only_gate_failed",
        link_id: link.link_id,
        answer_layer_status: link.answer_layer_status,
        review_status: link.review_status,
      });
    }
  }

  return {
    batch_id: artifacts.manifest.batch_id,
    scope: artifacts.manifest.scope,
    source_count: artifacts.parseReport.source_count,
    paragraph_count: artifacts.parseReport.paragraph_count,
    proposition_count: artifacts.parseReport.proposition_count,
    link_count: (artifacts.links.proposition_node_links || []).length,
    correction_queue: {
      queue_id: config.correction_loop?.queue_id || "case_fruit_growth_correction_queue_v1",
      item_count: correctionItems.length,
      items: correctionItems,
    },
    ok: correctionItems.length === 0,
  };
}

function buildLoopReport({
  configPath = DEFAULT_LOOP_CONFIG,
  targetCases,
  batchDir = DEFAULT_BATCH_DIR,
  mode = "report",
  includeRemote = false,
  useDeepSeek = false,
} = {}) {
  const config = readJson(configPath);
  const env = loadEnv({ root: ROOT });
  const target = Number(targetCases || config.default_scope?.target_cases || 50);
  const branchReport = validateBranchTargets(config);
  const batchReport = validateBatchAgainstLoop(config, batchDir);
  const scale = evaluateScaleReadiness({ targetCases: target, batchDir, env });
  const canRunSafeLocal = branchReport.ok
    && batchReport.ok
    && scale.execution_allowed
    && target <= Number(config.default_scope?.target_cases || 50);
  const canRunRemote = canRunSafeLocal
    && includeRemote
    && Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.QDRANT_URL);
  const warnings = [];
  if (useDeepSeek && !env.DEEPSEEK_API_KEY) warnings.push("DeepSeek requested but DEEPSEEK_API_KEY is missing; proposal stage remains manual.");
  if (target > 50 && scale.status !== "green_for_requested_target") warnings.push("Target exceeds bail-next-rung policy; execution remains preflight/report-only.");
  if (!scale.gate_results?.find(g => g.gate_id === "production_embeddings_configured")?.ok) warnings.push("Production embeddings are not configured; semantic scale remains blocked.");
  if (!scale.gate_results?.find(g => g.gate_id === "production_reranker_configured")?.ok) warnings.push("Production reranker is not configured; rerank is pass-through/local.");

  return {
    loop_id: config.loop_id,
    generated_at: new Date().toISOString(),
    mode,
    requested_target_cases: target,
    branch: config.default_scope,
    token_policy: config.token_policy,
    branch_report: branchReport,
    batch_report: batchReport,
    scale_readiness: {
      status: scale.status,
      execution_allowed: scale.execution_allowed,
      blockers: scale.blockers,
      next_safe_action: scale.next_safe_action,
      gate_results: scale.gate_results,
    },
    execution_policy: {
      can_run_safe_local: canRunSafeLocal,
      can_run_remote: canRunRemote,
      include_remote_requested: includeRemote,
      use_deepseek_requested: useDeepSeek,
      auto_promote_answer_safe: false,
      bulk_auto_attach: false,
    },
    recommended_loop: config.loop_stages.map(stage => ({
      stage_id: stage.stage_id,
      goal: stage.goal,
      failure_policy: stage.failure_policy,
    })),
    commands: {
      report_only: config.safe_commands?.report_only || [],
      execute_safe_local: canRunSafeLocal ? (config.safe_commands?.execute_safe_local || []) : [],
      execute_safe_remote: canRunRemote ? (config.safe_commands?.execute_safe_remote || []) : [],
    },
    warnings,
    status: branchReport.ok && batchReport.ok
      ? (canRunSafeLocal ? "ready_for_bail_public_loop" : "preflight_only_not_executable")
      : "blocked_needs_correction_queue_review",
  };
}

function executeLoop(report, config, { includeRemote = false } = {}) {
  const commands = [
    ...(config.safe_commands?.report_only || []),
    ...(report.execution_policy.can_run_safe_local ? (config.safe_commands?.execute_safe_local || []) : []),
    ...(includeRemote && report.execution_policy.can_run_remote ? (config.safe_commands?.execute_safe_remote || []) : []),
  ];
  return commands.map(command => runShell(command));
}

module.exports = {
  DEFAULT_BATCH_DIR,
  DEFAULT_LOOP_CONFIG,
  buildLoopReport,
  executeLoop,
  loadBatchArtifacts,
  validateBatchAgainstLoop,
  validateBranchTargets,
};
