#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DOMAIN_ROOT = path.join(ROOT, "data", "legal_domain_packs", "demo_maps");
const CRIM_INGEST_ROOT = path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1");
const OUTPUT = path.join(CRIM_INGEST_ROOT, "landmark_first_expansion_queue.json");

const DOMAINS = ["criminal_law_hk", "criminal_procedure_hk"];

const PRIORITY_RULES = [
  {
    priority: 1,
    branch_family: "theft_dishonesty_fraud",
    pattern: /(theft|dishonesty|fraud|appropriation|permanent.*deprive|property_dishonesty)/i,
    notebooklm_prompt_hint: "HK theft, fraud and dishonesty tests; include Theft Ordinance, Ghosh/Ivey treatment, HK CFA/CA lineages and offence-element cases.",
  },
  {
    priority: 1,
    branch_family: "investigation_arrest_search_detention",
    pattern: /(investigation|arrest|search|detention|reasonable suspicion|police force ordinance|icac)/i,
    notebooklm_prompt_hint: "HK criminal investigation, arrest, search, detention and reasonable suspicion; include statutory powers, admissibility consequences and leading HK cases.",
  },
  {
    priority: 1,
    branch_family: "public_order_riot_unlawful_assembly",
    pattern: /(public_order|unlawful assembly|riot|presence|common purpose|joint enterprise)/i,
    notebooklm_prompt_hint: "HK unlawful assembly and riot lineage after Tong Wai Hung; include physical presence, joint enterprise/accessory liability, common purpose, peaceful assembly and overcharging.",
  },
  {
    priority: 2,
    branch_family: "offences_against_person",
    pattern: /(murder|manslaughter|assault|battery|abh|wounding|gbh|rape|offences_person)/i,
    notebooklm_prompt_hint: "HK offences against the person; include homicide, assault, wounding/GBH, sexual offences, mens rea and sentencing/proof distinctions.",
  },
  {
    priority: 2,
    branch_family: "trial_no_case_jury_directions",
    pattern: /(trial|no case|jury|arraignment|prosecution case|defence case|summing|verdict)/i,
    notebooklm_prompt_hint: "HK criminal trial procedure, no-case submissions, jury directions, burden/standard and appellate treatment.",
  },
  {
    priority: 2,
    branch_family: "bribery_corruption_misconduct",
    pattern: /(bribery|corruption|pobo|misconduct.*public office|advantage|public servant)/i,
    notebooklm_prompt_hint: "HK POBO, misconduct in public office and corruption lineages; include CFA/CA authorities and element-by-element treatment.",
  },
  {
    priority: 2,
    branch_family: "aml_money_laundering",
    pattern: /(aml|money laundering|osco|reasonable grounds|wilful blindness|predicate)/i,
    notebooklm_prompt_hint: "HK money laundering / OSCO s25 lineages; include reasonable grounds, knowledge, wilful blindness and statutory defence cases.",
  },
  {
    priority: 2,
    branch_family: "appeals_reviews_sentence",
    pattern: /(appeal|review|sentence|conviction|question of law|reference by sj)/i,
    notebooklm_prompt_hint: "HK criminal appeals/reviews; include conviction/sentence appeal tests, proviso, unsafe conviction, questions of law and SJ references.",
  },
  {
    priority: 3,
    branch_family: "defences",
    pattern: /(self.defence|duress|mistake|insanity|automatism|intoxication|defence)/i,
    notebooklm_prompt_hint: "HK general criminal defences; include self-defence, duress, mistake, insanity, automatism and intoxication authorities.",
  },
  {
    priority: 3,
    branch_family: "indictments_charges_joinder",
    pattern: /(indictment|charge|joinder|severance|amendment|quashing)/i,
    notebooklm_prompt_hint: "HK indictments and charge sheets; include drafting, amendment, joinder, severance and quashing authorities.",
  },
  {
    priority: 3,
    branch_family: "nsl_procedure_non_bail",
    pattern: /(nsl_(search|designated|overseas|jury|surveillance)|national security law)/i,
    notebooklm_prompt_hint: "HK NSL criminal procedure excluding bail; include search/seizure, designated judges, no jury, overseas lawyers and surveillance authorities.",
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalizeNodeId(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function collectNodes() {
  const nodes = [];
  for (const domainId of DOMAINS) {
    const nodesDir = path.join(DOMAIN_ROOT, domainId, "nodes");
    for (const file of fs.readdirSync(nodesDir).filter(name => name.endsWith(".json")).sort()) {
      const payload = readJson(path.join(nodesDir, file));
      for (const node of payload.nodes || []) {
        const doctrineNodeId = normalizeNodeId(node, domainId);
        const label = node.label || node.title || node.name || doctrineNodeId;
        nodes.push({
          domain_id: domainId,
          doctrine_node_id: doctrineNodeId,
          label,
          node_type: node.type || "",
          section_file: file,
          search_text: `${doctrineNodeId} ${label} ${(node.search_terms || []).join(" ")} ${(node.summary || "")}`.toLowerCase(),
        });
      }
    }
  }
  return nodes;
}

function classifyNode(node) {
  const rawId = node.doctrine_node_id.replace(/^criminal_(law|procedure)_hk\./, "");
  if (/^(case_|criminal_(law|procedure)_hk\.case_|criminal_(law|procedure)_hk\.cap|cap[0-9]|bl_art|nsl_art)/i.test(rawId)) return "seed_case_or_statute";
  if (/^(gap_|criminal_(law|procedure)_hk\.gap_)/i.test(rawId)) return "gap_marker";
  if (/flow/i.test(rawId) || /flow/i.test(node.label)) return "procedure_flow";
  if (/ordinance|article|practice direction| cap |cap[0-9]/i.test(node.label)) return "statute_or_practice_seed";
  return "doctrine_or_procedure_branch";
}

function collectLinksFromDir(dir, bucket) {
  const linksPath = path.join(dir, "proposition_node_links.json");
  const reportPath = path.join(dir, "parse_report.json");
  const manifestPath = path.join(dir, "source_manifest.json");
  if (!fs.existsSync(linksPath)) return;
  const linksPayload = readJson(linksPath);
  const links = linksPayload.proposition_node_links || [];
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : {};
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  for (const link of links) {
    if (!link.doctrine_node_id) continue;
    if (!bucket.has(link.doctrine_node_id)) {
      bucket.set(link.doctrine_node_id, {
        doctrine_node_id: link.doctrine_node_id,
        link_count: 0,
        proposition_ids: new Set(),
        batches: new Set(),
        public_source_candidate: true,
        candidate_only: true,
      });
    }
    const item = bucket.get(link.doctrine_node_id);
    item.link_count += 1;
    if (link.proposition_id) item.proposition_ids.add(link.proposition_id);
    item.batches.add(manifest.batch_id || report.batch_id || path.basename(dir));
    if (link.answer_layer_status !== "candidate_only") item.candidate_only = false;
  }
}

function collectExistingCoverage() {
  const coverage = new Map();
  collectLinksFromDir(path.join(CRIM_INGEST_ROOT, "bail_public_batch_v1"), coverage);
  collectLinksFromDir(path.join(CRIM_INGEST_ROOT, "bail_pilot"), coverage);
  const gapRoot = path.join(CRIM_INGEST_ROOT, "tree_gap_pilots");
  if (fs.existsSync(gapRoot)) {
    for (const name of fs.readdirSync(gapRoot).sort()) {
      const dir = path.join(gapRoot, name);
      if (fs.statSync(dir).isDirectory()) collectLinksFromDir(dir, coverage);
    }
  }
  return coverage;
}

function familyForNode(node) {
  const match = PRIORITY_RULES.find(rule => rule.pattern.test(node.search_text));
  if (!match) {
    return {
      priority: 4,
      branch_family: node.domain_id === "criminal_law_hk" ? "other_criminal_law" : "other_criminal_procedure",
      notebooklm_prompt_hint: `Propose a HK case lineage and issue tree for ${node.label}.`,
    };
  }
  return {
    priority: match.priority,
    branch_family: match.branch_family,
    notebooklm_prompt_hint: match.notebooklm_prompt_hint,
  };
}

function hashQueueItem(item) {
  return crypto.createHash("sha256").update(`${item.doctrine_node_id}|${item.branch_family}|${item.label}`).digest("hex").slice(0, 16);
}

function main() {
  const nodes = collectNodes();
  const coverage = collectExistingCoverage();
  const queueItems = [];
  const coverageItems = [];

  for (const node of nodes) {
    const nodeClass = classifyNode(node);
    const covered = coverage.get(node.doctrine_node_id);
    const family = familyForNode(node);
    const candidate = {
      queue_item_id: "",
      domain_id: node.domain_id,
      doctrine_node_id: node.doctrine_node_id,
      label: node.label,
      node_class: nodeClass,
      branch_family: family.branch_family,
      priority: family.priority,
      existing_case_fruits: covered ? {
        link_count: covered.link_count,
        proposition_count: covered.proposition_ids.size,
        batches: Array.from(covered.batches).sort(),
        candidate_only: covered.candidate_only,
      } : {
        link_count: 0,
        proposition_count: 0,
        batches: [],
        candidate_only: true,
      },
      recommended_action: "",
      notebooklm_prompt_hint: family.notebooklm_prompt_hint,
      deepseek_role: "secondary_case_seed_or_extraction_rule_proposer_only",
      public_source_required: true,
      exact_quote_required: true,
      allowed_status: "machine_candidate",
      answer_safe_allowed: false,
    };
    candidate.queue_item_id = `criminal_landmark_queue_${hashQueueItem(candidate)}`;

    if (covered) {
      candidate.recommended_action = "covered_candidate_fruits_exist_keep_reviewing_and_expand_only_if_golden_tests_need_more";
      coverageItems.push(candidate);
    } else if (nodeClass === "doctrine_or_procedure_branch") {
      candidate.recommended_action = "landmark_first_branch_fill";
      queueItems.push(candidate);
    } else {
      candidate.recommended_action = "do_not_fill_directly_use_as_context_or_anchor_only";
      coverageItems.push(candidate);
    }
  }

  queueItems.sort((a, b) => a.priority - b.priority || a.domain_id.localeCompare(b.domain_id) || a.branch_family.localeCompare(b.branch_family) || a.label.localeCompare(b.label));

  const branchFamilies = {};
  for (const item of queueItems) {
    if (!branchFamilies[item.branch_family]) {
      branchFamilies[item.branch_family] = {
        branch_family: item.branch_family,
        priority: item.priority,
        queued_node_count: 0,
        sample_node_ids: [],
        notebooklm_prompt_hint: item.notebooklm_prompt_hint,
      };
    }
    branchFamilies[item.branch_family].queued_node_count += 1;
    if (branchFamilies[item.branch_family].sample_node_ids.length < 8) {
      branchFamilies[item.branch_family].sample_node_ids.push(item.doctrine_node_id);
    }
  }

  const output = {
    queue_id: "criminal_landmark_first_expansion_queue_v1",
    generated_at: new Date().toISOString(),
    status: "candidate_only_scale_preparation_not_bulk_execution",
    purpose: "Landmark-first branch expansion queue for criminal law/procedure case fruits.",
    source_policy: {
      notebooklm_role: "candidate_tree_and_landmark_lineage_proposer_only",
      deepseek_role: "secondary_case_seed_or_extraction_rule_proposer_only",
      public_sources_required: true,
      allowed_public_sources: ["LegalRef", "HKLII", "Judiciary"],
      exact_quote_required: true,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
      private_book_text_allowed_in_public_artifacts: false,
    },
    scale_policy: {
      target_10000_case_run_status: "blocked_until_scale_readiness_green",
      next_safe_action: "Pick one queued branch family, collect 3-5 public landmark cases, validate paragraph proof, then add API regression.",
      rung_sequence: ["3-5_landmark_cases", "10-20_branch_cases", "50_branch_cases", "100_single_section", "300_single_section", "1000_selected_sections", "10000_plus_domain_only_after_ops_gates"],
    },
    coverage_summary: {
      total_nodes: nodes.length,
      doctrine_or_procedure_nodes: nodes.filter(node => classifyNode(node) === "doctrine_or_procedure_branch").length,
      nodes_with_candidate_fruits: coverageItems.filter(item => item.existing_case_fruits.link_count > 0).length,
      queued_doctrine_or_procedure_nodes_without_fruits: queueItems.length,
      populated_batches: Array.from(new Set(coverageItems.flatMap(item => item.existing_case_fruits.batches || []))).sort(),
    },
    branch_family_queue: Object.values(branchFamilies).sort((a, b) => a.priority - b.priority || b.queued_node_count - a.queued_node_count),
    next_priority_queue: queueItems.slice(0, 40),
    covered_or_anchor_items: coverageItems.filter(item => item.existing_case_fruits.link_count > 0).slice(0, 80),
    validation_rules: [
      "No item in this queue is evidence.",
      "NotebookLM and DeepSeek leads remain unverified until public-source lookup succeeds.",
      "A case fruit can be created only after exact quote validation against paragraph_text.",
      "All new links must point to existing doctrine_node_id values or create candidate_tree_seed nodes with review gates.",
      "Contradictory or limiting cases must be stored as lineage/treatment notes, not overwritten doctrine.",
      "Do not run 10000-case execution from this queue while scale readiness is blocked.",
    ],
  };

  writeJson(OUTPUT, output);
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT),
    status: output.status,
    coverage_summary: output.coverage_summary,
    top_branch_families: output.branch_family_queue.slice(0, 8),
  }, null, 2));
}

main();
