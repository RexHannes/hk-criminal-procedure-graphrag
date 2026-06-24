const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadDoctrineNodeCandidates } = require("./hybrid_doctrine_linker");
const {
  loadBrowserDiscoveryPolicy,
} = require("./browser_guided_discovery");
const { evaluateScaleReadiness, loadEnv } = require("./scale_readiness");
const {
  postScaleSafeguardReport,
  validateForbiddenIssueFamilies,
  validateManifestDoctrineAllowlist,
  validateSourceCitationRecord,
} = require("./scale_ingest_safeguards");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LOOP_CONFIG = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "case_fruit_growth_loop.json");
const DEFAULT_BATCH_DIR = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1");
const DEFAULT_STATE_DIR = path.join(ROOT, "data", "legal_ingest", "reports", "case_fruit_growth_loop");

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
    const citation = validateSourceCitationRecord(source);
    if (!citation.ok) {
      correctionItems.push({
        type: "citation_record_failed",
        source_id: source.source_id,
        errors: citation.errors,
      });
    }
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
    const isAnswerSafe = card.answer_safe === true || card.review_state === "answer_safe" || card.answer_layer_status === "answer_safe";
    const approvedGold = isAnswerSafe
      && card.review_status === "approved"
      && card.verification_status === "source_verified"
      && Boolean(card.reviewed_by)
      && Boolean(card.review_note)
      && Boolean(card.citation && card.pinpoint && (card.supporting_quote || card.exact_quote));
    if (isAnswerSafe && !approvedGold) {
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
  const familyResult = validateForbiddenIssueFamilies({
    propositions: artifacts.propositions.proposition_cards || [],
    links: artifacts.links.proposition_node_links || [],
  });
  for (const item of familyResult.errors) correctionItems.push(item);
  const allowlistResult = validateManifestDoctrineAllowlist({
    allowedDoctrineNodeIds: config.default_scope?.allowed_doctrine_node_ids || [],
    propositions: artifacts.propositions.proposition_cards || [],
    links: artifacts.links.proposition_node_links || [],
  });
  for (const item of allowlistResult.errors) correctionItems.push(item);

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

function branchBacklog(config, batchDir = DEFAULT_BATCH_DIR) {
  const artifacts = loadBatchArtifacts(batchDir);
  const allowed = config.default_scope?.allowed_doctrine_node_ids || [];
  const propositionById = new Map((artifacts.propositions.proposition_cards || []).map(card => [card.proposition_id, card]));
  const paragraphById = new Map((artifacts.paragraphs.paragraph_cards || []).map(card => [card.paragraph_id, card]));
  const byNode = new Map(allowed.map(nodeId => [nodeId, {
    doctrine_node_id: nodeId,
    proposition_ids: new Set(),
    paragraph_ids: new Set(),
    source_ids: new Set(),
    lineage_notes: new Set(),
  }]));

  for (const link of artifacts.links.proposition_node_links || []) {
    if (!byNode.has(link.doctrine_node_id)) continue;
    const bucket = byNode.get(link.doctrine_node_id);
    const proposition = propositionById.get(link.proposition_id);
    if (proposition) {
      bucket.proposition_ids.add(proposition.proposition_id);
      bucket.paragraph_ids.add(proposition.paragraph_id);
      bucket.source_ids.add(proposition.case_id);
      if (proposition.lineage_note) bucket.lineage_notes.add(proposition.lineage_note);
    }
  }

  const paragraphPromptCache = (artifacts.paragraphs.paragraph_cards || []).map(paragraph => ({
    cache_key: sha256([
      paragraph.case_id,
      paragraph.paragraph_no,
      paragraph.chunk_hash || sha256(paragraph.text),
      (config.default_scope?.allowed_doctrine_node_ids || []).join("|"),
      "deepseek_candidate_proposal_loop_v1",
    ].join(":")),
    source_id: paragraph.case_id,
    paragraph_id: paragraph.paragraph_id,
    paragraph_no: paragraph.paragraph_no,
    paragraph_hash: paragraph.chunk_hash || sha256(paragraph.text),
    prompt_char_budget: config.token_policy?.max_source_paragraph_chars || 7000,
    paragraph_char_count: String(paragraph.text || "").length,
    deepseek_call_needed: false,
    reason: "current batch already has rule-based quote-verified proposition candidates",
  }));

  return {
    backlog_id: "case_fruit_branch_backlog_v1",
    loop_id: config.loop_id,
    branch_id: config.default_scope?.branch_id,
    target_case_rung: config.default_scope?.target_case_rung,
    max_cases_without_new_review_gate: config.default_scope?.target_cases,
    nodes: Array.from(byNode.values()).map(item => ({
      doctrine_node_id: item.doctrine_node_id,
      proposition_count: item.proposition_ids.size,
      paragraph_count: item.paragraph_ids.size,
      source_count: item.source_ids.size,
      proposition_ids: Array.from(item.proposition_ids).sort(),
      paragraph_ids: Array.from(item.paragraph_ids).sort(),
      source_ids: Array.from(item.source_ids).sort(),
      lineage_notes: Array.from(item.lineage_notes).sort(),
      status: item.proposition_ids.size ? "has_candidate_fruits_needs_review" : "needs_public_case_fruits",
      next_action: item.proposition_ids.size
        ? "review_candidate_cards_then_promote_gold_subset"
        : "discover_public_cases_for_this_branch",
    })),
    token_cache: {
      policy: config.token_policy,
      paragraph_prompt_cache: paragraphPromptCache,
    },
  };
}

function correctionQueue(config, batchReport) {
  return {
    queue_id: config.correction_loop?.queue_id || "case_fruit_growth_correction_queue_v1",
    loop_id: config.loop_id,
    retry_policy: config.correction_loop?.retry_policy || {},
    status: batchReport.correction_queue.item_count ? "needs_review" : "empty",
    item_count: batchReport.correction_queue.item_count,
    items: (batchReport.correction_queue.items || []).map((item, index) => ({
      correction_id: `case_fruit_correction_${String(index + 1).padStart(4, "0")}`,
      review_state: "open",
      retry_count: 0,
      max_machine_retries: config.correction_loop?.retry_policy?.max_machine_retries ?? 2,
      requires_human_after_retries: config.correction_loop?.retry_policy?.requires_human_after_retries !== false,
      never_auto_promote_after_retry: true,
      ...item,
    })),
  };
}

function writeLoopState({ report, config, stateDir = DEFAULT_STATE_DIR } = {}) {
  const backlog = branchBacklog(config);
  const corrections = correctionQueue(config, report.batch_report);
  fs.mkdirSync(stateDir, { recursive: true });
  const files = {
    report: path.join(stateDir, "last_report.json"),
    branch_backlog: path.join(stateDir, "branch_backlog.json"),
    correction_queue: path.join(stateDir, "correction_queue.json"),
  };
  fs.writeFileSync(files.report, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(files.branch_backlog, `${JSON.stringify(backlog, null, 2)}\n`);
  fs.writeFileSync(files.correction_queue, `${JSON.stringify(corrections, null, 2)}\n`);
  return {
    state_dir: stateDir,
    files,
    branch_backlog_summary: {
      node_count: backlog.nodes.length,
      nodes_with_candidate_fruits: backlog.nodes.filter(node => node.proposition_count > 0).length,
      prompt_cache_entries: backlog.token_cache.paragraph_prompt_cache.length,
    },
    correction_queue_summary: {
      status: corrections.status,
      item_count: corrections.item_count,
    },
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
  const browserPolicy = config.browser_guided_discovery?.policy_file
    ? loadBrowserDiscoveryPolicy(path.join(ROOT, config.browser_guided_discovery.policy_file))
    : null;
  const env = loadEnv({ root: ROOT });
  const target = Number(targetCases || config.default_scope?.target_cases || 50);
  const branchReport = validateBranchTargets(config);
  const batchReport = validateBatchAgainstLoop(config, batchDir);
  const backlog = branchBacklog(config, batchDir);
  const artifacts = loadBatchArtifacts(batchDir);
  const safeguardReport = postScaleSafeguardReport({
    manifest: artifacts.manifest,
    propositions: artifacts.propositions.proposition_cards || [],
    links: artifacts.links.proposition_node_links || [],
    allowedDoctrineNodeIds: config.default_scope?.allowed_doctrine_node_ids || [],
  });
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
    browser_guided_discovery: config.browser_guided_discovery ? {
      enabled: config.browser_guided_discovery.enabled === true,
      policy_id: browserPolicy?.policy_id || "",
      browser_mode: browserPolicy?.browser_mode || "",
      allowed_domains: browserPolicy?.allowed_domains || [],
      max_searches_per_run: browserPolicy?.rate_limits?.max_searches_per_run || null,
      max_fetches_per_run: browserPolicy?.rate_limits?.max_fetches_per_run || null,
      answer_safe_promotion_allowed: browserPolicy?.answer_safe_promotion_allowed === true,
      deepseek_default_status: browserPolicy?.deepseek_case_seed_policy?.default_status || "",
    } : null,
    branch_report: branchReport,
    batch_report: batchReport,
    post_scale_safeguards: safeguardReport,
    branch_backlog_summary: {
      node_count: backlog.nodes.length,
      nodes_with_candidate_fruits: backlog.nodes.filter(node => node.proposition_count > 0).length,
      prompt_cache_entries: backlog.token_cache.paragraph_prompt_cache.length,
    },
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
  DEFAULT_STATE_DIR,
  buildLoopReport,
  branchBacklog,
  correctionQueue,
  executeLoop,
  loadBatchArtifacts,
  validateBatchAgainstLoop,
  validateBranchTargets,
  writeLoopState,
};
