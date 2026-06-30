const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ROOT,
  PATHS,
  readJsonl,
  writeJsonl,
  loadCaseCorpus,
  byId,
  publicSourceUrl,
  normalizeParagraphText,
} = require("./case_corpus_store");

const VERIFICATION_REPORT_JSON = path.join(ROOT, "artifacts", "candidate_extraction_verification_report.json");
const VERIFICATION_REPORT_MD = path.join(ROOT, "artifacts", "candidate_extraction_verification_report.md");
const CARD_BUILD_REPORT_JSON = path.join(ROOT, "artifacts", "candidate_verified_cards_report.json");
const CARD_BUILD_REPORT_MD = path.join(ROOT, "artifacts", "candidate_verified_cards_report.md");

const ALLOWED_SOURCE_TOOLS = new Set(["notebooklm", "deepseek", "claude", "gpt", "manual"]);
const VALID_LEGAL_FUNCTIONS = new Set([
  "element",
  "test",
  "defence",
  "burden",
  "evidential_factor",
  "procedure",
  "sentencing",
  "statutory_interpretation",
  "case_application",
  "background_only",
]);
const VALID_AUTHORITY_ROLES = new Set([
  "ratio_candidate",
  "obiter_candidate",
  "application_to_facts",
  "procedural_history",
  "sentencing_observation",
  "background",
]);

function stableHash(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 16);
}

function safeId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function sourceBase(url = "") {
  return String(url || "").split("#")[0].replace(/\/+$/, "");
}

