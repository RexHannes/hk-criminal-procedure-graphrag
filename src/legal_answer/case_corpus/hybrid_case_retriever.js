const {
  loadCaseCorpus,
} = require("./case_corpus_store");
const { buildCaseCorpusChunks } = require("./chunker");
const { overlapScore, rerankCandidates } = require("./legal_ranker");
const { filterSourceProof } = require("./source_proof_filter");

function inferCaseCorpusIssueIds(query = "") {
  const q = String(query || "").toLowerCase();
  const ids = new Set();
  if (/\b(theft|steal|stealing|stolen|shoplift|shoplifting|forgot|forget|dishonest|dishonesty|ghosh)\b/.test(q)) {
    ids.add("criminal_law.theft");
    ids.add("criminal_law.theft.dishonesty");
    ids.add("criminal_law.theft.mens_rea");
  }
  if (/\bappropriat/.test(q)) ids.add("criminal_law.theft.appropriation");
  if (/permanent|permanently deprive|keep it|not return/i.test(q)) ids.add("criminal_law.theft.intention_permanently_deprive");
  if (/belonging to another|belongs to another|owner/i.test(q)) ids.add("criminal_law.theft.belonging_to_another");
  if (/sentence|sentencing|jail|imprisonment|custodial|penalty/i.test(q)) ids.add("criminal_law.theft.sentencing");
  if (/fraud|defraud/i.test(q)) ids.add("criminal_law.fraud");
  if (/deception|deceit|deceiv/i.test(q)) ids.add("criminal_law.deception");
  if (/caution|interview|vri|video-recorded/i.test(q)) ids.add("criminal_procedure.interview_caution");
  if (/bail/i.test(q)) ids.add("criminal_procedure.bail");
  if (/probate|intestacy|landlord|rent|tenancy|employment|divorce|injury/i.test(q)) return [];
  return Array.from(ids);
}

function loadChunksOrBuild(mode = "sample") {
  const corpus = loadCaseCorpus({ mode });
  return {
    corpus,
    chunks: corpus.chunks.length ? corpus.chunks : buildCaseCorpusChunks({ mode }),
  };
}

function exactCitationOrNameMatches(chunks = [], query = "") {
  const q = String(query || "").toLowerCase();
  return chunks.filter(chunk => {
    const citation = String(chunk.citation || "").toLowerCase();
    const caseName = String(chunk.case_name || "").toLowerCase();
    return (citation && q.includes(citation.replace(/\s+/g, " "))) ||
      (caseName && caseName.length > 8 && q.includes(caseName));
  });
}

function keywordMatches(chunks = [], query = "") {
  return chunks
    .map(chunk => ({ ...chunk, semantic_similarity: overlapScore(query, [chunk.text, chunk.case_name, chunk.citation, ...(chunk.issue_tags || [])].join(" ")) }))
    .filter(chunk => chunk.semantic_similarity > 0);
}

function mergeCandidates(groups = []) {
  const merged = new Map();
  for (const group of groups) {
    for (const item of group) {
      const key = item.chunk_id || item.source_object_id;
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing || (item.semantic_similarity || 0) > (existing.semantic_similarity || 0)) merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}

function byChunkType(results = [], chunkType = "", limit = 10) {
  return results.filter(item => item.chunk_type === chunkType).slice(0, limit);
}

function topCasesFromResults(results = [], corpus) {
  const digestByCase = new Map(corpus.digests.map(item => [item.case_id, item]));
  const byCase = new Map();
  for (const result of results) {
    if (!result.case_id) continue;
    if (!byCase.has(result.case_id)) {
      byCase.set(result.case_id, {
        case_id: result.case_id,
        digest: digestByCase.get(result.case_id) || null,
        score: result.ranking_score || 0,
        chunks: [],
      });
    }
    const item = byCase.get(result.case_id);
    item.score = Math.max(item.score, result.ranking_score || 0);
    item.chunks.push(result);
  }
  return Array.from(byCase.values()).sort((a, b) => b.score - a.score);
}

function retrieveHybridCaseCorpus({
  query = "",
  issue_id = "",
  mode = "sample",
  max_cases = 8,
  max_paragraphs = 12,
  max_chunks = 80,
  evidence_text = "",
} = {}) {
  const { corpus, chunks } = loadChunksOrBuild(mode);
  const issueIds = issue_id ? [issue_id] : inferCaseCorpusIssueIds(query);
  if (!issueIds.length) {
    return {
      mode,
      query,
      requested_issue_id: issue_id || "",
      inferred_issue_ids: [],
      top_cases: [],
      top_paragraphs: [],
      top_propositions: [],
      top_principles: [],
      top_digests: [],
      ranking_breakdown: [],
      excluded_results: [],
      audit: {
        abstain_reason: "no_supported_case_corpus_issue_detected",
        wrong_domain_leak: false,
        answer_safe: false,
        needs_lawyer_review: true,
      },
    };
  }

  const exactIssueMatches = chunks.filter(chunk => (chunk.issue_tags || []).some(tag => issueIds.includes(tag)));
  const citationNameMatches = exactCitationOrNameMatches(chunks, query);
  const vectorMatches = keywordMatches(chunks, query).slice(0, max_chunks);
  const keyword = keywordMatches(chunks, `${query} ${issueIds.join(" ")}`).slice(0, max_chunks);
  const merged = mergeCandidates([exactIssueMatches, citationNameMatches, vectorMatches, keyword]);
  const ranked = rerankCandidates(merged, { query, issue_ids: issueIds, evidence_text });
  const filtered = filterSourceProof(ranked, { corpus });
  const included = filtered.included.slice(0, max_chunks);

  const topCases = topCasesFromResults(included, corpus).slice(0, Math.max(1, Number(max_cases) || 8));
  return {
    mode,
    query,
    requested_issue_id: issue_id || "",
    inferred_issue_ids: issueIds,
    top_cases: topCases,
    top_paragraphs: byChunkType(included, "case_paragraph_chunk", Math.max(1, Number(max_paragraphs) || 12)),
    top_propositions: byChunkType(included, "case_proposition_chunk", 20),
    top_principles: byChunkType(included, "case_principle_chunk", 20),
    top_digests: byChunkType(included, "case_digest_chunk", Math.max(1, Number(max_cases) || 8)),
    ranking_breakdown: included.slice(0, 20).map(item => ({
      chunk_id: item.chunk_id,
      chunk_type: item.chunk_type,
      case_id: item.case_id,
      score: item.ranking_score,
      components: item.ranking_breakdown,
      source_proof_status: item.source_proof_status,
    })),
    excluded_results: filtered.excluded_results,
    audit: {
      chunk_count: chunks.length,
      candidate_count: merged.length,
      source_proof_pass_count: filtered.included.length,
      source_proof_excluded_count: filtered.excluded_results.length,
      returned_case_count: topCases.length,
      answer_safe: false,
      needs_lawyer_review: true,
    },
  };
}

module.exports = {
  inferCaseCorpusIssueIds,
  retrieveHybridCaseCorpus,
};
