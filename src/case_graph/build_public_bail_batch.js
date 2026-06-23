const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function stripHtmlToText(html) {
  return normalizeWhitespace(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|td|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function collapseForQuote(value) {
  return normalizeWhitespace(value).replace(/\s+/g, " ");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchUrlOnce(url, { insecureTls = true, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: !insecureTls }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchUrlOnce(new URL(response.headers.location, url).toString(), { insecureTls, timeoutMs }).then(resolve, reject);
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
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function fetchUrl(url, { insecureTls = true, retries = 2, timeoutMs = 45000, retryDelayMs = 1500 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchUrlOnce(url, { insecureTls, timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function extractNumberedParagraph(text, paragraphNo) {
  const normalized = normalizeWhitespace(text);
  const re = new RegExp(`(?:^|\\n)${paragraphNo}\\.\\s*\\n?([\\s\\S]*?)(?=\\n\\d+\\.\\s|$)`);
  const match = normalized.match(re);
  if (!match) return "";
  return collapseForQuote(`${paragraphNo}. ${match[1]}`);
}

function caseRecord(source) {
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
    fixture_status: "real_public_source_batch",
    authority_status: source.authority_status || "real_public_authority_candidate",
  };
}

function validateManifestScalePolicy(manifest) {
  const errors = [];
  const sourcePolicy = manifest.source_policy || {};
  const scalePolicy = manifest.scale_policy || {};
  if (sourcePolicy.public_sources_only !== true) errors.push("public_sources_only_required");
  if (sourcePolicy.private_or_licensed_sources_allowed !== false) errors.push("private_or_licensed_sources_must_be_blocked");
  if (sourcePolicy.raw_private_upload_allowed !== false) errors.push("raw_private_upload_must_be_blocked");
  if (sourcePolicy.bulk_auto_attach_allowed !== false) errors.push("bulk_auto_attach_must_be_blocked");
  if (sourcePolicy.answer_safe_by_default !== false) errors.push("answer_safe_by_default_must_be_false");
  if (scalePolicy.large_cross_domain_crawl_allowed !== false) errors.push("large_cross_domain_crawl_must_be_blocked");
  if ((manifest.sources || []).length > Number(scalePolicy.max_sources_without_force || 50)) {
    errors.push("source_count_exceeds_scale_policy");
  }
  for (const source of manifest.sources || []) {
    if (source.source_visibility !== "public_demo") errors.push(`${source.source_id}:source_visibility_must_be_public_demo`);
    if (source.tenant_id !== "public") errors.push(`${source.source_id}:tenant_id_must_be_public`);
    if (source.licence_status !== "public_judgment") errors.push(`${source.source_id}:licence_status_must_be_public_judgment`);
    if (/private|licensed_book|firm/i.test(`${source.source_kind} ${source.licence_status} ${source.source_url_or_path}`)) {
      errors.push(`${source.source_id}:private_or_licensed_marker_forbidden`);
    }
  }
  if (errors.length) {
    const error = new Error("manifest_scale_policy_validation_failed");
    error.errors = errors;
    throw error;
  }
}

async function buildPublicBailBatch({
  manifestPath,
  rulesPath,
  outputDir,
  fetchSources = true,
  now = new Date().toISOString(),
  writePartialOnError = false,
} = {}) {
  if (!manifestPath) throw new Error("manifestPath required");
  if (!rulesPath) throw new Error("rulesPath required");
  if (!outputDir) throw new Error("outputDir required");
  const manifest = readJson(manifestPath);
  validateManifestScalePolicy(manifest);
  const rulesPayload = readJson(rulesPath);
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
        const parsedText = source.source_format === "legalref_html_body" ? stripHtmlToText(raw) : normalizeWhitespace(raw);
        htmlTextBySource.set(source.source_id, parsedText);
        cases.push(caseRecord(source));
      } catch (error) {
        errors.push(`${source.source_id}:fetch_failed:${error.message}`);
      }
    }
  }

  const paragraphByKey = new Map();
  for (const rule of rulesPayload.rules || []) {
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
      rejected.push({ rule_id: rule.rule_id, source_id: rule.source_id, reason: "paragraph_not_found" });
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
        fixture_status: "real_public_source_batch",
        authority_status: source.authority_status || "real_public_authority_candidate",
      };
      paragraphByKey.set(paragraphKey, paragraph);
      paragraphCards.push(paragraph);
    }

    const proposition = {
      proposition_id: rule.proposition_id,
      case_id: source.case_id,
      paragraph_id: paragraphId,
      source_paragraph: rule.paragraph_no,
      exact_quote: rule.exact_quote,
      proposition_text: rule.proposition_text,
      tree_node_ids: rule.source_tree_node_ids || [],
      target_doctrine_node_ids: rule.target_doctrine_node_ids || [],
      significance_label: rule.significance_label,
      authority_role: rule.authority_role,
      confidence: rule.confidence,
      review_state: "machine_candidate",
      answer_safe: false,
      human_review_required: true,
      source_visibility: "public_demo",
      tenant_id: "public",
      fixture_status: "real_public_source_batch",
      authority_status: source.authority_status || "real_public_authority_candidate",
      source_url: source.source_url_or_path,
      lineage_note: rule.lineage_note || "",
    };
    propositionCards.push(proposition);

    for (const doctrineNodeId of rule.target_doctrine_node_ids || []) {
      links.push({
        link_id: `${rule.proposition_id}__${doctrineNodeId}`,
        proposition_id: rule.proposition_id,
        doctrine_node_id: doctrineNodeId,
        source_tree_node_ids: rule.source_tree_node_ids || [],
        link_type: "candidate",
        authority_role: rule.authority_role,
        significance_label: rule.significance_label,
        confidence: rule.link_confidence || 0.5,
        linking_method: "public_bail_batch_exact_quote_rules_v1",
        review_status: "machine_candidate",
        answer_layer_status: "candidate_only",
        human_review_required: true,
        notes: rule.lineage_note || "",
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
      scenario_label: "Bail / NSL bail threshold and conditions",
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

  const artifact = {
    artifact_id: "criminal_bail_public_batch_v1_artifact",
    generated_at: now,
    batch_id: manifest.batch_id,
    domain_id: manifest.domain_id,
    scope: manifest.scope,
    status: "public_source_candidate_links",
    source_count: cases.length,
    paragraph_count: paragraphCards.length,
    proposition_count: propositionCards.length,
    link_count: links.length,
    rejected_count: rejected.length,
    errors,
    rejected,
  };

  if (!writePartialOnError && (errors.length || rejected.length)) {
    const error = new Error("public_bail_batch_incomplete");
    error.artifact = artifact;
    error.errors = [
      ...errors,
      ...rejected.map(item => `${item.rule_id || item.source_id || "unknown"}:${item.reason || item.message || "rejected"}`),
    ];
    throw error;
  }

  writeJson(path.join(outputDir, "paragraph_cards.json"), {
    artifact_id: "criminal_bail_public_batch_v1_paragraph_cards",
    generated_at: now,
    batch_id: manifest.batch_id,
    case_count: cases.length,
    paragraph_count: paragraphCards.length,
    cases,
    paragraph_cards: paragraphCards,
  });
  writeJson(path.join(outputDir, "proposition_cards.json"), {
    artifact_id: "criminal_bail_public_batch_v1_proposition_cards",
    generated_at: now,
    batch_id: manifest.batch_id,
    proposition_count: propositionCards.length,
    proposition_cards: propositionCards,
  });
  writeJson(path.join(outputDir, "proposition_node_links.json"), { proposition_node_links: links });
  writeJson(path.join(outputDir, "l4_case_applications.json"), { l4_case_applications: l4Applications });
  writeJson(path.join(outputDir, "l5_paragraph_proof.json"), { l5_paragraph_proof: l5Proof });
  writeJson(path.join(outputDir, "parse_report.json"), artifact);
  writeJson(path.join(outputDir, "case_fruits_artifact.json"), {
    ...artifact,
    proposition_node_links: links,
    l4_case_applications: l4Applications,
    l5_paragraph_proof: l5Proof,
  });

  return artifact;
}

module.exports = {
  buildPublicBailBatch,
  collapseForQuote,
  extractNumberedParagraph,
  stripHtmlToText,
  validateManifestScalePolicy,
};
