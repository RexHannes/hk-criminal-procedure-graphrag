const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  collapseForQuote,
  extractNumberedParagraph,
  fetchUrl,
  stripHtmlToText,
  validateManifestScalePolicy,
} = require("./build_public_bail_batch");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function caseRecord(source, fixtureStatus) {
  return {
    case_id: source.case_id,
    case_name: source.case_name,
    neutral_citation: source.neutral_citation,
    law_report_citation: source.law_report_citation || "",
    court: source.court,
    court_level: source.court_level,
    date: source.date,
    source_url_or_path: source.source_url_or_path,
    source_visibility: source.source_visibility,
    tenant_id: source.tenant_id,
    source_kind: source.source_kind,
    licence_status: source.licence_status,
    ingestion_status: "paragraphized",
    fixture_status: fixtureStatus,
    authority_status: source.authority_status || "real_public_authority_candidate",
  };
}

function buildReviewQueue(propositions, casesById) {
  return {
    review_items: propositions.map(card => {
      const sourceCase = casesById.get(card.case_id) || {};
      return {
        review_item_id: `review_${card.proposition_id}`,
        item_type: "proposition_card",
        item_id: card.proposition_id,
        status: "open",
        review_status: "machine_candidate",
        human_review_required: true,
        payload_json: {
          case_id: card.case_id,
          case_name: sourceCase.case_name || "",
          neutral_citation: sourceCase.neutral_citation || "",
          paragraph_id: card.paragraph_id,
          paragraph_no: card.source_paragraph,
          exact_quote: card.exact_quote,
          proposition_text: card.proposition_text,
          target_doctrine_node_ids: card.target_doctrine_node_ids || [],
        },
      };
    }),
  };
}