function normalizeSearch(text = "") {
  return normalizeParagraphText(text)
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCitation(text = "") {
  return normalizeSearch(text).replace(/\s+/g, "");
}

function normalizeParagraphNo(value = "") {
  const raw = typeof value === "object" && value
    ? (value.para_no || value.paragraph_no || value.paragraph || value.paragraph_id || "")
    : value;
  const match = String(raw || "").match(/(?:^|[_#\s-])p?(\d+)$/i) || String(raw || "").match(/(\d+)/);
  return match ? String(match[1]) : "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function issueMatches(candidate = {}, issue = "") {
  if (!issue) return true;
  const wanted = safeId(issue);
  const tags = asArray(candidate.candidate_issue_tags).map(tag => safeId(tag));
  if (tags.some(tag => tag.includes(wanted) || wanted.includes(tag))) return true;
  if (wanted === "theft_dishonesty") {
    return tags.some(tag => tag.includes("theft") || tag.includes("dishonesty") || tag.includes("fraud") || tag.includes("deception"));
  }
  return JSON.stringify(candidate).toLowerCase().includes(wanted.replace(/_/g, " "));
}

function loadCandidateExtractions(inputPath = PATHS.candidateExtractionsSample, { limit = 0, issue = "" } = {}) {
  let records = readJsonl(inputPath);
  if (issue) records = records.filter(record => issueMatches(record, issue));
  if (limit > 0) records = records.slice(0, limit);
  return records;
}

function findCase(candidate = {}, corpus = loadCaseCorpus({ mode: "sample" })) {
  const registry = corpus.registry || [];
  const citation = normalizeCitation(candidate.citation);
  const source = sourceBase(candidate.source_url);
  const name = normalizeSearch(candidate.case_name);
  return registry.find(item => citation && normalizeCitation(item.neutral_citation) === citation) ||
    registry.find(item => source && sourceBase(item.source_url) === source) ||
    registry.find(item => name && normalizeSearch(item.case_name) === name) ||
    null;
}

function quoteObjects(candidate = {}) {
  return asArray(candidate.candidate_quotes).map((item, index) => {
    if (typeof item === "string") return { quote: item, quote_index: index };
    return { ...item, quote: item.quote || item.exact_quote_support || item.text || "", quote_index: index };
  }).filter(item => String(item.quote || "").trim());
}

function principleObjects(candidate = {}) {
  return asArray(candidate.candidate_principles).map((item, index) => {
    if (typeof item === "string") return { principle_text: item, principle_index: index };
    return {
      ...item,
      principle_text: item.principle_text || item.text || item.principle || "",
      source_quote: item.source_quote || item.quote || item.exact_quote_support || "",
      principle_index: index,
    };
  }).filter(item => String(item.principle_text || "").trim());
}

function bestWindowQuote(quote = "", paragraphText = "") {
  const quoteTokens = normalizeSearch(quote).split(/\s+/).filter(Boolean);
  const words = normalizeParagraphText(paragraphText).split(/\s+/).filter(Boolean);
  if (!quoteTokens.length || !words.length) return { score: 0, exact_quote_support: "" };
  const target = new Set(quoteTokens);
  const windowSize = Math.max(quoteTokens.length, 1);
  let best = { score: 0, exact_quote_support: "" };
  for (let start = 0; start < words.length; start += 1) {
    const size = Math.min(words.length - start, windowSize + 3);
    if (size <= 0) break;
    const windowWords = words.slice(start, start + size);
    const windowTokens = normalizeSearch(windowWords.join(" ")).split(/\s+/).filter(Boolean);
    const overlap = windowTokens.filter(token => target.has(token)).length;
    const score = overlap / Math.max(target.size, windowTokens.length, 1);
    if (score > best.score) {
      best = { score, exact_quote_support: windowWords.join(" ") };
    }
  }
  return best;
}

function matchQuoteToParagraph(quote = "", paragraph = {}) {
  const rawQuote = normalizeParagraphText(quote);
  const text = normalizeParagraphText(paragraph.paragraph_text || "");
  if (!rawQuote || !text) return { score: 0, match_type: "empty", exact_quote_support: "" };
  if (text.includes(rawQuote)) {
    return { score: 1, match_type: "exact_substring", exact_quote_support: rawQuote };
  }
  const lowerText = text.toLowerCase();
  const lowerQuote = rawQuote.toLowerCase();
  const lowerIndex = lowerText.indexOf(lowerQuote);
  if (lowerIndex >= 0) {
    return {
      score: 0.99,
      match_type: "case_insensitive_substring",
      exact_quote_support: text.slice(lowerIndex, lowerIndex + rawQuote.length),
    };
  }
  const normalizedText = normalizeSearch(text);
  const normalizedQuote = normalizeSearch(rawQuote);
  if (normalizedText.includes(normalizedQuote)) {
    const window = bestWindowQuote(rawQuote, text);
    return {
      score: Math.max(0.95, window.score),
      match_type: "normalized_substring",
      exact_quote_support: window.exact_quote_support || rawQuote,
    };
  }
  const window = bestWindowQuote(rawQuote, text);
  return {
    score: window.score,
    match_type: window.score >= 0.92 ? "high_confidence_token_window" : "low_confidence",
    exact_quote_support: window.exact_quote_support,
  };
}

function bestQuoteMatch(quoteObject = {}, paragraphs = []) {
  const wantedPara = normalizeParagraphNo(quoteObject.paragraph_no || quoteObject.para_no || quoteObject.paragraph);
  const searchParagraphs = wantedPara
    ? paragraphs.filter(paragraph => String(paragraph.para_no) === wantedPara)
    : paragraphs;
  let best = null;
  for (const paragraph of searchParagraphs.length ? searchParagraphs : paragraphs) {
    const match = matchQuoteToParagraph(quoteObject.quote, paragraph);
    if (!best || match.score > best.score) best = { ...match, paragraph };
  }
  return best || { score: 0, match_type: "no_candidate_paragraph", exact_quote_support: "", paragraph: null };
}

function validateCandidateEnvelope(candidate = {}) {
  const reasons = [];
  if (!candidate.candidate_id) reasons.push("missing_candidate_id");
  if (!ALLOWED_SOURCE_TOOLS.has(candidate.source_tool)) reasons.push("invalid_source_tool");
  if (candidate.extraction_status !== "candidate_only") reasons.push("candidate_not_marked_candidate_only");
  if (candidate.authority_status !== "not_authority") reasons.push("candidate_treated_as_authority");
  if (!publicSourceUrl(candidate.source_url)) reasons.push("private_or_nonpublic_source");
  if (!candidate.case_name || !candidate.citation) reasons.push("missing_case_identity");
  return reasons;
}

function demotionFlagsForQuote(quote = {}, candidate = {}) {
  const flags = new Set();
  const support = normalizeParagraphText(quote.exact_quote_support || "");
  const words = support.split(/\s+/).filter(Boolean);
  const tags = quote.issue_tags || [];
  if (support.length < 18 || words.length < 3) flags.add("quote_too_short");
  if (support.length < 36 || words.length < 6) flags.add("quote_context_insufficient");
  if (quote.legal_function === "background_only" || /background|public case context/i.test(quote.proposition_text || "")) flags.add("background_only_not_principle");
  if (quote.legal_function === "sentencing" && tags.some(tag => /dishonesty|mens_rea|appropriation|belonging_to_another|intention_permanently_deprive|fraud|deception/.test(tag))) {
    flags.add("sentencing_only_not_liability");
  }
  if (tags.length > 4 || (tags.includes("criminal_law.theft") && tags.some(tag => /fraud|deception|interview_caution/.test(tag)))) flags.add("issue_tag_overbroad");
  if ((candidate.candidate_holdings || []).some(item => /unchecked|review|candidate|no final/i.test(String(item)))) flags.add("current_treatment_unchecked");
  return Array.from(flags);
}

function demotionFlagsForPrinciple(principle = {}, linkedQuote = {}) {
  const flags = new Set(linkedQuote.demotion_flags || []);
  if (/public case context only|background|not answer-safe/i.test(principle.principle_text || "")) flags.add("background_only_not_principle");
  if (/sentencing context/i.test(principle.principle_text || "") && (principle.issue_tags || []).some(tag => !/sentencing/.test(tag))) flags.add("sentencing_only_not_liability");
  flags.add("current_treatment_unchecked");
  return Array.from(flags);
}

function verifyOneCandidate(candidate = {}, corpus = loadCaseCorpus({ mode: "sample" }), options = {}) {
  const reasons = validateCandidateEnvelope(candidate);
  const matchedCase = findCase(candidate, corpus);
  if (!matchedCase) reasons.push("missing_case");

  const allParagraphs = matchedCase
    ? corpus.paragraphs.filter(paragraph => paragraph.case_id === matchedCase.case_id)
    : [];
  const wantedParagraphNos = new Set(asArray(candidate.candidate_key_paragraphs).map(normalizeParagraphNo).filter(Boolean));
  const paragraphPool = wantedParagraphNos.size
    ? allParagraphs.filter(paragraph => wantedParagraphNos.has(String(paragraph.para_no)))
    : allParagraphs;
  const missingParagraphs = Array.from(wantedParagraphNos).filter(paraNo => !allParagraphs.some(paragraph => String(paragraph.para_no) === paraNo));
  if (wantedParagraphNos.size && missingParagraphs.length) reasons.push("missing_paragraph");

  const acceptedQuotes = [];
  const rejectedQuotes = [];
  const minimumScore = Number(options.minimumScore || 0.92);
  for (const quote of quoteObjects(candidate)) {
    const match = bestQuoteMatch(quote, paragraphPool.length ? paragraphPool : allParagraphs);
    if (match.paragraph && match.score >= minimumScore && match.exact_quote_support && match.paragraph.paragraph_text.includes(match.exact_quote_support)) {
      const acceptedQuote = {
        quote_index: quote.quote_index,
        candidate_quote: quote.quote,
        exact_quote_support: match.exact_quote_support,
        paragraph_id: match.paragraph.paragraph_id,
        para_no: match.paragraph.para_no,
        source_url: match.paragraph.source_url,
        match_score: Number(match.score.toFixed(6)),
        match_type: match.match_type,
        issue_tags: uniq(asArray(quote.issue_tags).concat(candidate.candidate_issue_tags || [])),
        proposition_text: quote.proposition_text || "",
        legal_function: VALID_LEGAL_FUNCTIONS.has(quote.legal_function) ? quote.legal_function : "case_application",
        authority_role_candidate: quote.authority_role_candidate === "case_application"
          ? "application_to_facts"
          : (VALID_AUTHORITY_ROLES.has(quote.authority_role_candidate) ? quote.authority_role_candidate : "application_to_facts"),
      };
      acceptedQuote.demotion_flags = demotionFlagsForQuote(acceptedQuote, candidate);
      acceptedQuotes.push(acceptedQuote);
    } else {
      rejectedQuotes.push({
        quote_index: quote.quote_index,
        candidate_quote: quote.quote,
        reason: match.paragraph ? "quote_not_found" : "missing_paragraph",
        best_score: Number((match.score || 0).toFixed(6)),
      });
    }
  }

  if (!acceptedQuotes.length) reasons.push("quote_not_found");

  const acceptedPrinciples = [];
  const rejectedPrinciples = [];
  for (const principle of principleObjects(candidate)) {
    const supportQuote = normalizeSearch(principle.source_quote);
    const linkedQuote = supportQuote
      ? acceptedQuotes.find(item => normalizeSearch(item.candidate_quote) === supportQuote || normalizeSearch(item.exact_quote_support) === supportQuote)
      : acceptedQuotes[principle.principle_index] || acceptedQuotes[0];
    if (!linkedQuote) {
      rejectedPrinciples.push({
        principle_index: principle.principle_index,
        principle_text: principle.principle_text,
        reason: "unsupported_principle",
      });
    } else {
      const acceptedPrinciple = {
        principle_index: principle.principle_index,
        principle_text: principle.principle_text,
        paragraph_id: linkedQuote.paragraph_id,
        quote_index: linkedQuote.quote_index,
        exact_quote_support: linkedQuote.exact_quote_support,
        issue_tags: uniq(asArray(principle.issue_tags).concat(linkedQuote.issue_tags || [])),
      };
      acceptedPrinciple.demotion_flags = demotionFlagsForPrinciple(acceptedPrinciple, linkedQuote);
      acceptedPrinciples.push(acceptedPrinciple);
    }
  }

  if (principleObjects(candidate).length && !acceptedPrinciples.length) reasons.push("unsupported_principle");

  const status = reasons.length ? "rejected" : "accepted";
  return {
    candidate_id: candidate.candidate_id,
    source_tool: candidate.source_tool,
    authority_status: candidate.authority_status,
    extraction_status: candidate.extraction_status,
    status,
    case_id: matchedCase?.case_id || "",
    case_name: matchedCase?.case_name || candidate.case_name || "",
    citation: matchedCase?.neutral_citation || candidate.citation || "",
    source_url: matchedCase?.source_url || sourceBase(candidate.source_url),
    candidate_issue_tags: uniq(candidate.candidate_issue_tags || []),
    candidate_facts_summary: candidate.candidate_facts_summary || "",
    candidate_issues: asArray(candidate.candidate_issues),
    candidate_holdings: asArray(candidate.candidate_holdings),
    candidate_applies_when: asArray(candidate.candidate_applies_when),
    candidate_distinguishable_when: asArray(candidate.candidate_distinguishable_when),
    matched_paragraph_ids: uniq(acceptedQuotes.map(item => item.paragraph_id)),
    accepted_quotes: acceptedQuotes,
    rejected_quotes: rejectedQuotes,
    accepted_principles: acceptedPrinciples,
    rejected_principles: rejectedPrinciples,
    demotion_reasons: uniq(acceptedQuotes.flatMap(item => item.demotion_flags || []).concat(acceptedPrinciples.flatMap(item => item.demotion_flags || []))),
    rejection_reasons: uniq(reasons),
  };
}

function rejectionReasonCounts(records = []) {
  const counts = {};
  for (const record of records) {
    for (const reason of record.rejection_reasons || []) counts[reason] = (counts[reason] || 0) + 1;
    for (const quote of record.rejected_quotes || []) counts[quote.reason] = (counts[quote.reason] || 0) + 1;
    for (const principle of record.rejected_principles || []) counts[principle.reason] = (counts[principle.reason] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function demotionReasonCounts(records = []) {
  const counts = {};
  for (const record of records) {
    for (const reason of record.demotion_reasons || []) counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function verificationSummary(results = []) {
  const accepted = results.filter(item => item.status === "accepted");
  const rejected = results.filter(item => item.status !== "accepted");
  return {
    candidate_extractions_total: results.length,
    candidates_verified: accepted.length,
    candidates_rejected: rejected.length,
    rejection_reasons: rejectionReasonCounts(results),
    verified_cases_added: new Set(accepted.map(item => item.case_id).filter(Boolean)).size,
    paragraph_cards_added: new Set(accepted.flatMap(item => item.matched_paragraph_ids || [])).size,
    propositions_added: accepted.reduce((sum, item) => sum + (item.accepted_quotes || []).length, 0),
    principles_added: accepted.reduce((sum, item) => sum + (item.accepted_principles || []).length, 0),
    digests_added: accepted.length,
    demotion_reasons: demotionReasonCounts(accepted.map(item => ({ demotion_reasons: item.demotion_reasons || [] }))),
    cards_demoted: accepted.reduce((sum, item) => (
      sum +
      (item.accepted_quotes || []).filter(quote => (quote.demotion_flags || []).length).length +
      (item.accepted_principles || []).filter(principle => (principle.demotion_flags || []).length).length
    ), 0),
    answer_safe_count: 0,
  };
}

function writeVerificationMarkdown(report, outputPath = VERIFICATION_REPORT_MD) {
  const summary = report.summary;
  const lines = [
    "# Candidate Extraction Verification",
    "",
    "NotebookLM, DeepSeek, Claude, GPT and manual notes are candidate extractors only. HKLII/LegalRef paragraph proof is the authority source.",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Candidate extractions | ${summary.candidate_extractions_total} |`,
    `| Candidates verified | ${summary.candidates_verified} |`,
    `| Candidates rejected | ${summary.candidates_rejected} |`,
    `| Verified cases | ${summary.verified_cases_added} |`,
    `| Verified paragraph cards | ${summary.paragraph_cards_added} |`,
    `| Proposition candidates | ${summary.propositions_added} |`,
    `| Principle candidates | ${summary.principles_added} |`,
    `| Digest candidates | ${summary.digests_added} |`,
    `| Cards with demotion flags | ${summary.cards_demoted} |`,
    `| Answer-safe cards | ${summary.answer_safe_count} |`,
    "",
    "## Rejection Reasons",
    "",
    "| Reason | Count |",
    "|---|---:|",
    ...Object.entries(summary.rejection_reasons).map(([reason, count]) => `| ${reason} | ${count} |`),
    "",
    "## Demotion Categories",
    "",
    "| Reason | Count |",
    "|---|---:|",
    ...Object.entries(summary.demotion_reasons || {}).map(([reason, count]) => `| ${reason} | ${count} |`),
    "",
    "## Boundary",
    "",
    "- Candidate output is never authority by itself.",
    "- A proposition needs a verified paragraph and exact quote support.",
    "- A principle needs a verified proposition and paragraph.",
    "- All generated cards remain research_only / machine_candidate or lawyer_review_required.",
    "- L4 answer-safe promotion is not implemented here.",
  ];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function verifyCandidateExtractions({
  inputPath = PATHS.candidateExtractionsSample,
  outputJsonPath = VERIFICATION_REPORT_JSON,
  outputMdPath = VERIFICATION_REPORT_MD,
  limit = 0,
  issue = "",
  minimumScore = 0.92,
  write = true,
} = {}) {
  const corpus = loadCaseCorpus({ mode: "sample" });
  const candidates = loadCandidateExtractions(inputPath, { limit, issue });
  const results = candidates.map(candidate => verifyOneCandidate(candidate, corpus, { minimumScore }));
  const report = {
    report_id: "candidate_extraction_verification_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    input_path: path.relative(ROOT, inputPath),
    source_policy: "Candidate extractor output is not authority; public HKLII/LegalRef paragraph proof is required.",
    match_policy: {
      exact_quote_required: true,
      normalized_substring_or_high_confidence_threshold: minimumScore,
      accepted_authority_status: "not_authority",
      generated_answer_layer_status: "research_only",
    },
    summary: verificationSummary(results),
    accepted_candidates: results.filter(item => item.status === "accepted"),
    rejected_candidates: results.filter(item => item.status !== "accepted"),
  };
  if (write) {
    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeVerificationMarkdown(report, outputMdPath);
  }
  return report;
}

function makePropositionId(candidateId, quote) {
  return `candidate_${safeId(candidateId)}_p${quote.para_no}_q${quote.quote_index}_prop`;
}

function makePrincipleId(candidateId, principle) {
  return `candidate_${safeId(candidateId)}_principle_${principle.principle_index}`;
}

function makeDigestId(caseId) {
  return `candidate_${safeId(caseId)}_digest_l35`;
}

function courtStrength(court = "") {
  if (/Final Appeal/i.test(court)) return "cfa";
  if (/Appeal/i.test(court)) return "ca";
  if (/First Instance|High Court/i.test(court)) return "cfi";
  if (/District/i.test(court)) return "dc";
  if (/Magistr/i.test(court)) return "magistracy";
  return "";
}

function buildCardsFromVerificationReport({
  reportPath = VERIFICATION_REPORT_JSON,
  outputDir = PATHS.candidateVerifiedDir,
  write = true,
} = {}) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const corpus = loadCaseCorpus({ mode: "sample" });
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const registryByCase = byId(corpus.registry, "case_id");
  const paragraphCardsById = new Map();
  const propositions = [];
  const principles = [];
  const digests = [];
  const issueMap = [];

  for (const candidate of report.accepted_candidates || []) {
    const registry = registryByCase.get(candidate.case_id) || {};
    for (const paragraphId of candidate.matched_paragraph_ids || []) {
      const paragraph = paragraphById.get(paragraphId);
      if (paragraph && !paragraphCardsById.has(paragraphId)) {
        paragraphCardsById.set(paragraphId, {
          ...paragraph,
          candidate_source_ids: [candidate.candidate_id],
          candidate_verification_status: "verified_from_candidate_extraction",
          answer_layer_status: "research_only",
          review_status: paragraph.review_status || "machine_candidate",
        });
      }
    }

    const candidatePropIds = [];
    for (const quote of candidate.accepted_quotes || []) {
      const propId = makePropositionId(candidate.candidate_id, quote);
      candidatePropIds.push(propId);
      propositions.push({
        proposition_id: propId,
        proposition_text: quote.proposition_text || `Candidate extraction identified paragraph ${quote.para_no} as relevant to ${quote.issue_tags.slice(0, 3).join(", ")}; use only with the linked paragraph quote.`,
        source_paragraph_ids: [quote.paragraph_id],
        candidate_id: candidate.candidate_id,
        source_tool: candidate.source_tool,
        case_id: candidate.case_id,
        case_name: candidate.case_name,
        neutral_citation: candidate.citation,
        court: registry.court || "",
        para_refs: [String(quote.para_no)],
        source_urls: [quote.source_url],
        exact_quote_support: quote.exact_quote_support,
        issue_tags: uniq(quote.issue_tags),
        demotion_flags: quote.demotion_flags || [],
        legal_function: quote.legal_function,
        authority_role_candidate: quote.authority_role_candidate,
        extraction_method: "candidate_extraction_then_hklii_paragraph_verification",
        confidence: quote.match_score,
        verification_status: "quote_verified_from_candidate_paragraph_match",
        extraction_status: "candidate_only_verified",
        authority_status: "not_authority",
        answer_layer_status: "research_only",
        review_status: "machine_candidate",
      });
    }

    const candidatePrincipleIds = [];
    for (const principle of candidate.accepted_principles || []) {
      const linkedQuote = (candidate.accepted_quotes || []).find(item => item.quote_index === principle.quote_index) || (candidate.accepted_quotes || [])[0];
      const propId = linkedQuote ? makePropositionId(candidate.candidate_id, linkedQuote) : candidatePropIds[0];
      const principleId = makePrincipleId(candidate.candidate_id, principle);
      candidatePrincipleIds.push(principleId);
      principles.push({
        principle_id: principleId,
        principle_text: principle.principle_text,
        source_type: "case",
        source_proposition_ids: [propId],
        source_paragraph_ids: [principle.paragraph_id],
        candidate_id: candidate.candidate_id,
        source_tool: candidate.source_tool,
        source_urls: [linkedQuote?.source_url || candidate.source_url],
        exact_quote_support: principle.exact_quote_support,
        issue_tags: uniq(principle.issue_tags),
        demotion_flags: principle.demotion_flags || [],
        applies_to: candidate.candidate_applies_when.length ? candidate.candidate_applies_when : ["Candidate applies only where the user's facts match the linked public paragraph context."],
        required_facts: ["charge_or_issue", "procedural_posture", "full_fact_record", "paragraph_context_review"],
        limits: "Candidate-extracted principle; verified only for paragraph/quote existence. Whole-judgment treatment and lawyer review are still required.",
        distinguishable_when: candidate.candidate_distinguishable_when.join(" ") || "The facts, issue posture, charge, evidence route or procedural stage differs from the linked public paragraph.",
        authority_strength: courtStrength(registry.court || ""),
        current_treatment_status: "unchecked",
        case_id: candidate.case_id,
        case_name: candidate.case_name,
        neutral_citation: candidate.citation,
        court: registry.court || "",
        verification_status: "quote_verified_research_only",
        extraction_status: "candidate_only_verified",
        authority_status: "not_authority",
        answer_layer_status: "research_only",
        review_status: "machine_candidate",
      });
    }

    digests.push({
      case_digest_card_id: makeDigestId(candidate.case_id),
      case_id: candidate.case_id,
      case_name: candidate.case_name,
      neutral_citation: candidate.citation,
      court: registry.court || "",
      judgment_date: registry.judgment_date || "",
      source_url: candidate.source_url,
      facts_summary: candidate.candidate_facts_summary || "Candidate extraction verified against public paragraph cards; facts summary requires whole-judgment review.",
      procedural_history: `${registry.court || "Public court"} judgment dated ${registry.judgment_date || "date in registry"}; procedural posture remains research-only.`,
      issues: candidate.candidate_issues,
      holdings: candidate.candidate_holdings.length
        ? candidate.candidate_holdings
        : ["Candidate extraction identified paragraph-supported research points only; no answer-safe holding is asserted."],
      ratio_principles: [],
      obiter_principles: candidatePrincipleIds,
      key_paragraphs: candidate.matched_paragraph_ids,
      proposition_ids: candidatePropIds,
      principle_ids: candidatePrincipleIds,
      applies_when: candidate.candidate_applies_when,
      distinguishable_when: candidate.candidate_distinguishable_when,
      treatment: {
        current_treatment_status: "unchecked",
        note: "Candidate workflow verifies paragraph/quote support only; no L4 current-treatment review.",
      },
      demotion_flags: uniq((candidate.accepted_quotes || []).flatMap(item => item.demotion_flags || []).concat((candidate.accepted_principles || []).flatMap(item => item.demotion_flags || []))),
      hklii_paragraph_urls: (candidate.accepted_quotes || []).map(item => item.source_url),
      candidate_id: candidate.candidate_id,
      source_tool: candidate.source_tool,
      extraction_status: "candidate_only_verified",
      authority_status: "not_authority",
      answer_layer_status: "research_only",
      review_status: "lawyer_review_required",
    });

    const issueTags = uniq(candidate.candidate_issue_tags.concat((candidate.accepted_quotes || []).flatMap(item => item.issue_tags || [])));
    for (const issueId of issueTags) {
      issueMap.push({
        issue_id: issueId,
        case_id: candidate.case_id,
        paragraph_ids: candidate.matched_paragraph_ids,
        proposition_ids: candidatePropIds,
        principle_ids: candidatePrincipleIds,
        candidate_id: candidate.candidate_id,
        relevance_score: 0.74,
        relevance_reason: "Candidate extraction verified against public paragraph quote support; research-only pending lawyer review.",
        source_status: "candidate_paragraph_quote_verified_research_only",
        review_status: "machine_candidate",
      });
    }
  }

  const paragraphCards = Array.from(paragraphCardsById.values());
  const manifest = {
    manifest_id: "candidate_verified_cards_manifest_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    source_report: path.relative(ROOT, reportPath),
    output_dir: path.relative(ROOT, outputDir),
    paragraph_cards_added: paragraphCards.length,
    propositions_added: propositions.length,
    principles_added: principles.length,
    digests_added: digests.length,
    issue_map_records_added: issueMap.length,
    cards_demoted: propositions.filter(item => (item.demotion_flags || []).length).length + principles.filter(item => (item.demotion_flags || []).length).length,
    demotion_reasons: demotionReasonCounts((report.accepted_candidates || []).map(item => ({ demotion_reasons: item.demotion_reasons || [] }))),
    answer_safe_count: 0,
    authority_policy: "Generated cards remain research_only; candidate source tools are not authority.",
    outputs: {
      paragraph_cards: path.relative(ROOT, PATHS.candidateVerifiedParagraphs),
      proposition_cards: path.relative(ROOT, PATHS.candidateVerifiedPropositions),
      principle_cards: path.relative(ROOT, PATHS.candidateVerifiedPrinciples),
      case_digest_cards: path.relative(ROOT, PATHS.candidateVerifiedDigests),
      issue_map: path.relative(ROOT, PATHS.candidateVerifiedIssueMap),
    },
  };

  if (write) {
    fs.mkdirSync(outputDir, { recursive: true });
    writeJsonl(PATHS.candidateVerifiedParagraphs, paragraphCards);
    writeJsonl(PATHS.candidateVerifiedPropositions, propositions);
    writeJsonl(PATHS.candidateVerifiedPrinciples, principles);
    writeJsonl(PATHS.candidateVerifiedDigests, digests);
    writeJsonl(PATHS.candidateVerifiedIssueMap, issueMap);
    fs.writeFileSync(PATHS.candidateGeneratedManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.mkdirSync(path.dirname(CARD_BUILD_REPORT_JSON), { recursive: true });
    fs.writeFileSync(CARD_BUILD_REPORT_JSON, `${JSON.stringify({ report_id: "candidate_verified_cards_report_v1", ...manifest }, null, 2)}\n`, "utf8");
    fs.writeFileSync(CARD_BUILD_REPORT_MD, `${[
      "# Candidate Verified Cards",
      "",
      "| Metric | Value |",
      "|---|---:|",
      `| Paragraph cards | ${paragraphCards.length} |`,
      `| Proposition cards | ${propositions.length} |`,
      `| Principle cards | ${principles.length} |`,
      `| Digest cards | ${digests.length} |`,
      `| Issue map records | ${issueMap.length} |`,
      `| Cards with demotion flags | ${manifest.cards_demoted} |`,
      `| Answer-safe cards | ${manifest.answer_safe_count} |`,
      "",
      "All generated cards are research-only candidate cards backed by public paragraph proof.",
    ].join("\n")}\n`, "utf8");
  }

  return { paragraphCards, propositions, principles, digests, issueMap, manifest };
}

module.exports = {
  VERIFICATION_REPORT_JSON,
  VERIFICATION_REPORT_MD,
  CARD_BUILD_REPORT_JSON,
  CARD_BUILD_REPORT_MD,
  loadCandidateExtractions,
  verifyCandidateExtractions,
  buildCardsFromVerificationReport,
  verifyOneCandidate,
  matchQuoteToParagraph,
  verificationSummary,
  normalizeSearch,
  safeId,
};
