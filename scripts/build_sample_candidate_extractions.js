#!/usr/bin/env node
/* Build an offline sample of AI-assisted candidate extractions from verified HKLII cards. */

const {
  PATHS,
  loadCaseCorpus,
  byId,
  writeJsonl,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function issueLabel(issueId = "") {
  return String(issueId || "").split(".").slice(-1)[0].replace(/_/g, " ");
}

function normalizeAuthorityRole(role = "") {
  if (role === "case_application") return "application_to_facts";
  return role || "application_to_facts";
}

function sourceTool(index) {
  return ["notebooklm", "deepseek", "claude", "gpt", "manual"][index % 5];
}

function main() {
  const limit = Number(argValue("--limit", "40"));
  const corpus = loadCaseCorpus({ mode: "sample" });
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const propositionsByParagraph = new Map();
  const principlesByParagraph = new Map();
  const digestByCase = byId(corpus.digests, "case_id");

  for (const prop of corpus.propositions) {
    for (const paragraphId of prop.source_paragraph_ids || []) {
      if (!propositionsByParagraph.has(paragraphId)) propositionsByParagraph.set(paragraphId, []);
      propositionsByParagraph.get(paragraphId).push(prop);
    }
  }
  for (const principle of corpus.principles) {
    for (const paragraphId of principle.source_paragraph_ids || []) {
      if (!principlesByParagraph.has(paragraphId)) principlesByParagraph.set(paragraphId, []);
      principlesByParagraph.get(paragraphId).push(principle);
    }
  }

  const records = corpus.registry.slice(0, limit).map((item, index) => {
    const digest = digestByCase.get(item.case_id) || {};
    const paragraphIds = (digest.key_paragraphs || []).slice(0, 3);
    const paragraphs = paragraphIds.map(id => paragraphById.get(id)).filter(Boolean);
    const issueTags = uniq((item.issue_seed_tags || []).concat(paragraphs.flatMap(paragraph => paragraph.issue_tags_candidate || [])));
    const quotes = paragraphs.map((paragraph, quoteIndex) => {
      const prop = (propositionsByParagraph.get(paragraph.paragraph_id) || [])[0] || {};
      return {
        paragraph_no: paragraph.para_no,
        quote: prop.exact_quote_support || paragraph.paragraph_text.split(/\s+/).slice(0, 18).join(" "),
        issue_tags: prop.issue_tags || paragraph.issue_tags_candidate || issueTags,
        proposition_text: prop.proposition_text || "Candidate paragraph relevance requires public paragraph verification.",
        legal_function: prop.legal_function || "case_application",
        authority_role_candidate: normalizeAuthorityRole(prop.authority_role_candidate),
      };
    });
    const principles = paragraphs.map((paragraph, principleIndex) => {
      const principle = (principlesByParagraph.get(paragraph.paragraph_id) || [])[0] || {};
      const prop = (propositionsByParagraph.get(paragraph.paragraph_id) || [])[0] || {};
      return {
        principle_text: principle.principle_text || "Candidate principle requires paragraph verification and lawyer review.",
        source_quote: principle.exact_quote_support || prop.exact_quote_support || quotes[principleIndex]?.quote || "",
        paragraph_no: paragraph.para_no,
        issue_tags: principle.issue_tags || prop.issue_tags || issueTags,
      };
    });
    return {
      candidate_id: `cand_${item.case_id}`,
      source_tool: sourceTool(index),
      case_name: item.case_name,
      citation: item.neutral_citation,
      source_url: item.source_url,
      candidate_issue_tags: issueTags,
      candidate_facts_summary: digest.facts_summary || `Candidate summary for ${item.case_name}; verify against public paragraphs before use.`,
      candidate_issues: issueTags.slice(0, 5).map(issueLabel),
      candidate_holdings: digest.holdings || ["Candidate holding requires paragraph verification and lawyer review."],
      candidate_principles: principles,
      candidate_key_paragraphs: paragraphs.map(paragraph => paragraph.para_no),
      candidate_quotes: quotes,
      candidate_distinguishable_when: digest.distinguishable_when || [
        "The charge, facts, mental-state evidence, procedural posture or sentencing context differs from the verified public paragraph.",
      ],
      candidate_applies_when: digest.applies_when || [
        "The user's issue matches the verified public paragraph context.",
      ],
      extraction_status: "candidate_only",
      authority_status: "not_authority",
    };
  });

  records.push({
    candidate_id: "cand_reject_private_source_example",
    source_tool: "notebooklm",
    case_name: "Private textbook note",
    citation: "[2024] PRIVATE 1",
    source_url: "https://example.com/private-note",
    candidate_issue_tags: ["criminal_law.theft"],
    candidate_facts_summary: "Rejected sample: non-public source.",
    candidate_issues: ["theft"],
    candidate_holdings: ["This must not become authority."],
    candidate_principles: [{ principle_text: "Unsupported private-source candidate.", source_quote: "private quote" }],
    candidate_key_paragraphs: ["1"],
    candidate_quotes: [{ paragraph_no: "1", quote: "private quote" }],
    candidate_distinguishable_when: [],
    candidate_applies_when: [],
    extraction_status: "candidate_only",
    authority_status: "not_authority",
  });

  const first = corpus.registry[0];
  records.push({
    candidate_id: "cand_reject_quote_not_found_example",
    source_tool: "deepseek",
    case_name: first.case_name,
    citation: first.neutral_citation,
    source_url: first.source_url,
    candidate_issue_tags: first.issue_seed_tags || ["criminal_law.theft"],
    candidate_facts_summary: "Rejected sample: public case but unsupported quote.",
    candidate_issues: ["theft"],
    candidate_holdings: ["Unsupported fabricated quote must be rejected."],
    candidate_principles: [{ principle_text: "Unsupported principle with no paragraph quote.", source_quote: "this phrase is not in the public paragraph" }],
    candidate_key_paragraphs: ["1"],
    candidate_quotes: [{ paragraph_no: "1", quote: "this phrase is not in the public paragraph" }],
    candidate_distinguishable_when: [],
    candidate_applies_when: [],
    extraction_status: "candidate_only",
    authority_status: "not_authority",
  });

  writeJsonl(PATHS.candidateExtractionsSample, records);
  console.log(JSON.stringify({
    script: "build_sample_candidate_extractions",
    output: "data/legal_ingest/case_corpus/candidate_extractions/sample_candidate_extractions.jsonl",
    candidate_count: records.length,
    valid_candidate_seed_count: Math.min(limit, corpus.registry.length),
    rejected_examples: 2,
    status: "passed",
  }, null, 2));
}

main();
