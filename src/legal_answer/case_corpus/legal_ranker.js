function tokenize(text = "") {
  return String(text || "").toLowerCase().match(/[a-z0-9_\u4e00-\u9fff]+/g) || [];
}

function overlapScore(query = "", text = "") {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  const hay = new Set(tokenize(text));
  let hit = 0;
  for (const token of q) if (hay.has(token)) hit += 1;
  return hit / q.size;
}

const DEFAULT_WEIGHTS = {
  exact_issue_match_weight: 2.4,
  semantic_similarity_weight: 1.0,
  keyword_match_weight: 1.1,
  court_authority_weight: 0.7,
  ratio_candidate_weight: 0.5,
  paragraph_verified_weight: 1.2,
  principle_card_weight: 0.7,
  digest_card_weight: 0.5,
  current_treatment_checked_weight: 0.2,
  query_fact_match_weight: 0.5,
  supported_vertical_match_weight: 0.8,
  unsupported_or_unchecked_penalty: -0.35,
  wrong_domain_penalty: -3.5,
  recall_only_penalty: -5,
};

const COURT_SCORES = {
  cfa: 1,
  ca: 0.85,
  cfi: 0.65,
  dc: 0.45,
  magistracy: 0.25,
  tribunal: 0.15,
};

function hasIssueMatch(candidate = {}, issueIds = []) {
  const tags = new Set(candidate.issue_tags || []);
  return issueIds.some(issueId => tags.has(issueId));
}

function isWrongDomain(candidate = {}, issueIds = []) {
  if (!issueIds.length) return false;
  const tags = candidate.issue_tags || [];
  if (!tags.length) return true;
  const wantedRoot = issueIds.map(id => id.split(".")[0]).filter(Boolean);
  return !tags.some(tag => wantedRoot.some(root => tag.startsWith(root)));
}

function scoreCandidate(candidate = {}, context = {}, weights = DEFAULT_WEIGHTS) {
  const issueIds = context.issue_ids || [];
  const query = context.query || "";
  const text = [candidate.text, candidate.case_name, candidate.citation, ...(candidate.issue_tags || [])].join(" ");
  const exactIssueMatch = hasIssueMatch(candidate, issueIds) ? 1 : 0;
  const semanticSimilarity = Number(candidate.semantic_similarity ?? overlapScore(query, text));
  const keywordMatch = overlapScore(query, text);
  const courtAuthority = COURT_SCORES[candidate.authority_strength] || 0;
  const role = candidate.authority_role || "";
  const ratioCandidate = /ratio|principle|case_digest|application/i.test(role) ? 1 : 0;
  const paragraphVerified = (candidate.paragraph_ids || []).length && candidate.source_url && /#p\d+$/i.test(candidate.source_url) ? 1 : 0;
  const principleCard = (candidate.principle_ids || []).length ? 1 : 0;
  const digestCard = (candidate.digest_ids || []).length ? 1 : 0;
  const treatmentChecked = candidate.current_treatment_status === "checked_current" ? 1 : 0;
  const queryFactMatch = overlapScore(context.evidence_text || "", text);
  const supportedVerticalMatch = (candidate.issue_tags || []).some(tag => /^criminal_law|^criminal_procedure/.test(tag)) ? 1 : 0;
  const uncheckedPenalty = candidate.current_treatment_status && candidate.current_treatment_status !== "checked_current" ? 1 : 0;
  const wrongDomain = isWrongDomain(candidate, issueIds) ? 1 : 0;
  const recallOnly = /case_recall_only/i.test(JSON.stringify(candidate)) ? 1 : 0;

  const components = {
    exact_issue_match: exactIssueMatch * weights.exact_issue_match_weight,
    semantic_similarity: semanticSimilarity * weights.semantic_similarity_weight,
    keyword_match: keywordMatch * weights.keyword_match_weight,
    court_authority: courtAuthority * weights.court_authority_weight,
    authority_role: ratioCandidate * weights.ratio_candidate_weight,
    paragraph_verified: paragraphVerified * weights.paragraph_verified_weight,
    principle_card: principleCard * weights.principle_card_weight,
    digest_card: digestCard * weights.digest_card_weight,
    current_treatment_checked: treatmentChecked * weights.current_treatment_checked_weight,
    query_fact_match: queryFactMatch * weights.query_fact_match_weight,
    supported_vertical_match: supportedVerticalMatch * weights.supported_vertical_match_weight,
    unchecked_penalty: uncheckedPenalty * weights.unsupported_or_unchecked_penalty,
    wrong_domain_penalty: wrongDomain * weights.wrong_domain_penalty,
    recall_only_penalty: recallOnly * weights.recall_only_penalty,
  };
  const score = Number(Object.values(components).reduce((sum, value) => sum + value, 0).toFixed(6));
  return {
    ...candidate,
    ranking_score: score,
    ranking_breakdown: components,
    semantic_similarity: semanticSimilarity,
  };
}

function rerankCandidates(candidates = [], context = {}, weights = DEFAULT_WEIGHTS) {
  return candidates
    .map(candidate => scoreCandidate(candidate, context, weights))
    .sort((a, b) => b.ranking_score - a.ranking_score || String(a.chunk_id || a.source_object_id).localeCompare(String(b.chunk_id || b.source_object_id)));
}

module.exports = {
  DEFAULT_WEIGHTS,
  tokenize,
  overlapScore,
  scoreCandidate,
  rerankCandidates,
};
