const {
  loadCaseCorpus,
} = require("./case_corpus_store");
const { buildCaseCorpusChunks } = require("./chunker");
const { tokenize, overlapScore, issueFamily, rerankCandidates } = require("./legal_ranker");
const { filterSourceProof } = require("./source_proof_filter");

const WRONG_DOMAIN_PATTERN = /\b(probate|intestacy|landlord|rent|tenancy|employment|divorce|injury|personal injury|contract|company|shareholder|immigration|tax|trust|family)\b/i;

const ISSUE_SYNONYMS = {
  "criminal_law.theft": ["theft", "steal", "stealing", "stole", "stolen", "shoplift", "shoplifting", "without paying", "cap 210", "theft ordinance"],
  "criminal_law.dishonesty": ["dishonesty", "dishonest", "ghosh", "mo yuk ping", "ivey", "state of mind", "mens rea", "honest belief"],
  "criminal_law.theft.dishonesty": ["dishonesty", "dishonest", "ghosh", "mo yuk ping", "ivey", "forgot to pay", "mistake", "shoplifting", "mens rea"],
  "criminal_law.theft.mens_rea": ["mens rea", "intention", "knowledge", "belief", "dishonesty", "mistake", "forgot", "forget", "accident"],
  "criminal_law.theft.appropriation": ["appropriation", "appropriate", "taking", "took", "take", "picked up", "owner rights", "assuming rights"],
  "criminal_law.theft.belonging_to_another": ["belonging to another", "belongs to another", "owner", "ownership", "property of another"],
  "criminal_law.theft.intention_permanently_deprive": ["permanently deprive", "permanent deprivation", "not return", "keep it", "keep property", "intention to deprive"],
  "criminal_law.theft.mistake_or_forgot_to_pay": ["forgot to pay", "forget to pay", "forgotten", "mistake", "accident", "distracted", "immediate offer to pay"],
  "criminal_law.theft.sentencing": ["sentencing", "sentence", "jail", "imprisonment", "custodial", "mitigation", "starting point", "penalty"],
  "criminal_law.fraud": ["fraud", "defraud", "conspiracy to defraud", "false instrument", "false accounting"],
  "criminal_law.deception": ["deception", "deceit", "deceive", "obtaining property by deception", "false representation"],
  "criminal_procedure.interview_caution": ["interview", "under caution", "caution", "video recorded interview", "vri", "admission", "confession"],
  "criminal_procedure.bail": ["bail", "remand", "release pending trial", "flight risk"],
};

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function expandIssueIds(issueIds = []) {
  const expanded = new Set(issueIds);
  for (const issueId of issueIds) {
    if (issueId === "criminal_law.theft.dishonesty") {
      expanded.add("criminal_law.dishonesty");
      expanded.add("criminal_law.theft.mens_rea");
      expanded.add("criminal_law.theft");
      expanded.add("criminal_law.theft.mistake_or_forgot_to_pay");
    }
    if (issueId === "criminal_law.theft.mens_rea") {
      expanded.add("criminal_law.theft.dishonesty");
      expanded.add("criminal_law.dishonesty");
      expanded.add("criminal_law.theft");
    }
    if (issueId.startsWith("criminal_law.theft.") && issueId !== "criminal_law.theft.sentencing") expanded.add("criminal_law.theft");
    if (issueId === "criminal_law.fraud") expanded.add("criminal_law.deception");
    if (issueId === "criminal_law.deception") expanded.add("criminal_law.fraud");
  }
  return Array.from(expanded).filter(issueId => /^criminal_law\.|^criminal_procedure\./.test(issueId));
}

function synonymQuery(query = "", issueIds = []) {
  const synonyms = issueIds.flatMap(issueId => ISSUE_SYNONYMS[issueId] || []);
  return uniq([query, ...issueIds, ...synonyms]).join(" ");
}