async function buildBranchLandmarkPilot({
  config,
  outputDir,
  fetchSources = true,
  now = new Date().toISOString(),
} = {}) {
  if (!config) throw new Error("config required");
  if (!outputDir) throw new Error("outputDir required");

  const manifest = {
    batch_id: config.batch_id,
    domain_id: config.domain_id,
    scope: config.scope,
    branch_family_id: config.branch_family_id,
    source_policy: {
      public_sources_only: true,
      private_or_licensed_sources_allowed: false,
      raw_private_upload_allowed: false,
      bulk_auto_attach_allowed: false,
      answer_safe_by_default: false,
      ...(config.source_policy || {}),
    },
    scale_policy: {
      large_cross_domain_crawl_allowed: false,
      max_sources_without_force: config.max_cases || 5,
      branch_landmark_pilot_only: true,
      ...(config.scale_policy || {}),
    },
    branch_pilot_resolution: {
      branch_family_id: config.branch_family_id,
      tree_proposal_source: config.tree_proposal?.source || "notebooklm_or_deepseek_leads",
      tree_proposal_status: "candidate_only",
      verification_gate: "legalref_exact_quote_case_fruits_only",
      pending_landmark_cases: config.pending_landmark_cases || [],
    },
    sources: config.sources || [],
  };
  validateManifestScalePolicy(manifest);

  const fixtureStatus = config.fixture_status || "real_public_source_branch_landmark_pilot";
  const linkingMethod = config.linking_method || "branch_landmark_pilot_notebooklm_leads_plus_legalref_exact_quote_v1";
  const scenarioLabel = config.scenario_label || config.branch_label || config.scope;

  const sourceById = new Map((manifest.sources || []).map(source => [source.source_id, source]));
  const htmlTextBySource = new Map();
  const errors = [];
  const rejected = [];
  const cases = [];
  const paragraphCards = [];
  const propositionCards = [];
  const links = [];
  const l4Applications = [];
  const l5Proof = [];

  if (fetchSources) {
    for (const source of manifest.sources || []) {
      try {
        const raw = await fetchUrl(source.fetch_url);
        const parsedText = source.source_format === "legalref_html_body" || /\.htm/i.test(source.fetch_url)
          ? stripHtmlToText(raw)
          : String(raw || "").trim();
        htmlTextBySource.set(source.source_id, parsedText);
        cases.push(caseRecord(source, fixtureStatus));
      } catch (error) {
        errors.push(`${source.source_id}:fetch_failed:${error.message}`);
      }
    }
  }

  const paragraphByKey = new Map();
  for (const rule of config.rules || []) {
    const source = sourceById.get(rule.source_id);
    if (!source) {
      rejected.push({ rule_id: rule.rule_id, reason: "unknown_source_id" });
      continue;
    }
    const sourceText = htmlTextBySource.get(rule.source_id);
    if (!sourceText) {
      rejected.push({ rule_id: rule.rule_id, source_id: rule.source_id, reason: "source_text_unavailable" });
      continue;
    }
    const paragraphText = extractNumberedParagraph(sourceText, rule.paragraph_no);
    if (!paragraphText) {
      rejected.push({
        rule_id: rule.rule_id,
        source_id: rule.source_id,
        paragraph_no: rule.paragraph_no,
        reason: "paragraph_not_found",
      });
      continue;
    }
    const collapsedParagraph = collapseForQuote(paragraphText);
    const collapsedQuote = collapseForQuote(rule.exact_quote);
    if (!collapsedParagraph.includes(collapsedQuote)) {
      rejected.push({
        rule_id: rule.rule_id,
        source_id: rule.source_id,
        paragraph_no: rule.paragraph_no,
        reason: "exact_quote_not_found",
      });
      continue;
    }

    const paragraphId = `${source.case_id}_p${rule.paragraph_no}`;
    const paragraphKey = `${source.case_id}:${rule.paragraph_no}`;
    if (!paragraphByKey.has(paragraphKey)) {
      const paragraph = {
        paragraph_id: paragraphId,
        case_id: source.case_id,
        paragraph_no: rule.paragraph_no,
        text: collapsedParagraph,
        chunk_hash: sha256(`${source.case_id}:${rule.paragraph_no}:${collapsedParagraph}`),
        source_url: source.source_url_or_path,
        source_visibility: "public_demo",
        tenant_id: "public",
        fixture_status: fixtureStatus,
        authority_status: source.authority_status || "real_public_authority_candidate",
      };
      paragraphByKey.set(paragraphKey, paragraph);
      paragraphCards.push(paragraph);
    }

    propositionCards.push({
      proposition_id: rule.proposition_id,
      case_id: source.case_id,
      paragraph_id: paragraphId,
      source_paragraph: rule.paragraph_no,
      exact_quote: rule.exact_quote,
      proposition_text: rule.proposition_text,
      tree_node_ids: rule.target_doctrine_node_ids || [],
      target_doctrine_node_ids: rule.target_doctrine_node_ids || [],
      significance_label: rule.significance_label,
      authority_role: rule.authority_role,
      confidence: rule.confidence,
      review_state: "machine_candidate",
      answer_safe: false,
      human_review_required: true,
      source_visibility: "public_demo",
      tenant_id: "public",
      fixture_status: fixtureStatus,
      authority_status: source.authority_status || "real_public_authority_candidate",
      source_url: source.source_url_or_path,
      lineage_note: rule.lineage_note || "",
    });

    for (const doctrineNodeId of rule.target_doctrine_node_ids || []) {
      links.push({
        link_id: `${rule.proposition_id}__${doctrineNodeId}`,
        proposition_id: rule.proposition_id,
        doctrine_node_id: doctrineNodeId,
        link_type: "candidate",
        authority_role: rule.authority_role,
        significance_label: rule.significance_label,
        confidence: rule.link_confidence || 0.82,
        linking_method: linkingMethod,
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        notes: rule.lineage_note || "Branch landmark pilot; quote verified from public LegalRef source.",
        source_visibility: "public_demo",
        tenant_id: "public",
      });
    }

    l4Applications.push({
      l4_application_id: `l4_${rule.proposition_id}`,
      proposition_id: rule.proposition_id,
      case_id: source.case_id,
      case_name: source.case_name,
      neutral_citation: source.neutral_citation,
      paragraph_id: paragraphId,
      scenario_label: scenarioLabel,
      application_summary: rule.proposition_text,
      target_doctrine_node_ids: rule.target_doctrine_node_ids || [],
      significance_label: rule.significance_label,
      authority_role: rule.authority_role,
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: "public_demo",
      tenant_id: "public",
      lineage_note: rule.lineage_note || "",
    });

    l5Proof.push({
      l5_proof_id: `l5_${rule.proposition_id}`,
      proposition_id: rule.proposition_id,
      case_id: source.case_id,
      case_name: source.case_name,
      neutral_citation: source.neutral_citation,
      paragraph_id: paragraphId,
      para_no: rule.paragraph_no,
      exact_quote: rule.exact_quote,
      paragraph_text: collapsedParagraph,
      chunk_hash: paragraphByKey.get(paragraphKey).chunk_hash,
      quote_verified_against_source: true,
      review_status: "machine_candidate",
      answer_layer_status: "candidate_only",
      source_visibility: "public_demo",
      tenant_id: "public",
      source_url: source.source_url_or_path,
    });
  }

  const report = {
    artifact_id: `${config.batch_id}_artifact`,
    generated_at: now,
    batch_id: manifest.batch_id,
    branch_family_id: config.branch_family_id,
    domain_id: config.domain_id,
    scope: config.scope,
    source_count: cases.length,
    paragraph_count: paragraphCards.length,
    proposition_count: propositionCards.length,
    link_count: links.length,
    rejected_count: rejected.length,
    errors,
    rejected,
    status: rejected.length || errors.length ? "built_with_rejections" : "built_quote_verified_candidate",
  };

  if (errors.length || rejected.length) {
    const error = new Error("branch_landmark_pilot_incomplete");
    error.report = report;
    throw error;
  }

  const casesById = new Map(cases.map(item => [item.case_id, item]));
  writeJson(path.join(outputDir, "source_manifest.json"), manifest);
  if (config.tree_proposal) {
    writeJson(path.join(outputDir, "notebooklm_tree_proposal.json"), config.tree_proposal);
  }
  if (config.deepseek_landmark_seed) {
    writeJson(path.join(outputDir, "deepseek_landmark_seed.json"), config.deepseek_landmark_seed);
  }
  writeJson(path.join(outputDir, "paragraph_cards.json"), {
    artifact_id: `${config.batch_id}_paragraph_cards`,
    generated_at: now,
    batch_id: manifest.batch_id,
    case_count: cases.length,
    paragraph_count: paragraphCards.length,
    cases,
    paragraph_cards: paragraphCards,
  });
  writeJson(path.join(outputDir, "proposition_cards.json"), {
    artifact_id: `${config.batch_id}_proposition_cards`,
    generated_at: now,
    batch_id: manifest.batch_id,
    proposition_count: propositionCards.length,
    proposition_cards: propositionCards,
  });
  writeJson(path.join(outputDir, "proposition_node_links.json"), { proposition_node_links: links });
  writeJson(path.join(outputDir, "l4_case_applications.json"), { l4_case_applications: l4Applications });
  writeJson(path.join(outputDir, "l5_paragraph_proof.json"), { l5_paragraph_proof: l5Proof });
  writeJson(path.join(outputDir, "review_queue.json"), buildReviewQueue(propositionCards, casesById));
  writeJson(path.join(outputDir, "parse_report.json"), report);
  writeJson(path.join(outputDir, "case_fruits_artifact.json"), {
    ...report,
    proposition_node_links: links,
    l4_case_applications: l4Applications,
    l5_paragraph_proof: l5Proof,
  });

  return report;
}

async function buildBranchLandmarkPilotFromFile({
  configPath,
  outputDir,
  fetchSources = true,
} = {}) {
  const config = readJson(configPath);
  return buildBranchLandmarkPilot({ config, outputDir, fetchSources });
}

module.exports = {
  buildBranchLandmarkPilot,
  buildBranchLandmarkPilotFromFile,
  buildReviewQueue,
};
