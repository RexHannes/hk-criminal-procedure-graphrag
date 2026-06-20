const fs = require("fs");
const https = require("https");
const path = require("path");
const {
  collapseForQuote,
  extractNumberedParagraph,
  stripHtmlToText,
} = require("./build_public_bail_batch");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DOMAIN_DIR = path.join(ROOT, "data", "legal_domain_packs", "demo_maps", "criminal_procedure_hk");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fetchUrl(url, { insecureTls = true } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: !insecureTls }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchUrl(new URL(response.headers.location, url).toString(), { insecureTls }).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

function doctrineNodeIdFor(node, domainId) {
  if (node.doctrine_node_id) return node.doctrine_node_id;
  if (node.id && node.id.startsWith(`${domainId}.`)) return node.id;
  return `${domainId}.${node.id}`;
}

function collectDoctrineIds(domainDir = DEFAULT_DOMAIN_DIR) {
  const manifest = readJson(path.join(domainDir, "consolidated.json"));
  const ids = new Set();
  for (const section of manifest.sections || []) {
    const payload = readJson(path.join(domainDir, section.node_file));
    for (const node of payload.nodes || []) ids.add(doctrineNodeIdFor(node, "criminal_procedure_hk"));
  }
  return ids;
}

function validateProposalShape(proposal) {
  const errors = [];
  for (const field of ["proposal_id", "source_id", "paragraph_no", "exact_quote", "proposition_text"]) {
    if (!proposal[field]) errors.push(`missing_${field}`);
  }
  const nodeIds = proposal.target_doctrine_node_ids || proposal.candidate_doctrine_node_ids || [];
  if (!Array.isArray(nodeIds) || !nodeIds.length) errors.push("missing_candidate_doctrine_node_ids");
  if (proposal.answer_safe === true || proposal.answer_layer_status === "answer_safe") errors.push("proposal_must_not_be_answer_safe");
  if (proposal.review_state && proposal.review_state !== "machine_candidate") errors.push("proposal_review_state_must_be_machine_candidate");
  return errors;
}

function toExtractionRule(proposal) {
  const targetDoctrineNodeIds = proposal.target_doctrine_node_ids || proposal.candidate_doctrine_node_ids || [];
  return {
    rule_id: proposal.rule_id || proposal.proposal_id,
    source_id: proposal.source_id,
    paragraph_no: String(proposal.paragraph_no),
    exact_quote: proposal.exact_quote,
    proposition_id: proposal.proposition_id || `prop_${proposal.proposal_id.replace(/^proposal_/, "")}`,
    proposition_text: proposal.proposition_text,
    target_doctrine_node_ids: targetDoctrineNodeIds,
    source_tree_node_ids: proposal.source_tree_node_ids || ["criminal_evidence.bail", "criminal_procedure.bail"],
    significance_label: proposal.significance_label || "application",
    authority_role: proposal.authority_role || "application",
    confidence: proposal.confidence || "medium",
    link_confidence: Number(proposal.link_confidence || proposal.confidence_score || 0.55),
    lineage_note: proposal.lineage_note || "Semi-auto proposed rule; exact quote validated, still machine_candidate only.",
  };
}

async function validateExtractionRuleProposals({
  proposalPath,
  manifestPath,
  domainDir = DEFAULT_DOMAIN_DIR,
  compileRules = false,
} = {}) {
  if (!proposalPath) throw new Error("proposalPath required");
  if (!manifestPath) throw new Error("manifestPath required");
  const proposalPayload = readJson(proposalPath);
  const manifest = readJson(manifestPath);
  const doctrineIds = collectDoctrineIds(domainDir);
  const sourceById = new Map((manifest.sources || []).map(source => [source.source_id, source]));
  const textBySource = new Map();
  const accepted = [];
  const rejected = [];

  for (const proposal of proposalPayload.proposals || []) {
    const errors = validateProposalShape(proposal);
    const source = sourceById.get(proposal.source_id);
    if (!source) errors.push("unknown_source_id");
    if (source && source.source_visibility !== "public_demo") errors.push("non_public_demo_source");
    if (source && source.licence_status !== "public_judgment") errors.push("non_public_judgment_source");
    const nodeIds = proposal.target_doctrine_node_ids || proposal.candidate_doctrine_node_ids || [];
    for (const nodeId of nodeIds) {
      if (!doctrineIds.has(nodeId)) errors.push(`unknown_doctrine_node:${nodeId}`);
    }

    let paragraphText = "";
    if (source && !errors.includes("unknown_source_id")) {
      try {
        if (!textBySource.has(source.source_id)) {
          const raw = await fetchUrl(source.fetch_url);
          textBySource.set(source.source_id, source.source_format === "legalref_html_body" ? stripHtmlToText(raw) : raw);
        }
        paragraphText = extractNumberedParagraph(textBySource.get(source.source_id), String(proposal.paragraph_no));
        if (!paragraphText) errors.push("paragraph_not_found");
        else if (!collapseForQuote(paragraphText).includes(collapseForQuote(proposal.exact_quote))) errors.push("exact_quote_not_found");
      } catch (error) {
        errors.push(`fetch_or_parse_failed:${error.message}`);
      }
    }

    const record = {
      proposal_id: proposal.proposal_id,
      source_id: proposal.source_id,
      paragraph_no: proposal.paragraph_no,
      target_doctrine_node_ids: nodeIds,
      validation_status: errors.length ? "rejected" : "accepted_machine_candidate",
      errors,
    };
    if (errors.length) rejected.push(record);
    else {
      accepted.push({
        ...record,
        exact_quote: proposal.exact_quote,
        proposition_text: proposal.proposition_text,
        extraction_rule: compileRules ? toExtractionRule(proposal) : undefined,
      });
    }
  }

  return {
    validator: "semi_auto_extraction_rule_proposals_v1",
    generated_at: new Date().toISOString(),
    proposal_set_id: proposalPayload.proposal_set_id,
    source_manifest_id: manifest.batch_id,
    proposal_count: (proposalPayload.proposals || []).length,
    accepted_count: accepted.length,
    rejected_count: rejected.length,
    accepted,
    rejected,
    policy: {
      exact_quote_required: true,
      known_doctrine_node_required: true,
      output_status: "machine_candidate_only",
      compile_rules: compileRules,
    },
  };
}

module.exports = {
  collectDoctrineIds,
  toExtractionRule,
  validateExtractionRuleProposals,
};
