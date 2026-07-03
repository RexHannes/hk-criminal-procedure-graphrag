/**
 * Law-tree definitions used by relevance/diversity audits and retrieval.
 * A tree groups doctrine node ids (by exact id or prefix) under one
 * product-facing legal issue area.
 */

const LAW_TREES = [
  {
    tree_id: "criminal_public_order.assembly_proportionality",
    label: "Public assembly / proportionality",
    major: true,
    node_ids: ["criminal_procedure_hk.hksar_v_leung_kwok_hung"],
    node_prefixes: ["criminal_law_hk.public_order."],
    expected_tags: ["public_order", "peaceful_assembly", "proportionality", "unlawful_assembly", "riot", "assembly"],
  },
  {
    tree_id: "criminal_procedure.bail",
    label: "Bail (incl. NSL bail)",
    major: true,
    node_ids: [
      "criminal_procedure_hk.nsl_bail",
      "criminal_procedure_hk.bail_flow_step5",
      "criminal_procedure_hk.bail_factors",
      "criminal_procedure_hk.bail_right_to_bail",
    ],
    node_prefixes: [],
    expected_tags: ["bail", "nsl", "national_security", "surrender", "reoffending", "flight_risk"],
  },
  {
    tree_id: "criminal_law.theft.dishonesty",
    label: "Theft / dishonesty & fraud",
    major: true,
    node_ids: ["criminal_law_hk.theft.dishonesty", "criminal_law_hk.fraud"],
    node_prefixes: ["criminal_law_hk.theft."],
    expected_tags: ["dishonesty", "theft", "fraud", "deception", "appropriation", "belonging_to_another", "intention_permanently_deprive"],
  },
  {
    tree_id: "criminal_procedure.interview_caution_confession",
    label: "Interview / caution / confession",
    major: true,
    node_ids: [
      "criminal_procedure_hk.hksar_v_lam_tat_ming",
      "criminal_procedure_hk.invest_detention_after_arrest",
    ],
    node_prefixes: [],
    expected_tags: ["confession", "admissibility", "caution", "interview", "detention", "fair_trial", "residual_discretion", "undercover"],
  },
  {
    tree_id: "criminal_procedure.investigation_search",
    label: "Investigation / search / seizure",
    major: true,
    node_ids: [
      "criminal_procedure_hk.cap232_s50",
      "criminal_procedure_hk.invest_source_of_power",
      "criminal_procedure_hk.lai_chee_ying_v_commissioner_of_police",
    ],
    node_prefixes: ["criminal_procedure_hk.invest_search"],
    expected_tags: ["search", "warrant", "seizure", "arrest", "digital", "journalistic_material", "privacy"],
  },
  {
    tree_id: "criminal_law.sedition_public_expression",
    label: "Sedition / public expression",
    major: true,
    node_ids: ["criminal_law_hk.sedition_public_expression"],
    node_prefixes: ["criminal_law_hk.sedition."],
    expected_tags: ["sedition", "expression", "seditious_intention", "free_speech", "public_expression"],
  },
  {
    tree_id: "civil_procedure.abuse_process_pleadings",
    label: "Civil procedure / abuse of process & pleadings",
    major: false,
    node_ids: [],
    node_prefixes: ["civil_procedure_hk."],
    expected_tags: ["abuse_process", "pleadings", "res_judicata", "estoppel", "summary_judgment", "inconsistent_positions"],
  },
];

function treeForDoctrineNodeId(nodeId = "") {
  for (const tree of LAW_TREES) {
    if (tree.node_ids.includes(nodeId)) return tree;
    if (tree.node_prefixes.some(prefix => nodeId.startsWith(prefix))) return tree;
  }
  return null;
}

/** Group viewer evidence index records by tree, deduplicating per case+paragraph. */
function groupEvidenceByTree(index) {
  const byTree = new Map();
  for (const tree of LAW_TREES) byTree.set(tree.tree_id, { tree, records: [] });
  const byNode = index.by_doctrine_node_id || {};
  for (const [nodeId, items] of Object.entries(byNode)) {
    const tree = treeForDoctrineNodeId(nodeId);
    if (!tree) continue;
    const bucket = byTree.get(tree.tree_id);
    for (const item of items) {
      bucket.records.push({ ...item, doctrine_node_id: nodeId });
    }
  }
  // Dedup identical case+paragraph pairs that appear under multiple nodes of the same tree.
  for (const bucket of byTree.values()) {
    const seen = new Set();
    bucket.records = bucket.records.filter(record => {
      const key = `${record.case_id || record.case_name}::${record.paragraph_number}::${record.exact_quote}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return byTree;
}

module.exports = { LAW_TREES, treeForDoctrineNodeId, groupEvidenceByTree };
