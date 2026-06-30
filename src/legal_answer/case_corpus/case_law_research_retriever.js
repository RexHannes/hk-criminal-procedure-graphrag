const {
  loadCaseCorpus,
  byId,
} = require("./case_corpus_store");
const {
  inferCaseCorpusIssueIds,
  retrieveHybridCaseCorpus,
} = require("./hybrid_case_retriever");

function inferIssueIds(query = "") {
  return inferCaseCorpusIssueIds(query);
}

function uniqBy(items = [], keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function retrieveCaseLawResearch({
  query = "",
  issue_id = "",
  mode = "sample",
  max_cases = 3,
  max_paragraphs = 6,
} = {}) {
  const corpus = loadCaseCorpus({ mode });
  const paragraphById = byId(corpus.paragraphs, "paragraph_id");
  const propositionById = byId(corpus.propositions, "proposition_id");
  const principleById = byId(corpus.principles, "principle_id");
  const hybrid = retrieveHybridCaseCorpus({
    query,
    issue_id,
    mode,
    max_cases,
    max_paragraphs,
    max_chunks: 180,
  });

  if (!hybrid.inferred_issue_ids.length) {
    return {
      mode,
      query,
      requested_issue_id: issue_id || "",
      inferred_issue_ids: [],
      cases: [],
      audit: {
        registry_case_count: corpus.registry.length,
        paragraph_card_count: corpus.paragraphs.length,
        proposition_card_count: corpus.propositions.length,
        principle_card_count: corpus.principles.length,
        case_digest_card_count: corpus.digests.length,
        issue_map_count: corpus.issueMap.length,
        returned_case_count: 0,
        abstain_reason: hybrid.audit?.abstain_reason || "no_supported_issue_id_inferred",
        answer_layer_status: "research_only",
        review_status: "lawyer_review_required",
        l4_answer_safe_implemented: false,
      },
    };
  }

  const cases = hybrid.top_cases.map(item => {
    const chunks = item.chunks || [];
    const paragraphIds = chunks.flatMap(chunk => chunk.paragraph_ids || []);
    const propositionIds = chunks.flatMap(chunk => chunk.proposition_ids || []);
    const principleIds = chunks.flatMap(chunk => chunk.principle_ids || []);
    const paragraphs = uniqBy(paragraphIds.map(id => paragraphById.get(id)).filter(Boolean), paragraph => paragraph.paragraph_id);
    const propositions = uniqBy(propositionIds.map(id => propositionById.get(id)).filter(Boolean), proposition => proposition.proposition_id);
    const principles = uniqBy(principleIds.map(id => principleById.get(id)).filter(Boolean), principle => principle.principle_id);
    const fallbackParagraphs = (item.digest?.key_paragraphs || []).map(id => paragraphById.get(id)).filter(Boolean);
    const fallbackPropositions = (item.digest?.proposition_ids || []).map(id => propositionById.get(id)).filter(Boolean);
    const fallbackPrinciples = (item.digest?.principle_ids || []).map(id => principleById.get(id)).filter(Boolean);
    return {
      case_id: item.case_id,
      digest: item.digest,
      issue_matches: hybrid.inferred_issue_ids.map(issueId => ({
        issue_id: issueId,
        relevance_score: item.score,
        relevance_reason: "Hybrid retrieval matched exact issue tags, synonyms, BM25/keyword evidence and public paragraph proof.",
        source_status: "paragraph_quote_verified_research_only",
        review_status: "machine_candidate",
      })),
      paragraphs: (paragraphs.length ? paragraphs : fallbackParagraphs).slice(0, Math.max(1, Number(max_paragraphs) || 6)),
      propositions: propositions.length ? propositions : fallbackPropositions,
      principles: principles.length ? principles : fallbackPrinciples,
      relevance_score: item.score,
    };
  });

  return {
    mode,
    query,
    requested_issue_id: issue_id || "",
    inferred_issue_ids: hybrid.inferred_issue_ids,
    cases,
    audit: {
      registry_case_count: corpus.registry.length,
      paragraph_card_count: corpus.paragraphs.length,
      proposition_card_count: corpus.propositions.length,
      principle_card_count: corpus.principles.length,
      case_digest_card_count: corpus.digests.length,
      issue_map_count: corpus.issueMap.length,
      returned_case_count: cases.length,
      hybrid_candidate_count: hybrid.audit?.candidate_count || 0,
      source_proof_pass_count: hybrid.audit?.source_proof_pass_count || 0,
      source_proof_excluded_count: hybrid.audit?.source_proof_excluded_count || 0,
      answer_layer_status: "research_only",
      review_status: "lawyer_review_required",
      l4_answer_safe_implemented: false,
    },
  };
}

module.exports = {
  inferIssueIds,
  retrieveCaseLawResearch,
};