function inferCaseCorpusIssueIds(query = "") {
  const q = String(query || "").toLowerCase();
  const ids = new Set();
  if (WRONG_DOMAIN_PATTERN.test(q) && !/\b(theft|steal|shoplift|dishonest|fraud|deception|caution|interview|bail)\b/.test(q)) return [];
  if (/\b(theft|steal|stealing|stolen|stole|shoplift|shoplifting|forgot|forget|dishonest|dishonesty|ghosh|without paying|cap\s*210)\b/.test(q)) ids.add("criminal_law.theft");
  if (/\b(dishonest|dishonesty|ghosh|mo yuk ping|ivey|forgot|forget|mistake|mens rea|state of mind|honest belief)\b/.test(q)) {
    ids.add("criminal_law.theft.dishonesty");
    ids.add("criminal_law.theft.mens_rea");
  }
  if (/\bappropriat|taking|picked up|owner rights|assuming rights/.test(q)) ids.add("criminal_law.theft.appropriation");
  if (/permanent|permanently deprive|keep it|not return/i.test(q)) ids.add("criminal_law.theft.intention_permanently_deprive");
  if (/belonging to another|belongs to another|owner|ownership/i.test(q)) ids.add("criminal_law.theft.belonging_to_another");
  if (/sentence|sentencing|jail|imprisonment|custodial|penalty|mitigation/i.test(q)) ids.add("criminal_law.theft.sentencing");
  if (/fraud|defraud|false instrument|false accounting/i.test(q)) ids.add("criminal_law.fraud");
  if (/deception|deceit|deceiv|false representation/i.test(q)) ids.add("criminal_law.deception");
  if (/caution|interview|vri|video-recorded|under caution|admission|confession/i.test(q)) ids.add("criminal_procedure.interview_caution");
  if (/bail|remand/i.test(q)) ids.add("criminal_procedure.bail");
  return expandIssueIds(Array.from(ids));
}

function loadChunksOrBuild(mode = "sample") {
  const corpus = loadCaseCorpus({ mode });
  return {
    corpus,
    chunks: corpus.chunks.length ? corpus.chunks : buildCaseCorpusChunks({ mode }),
  };
}

function exactCitationOrNameMatches(chunks = [], query = "") {
  const q = String(query || "").toLowerCase().replace(/\s+/g, " ");
  const queryCompact = q.replace(/[\s[\]]+/g, "");
  return chunks.filter(chunk => {
    const citation = String(chunk.citation || "").toLowerCase().replace(/\s+/g, " ");
    const citationCompact = citation.replace(/[\s[\]]+/g, "");
    const caseName = String(chunk.case_name || "").toLowerCase().replace(/\s+/g, " ");
    return (citation && (q.includes(citation) || queryCompact.includes(citationCompact))) ||
      (caseName && caseName.length > 8 && q.includes(caseName));
  });
}

function keywordMatches(chunks = [], query = "") {
  return chunks
    .map(chunk => ({ ...chunk, semantic_similarity: overlapScore(query, [chunk.text, chunk.case_name, chunk.citation, ...(chunk.issue_tags || [])].join(" ")) }))
    .filter(chunk => chunk.semantic_similarity > 0);
}

function bm25Matches(chunks = [], query = "", limit = 80) {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return [];
  const docTokens = chunks.map(chunk => tokenize([chunk.text, chunk.case_name, chunk.citation, ...(chunk.issue_tags || [])].join(" ")));
  const avgLen = docTokens.reduce((sum, value) => sum + value.length, 0) / Math.max(docTokens.length, 1);
  const df = new Map();
  for (const tokens of docTokens) {
    for (const token of new Set(tokens)) df.set(token, (df.get(token) || 0) + 1);
  }
  const k1 = 1.2;
  const b = 0.75;
  return chunks.map((chunk, index) => {
    const tokens = docTokens[index];
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const freq = tf.get(term) || 0;
      if (!freq) continue;
      const termDf = df.get(term) || 0;
      const idf = Math.log(1 + (chunks.length - termDf + 0.5) / (termDf + 0.5));
      score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (tokens.length / Math.max(avgLen, 1)))));
    }
    return { ...chunk, bm25_score: Number(score.toFixed(6)), semantic_similarity: overlapScore(query, tokens.join(" ")) };
  })
    .filter(item => item.bm25_score > 0)
    .sort((a, b) => b.bm25_score - a.bm25_score)
    .slice(0, limit);
}

function issueClusterExpansion(chunks = [], issueIds = []) {
  const issueSet = new Set(issueIds);
  const families = new Set(issueIds.map(issueFamily));
  const clusters = chunks.filter(chunk => chunk.chunk_type === "issue_cluster_chunk" && (chunk.issue_tags || []).some(tag => issueSet.has(tag) || families.has(issueFamily(tag))));
  const paragraphIds = new Set(clusters.flatMap(chunk => chunk.paragraph_ids || []));
  const propositionIds = new Set(clusters.flatMap(chunk => chunk.proposition_ids || []));
  const principleIds = new Set(clusters.flatMap(chunk => chunk.principle_ids || []));
  const digestIds = new Set(clusters.flatMap(chunk => chunk.digest_ids || []));
  return chunks.filter(chunk =>
    clusters.some(cluster => cluster.chunk_id === chunk.chunk_id) ||
    (chunk.paragraph_ids || []).some(id => paragraphIds.has(id)) ||
    (chunk.proposition_ids || []).some(id => propositionIds.has(id)) ||
    (chunk.principle_ids || []).some(id => principleIds.has(id)) ||
    (chunk.digest_ids || []).some(id => digestIds.has(id))
  );
}

function mergeCandidates(groups = []) {
  const merged = new Map();
  for (const group of groups) {
    for (const item of group) {
      const key = item.chunk_id || item.source_object_id;
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing || (item.bm25_score || item.semantic_similarity || 0) > (existing.bm25_score || existing.semantic_similarity || 0)) merged.set(key, item);
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
  max_chunks = 160,
  evidence_text = "",
} = {}) {
  const { corpus, chunks } = loadChunksOrBuild(mode);
  const issueIds = issue_id ? expandIssueIds([issue_id]) : inferCaseCorpusIssueIds(query);
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
        answer_mode: "research_prototype",
        lawyer_review_status: "unreviewed",
        professional_advice_certified: false,
      },
    };
  }

  const issueFamilies = new Set(issueIds.map(issueFamily));
  const exactIssueMatches = chunks.filter(chunk => (chunk.issue_tags || []).some(tag => issueIds.includes(tag)));
  const familyIssueMatches = chunks.filter(chunk => (chunk.issue_tags || []).some(tag => issueFamilies.has(issueFamily(tag))));
  const citationNameMatches = exactCitationOrNameMatches(chunks, query);
  const expandedQuery = synonymQuery(query, issueIds);
  const vectorMatches = keywordMatches(chunks, expandedQuery).slice(0, max_chunks);
  const keyword = keywordMatches(chunks, `${expandedQuery} ${issueIds.join(" ")}`).slice(0, max_chunks);
  const bm25 = bm25Matches(chunks, expandedQuery, Math.max(max_chunks, 160));
  const clusterExpanded = issueClusterExpansion(chunks, issueIds);
  const merged = mergeCandidates([exactIssueMatches, familyIssueMatches, citationNameMatches, vectorMatches, keyword, bm25, clusterExpanded]);
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
      answer_mode: "research_prototype",
      lawyer_review_status: "unreviewed",
      professional_advice_certified: false,
    },
  };
}

module.exports = {
  ISSUE_SYNONYMS,
  expandIssueIds,
  synonymQuery,
  inferCaseCorpusIssueIds,
  bm25Matches,
  retrieveHybridCaseCorpus,
};
