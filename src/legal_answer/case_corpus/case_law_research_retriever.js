const {
  loadCaseCorpus,
  byId,
} = require("./case_corpus_store");

function tokens(text = "") {
  return String(text || "").toLowerCase().match(/[a-z0-9_]+/g) || [];
}

function inferIssueIds(query = "") {
  const q = String(query || "").toLowerCase();
  const ids = new Set();
  if (/\b(theft|steal|stealing|shoplift|shoplifting|forgot|forget|dishonest|dishonesty)\b/.test(q)) {
    ids.add("criminal_law.theft");
    ids.add("criminal_law.theft.dishonesty");
    ids.add("criminal_law.theft.mens_rea");
    if (/\b(sentence|sentencing|penalty|jail|custodial)\b/.test(q)) ids.add("criminal_law.theft.sentencing");
  }
  if (/\b(appropriation|appropriate|owner rights)\b/.test(q)) ids.add("criminal_law.theft.appropriation");
  if (/\b(permanent|permanently deprive|keep it)\b/.test(q)) ids.add("criminal_law.theft.intention_permanently_deprive");
  if (/\b(probate|intestate|intestacy|will|administrator|letters of administration|minor|domicile)\b/.test(q)) {
    ids.add("probate.intestacy");
    ids.add("probate.letters_of_administration");
  }
  return Array.from(ids);
}

function overlapScore(query, values = []) {
  const queryTokens = new Set(tokens(query));
  if (!queryTokens.size) return 0;
  const hayTokens = new Set(tokens(values.join(" ")));
  let overlap = 0;
  for (const token of queryTokens) {
    if (hayTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(queryTokens.size, 1);
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
  const digestByCaseId = byId(corpus.digests, "case_id");
  const issueIds = issue_id ? [issue_id] : inferIssueIds(query);
  const issueSet = new Set(issueIds);
  if (!issueSet.size) {
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
        abstain_reason: "no_supported_issue_id_inferred",
        answer_layer_status: "research_only",
        review_status: "lawyer_review_required",
        l4_answer_safe_implemented: false,
      },
    };
  }
  const candidateMappings = corpus.issueMap
    .filter(item => issueSet.has(item.issue_id))
    .map(item => {
      const digest = digestByCaseId.get(item.case_id);
      const paragraphs = (item.paragraph_ids || []).map(id => paragraphById.get(id)).filter(Boolean);
      const propositions = (item.proposition_ids || []).map(id => propositionById.get(id)).filter(Boolean);
      const principles = (item.principle_ids || []).map(id => principleById.get(id)).filter(Boolean);
      const textScore = overlapScore(query, [
        item.issue_id,
        item.relevance_reason,
        digest?.facts_summary,
        ...(digest?.issues || []),
        ...(digest?.holdings || []),
        ...principles.map(principle => principle.principle_text),
      ].filter(Boolean));
      return {
        ...item,
        digest,
        paragraphs,
        propositions,
        principles,
        combined_score: Number((item.relevance_score + textScore).toFixed(4)),
      };
    })
    .filter(item => item.digest)
    .sort((a, b) => b.combined_score - a.combined_score);

  const byCase = new Map();
  for (const item of candidateMappings) {
    if (!byCase.has(item.case_id)) {
      byCase.set(item.case_id, {
        case_id: item.case_id,
        digest: item.digest,
        issue_matches: [],
        paragraphs: [],
        propositions: [],
        principles: [],
        relevance_score: 0,
      });
    }
    const bucket = byCase.get(item.case_id);
    bucket.issue_matches.push({
      issue_id: item.issue_id,
      relevance_score: item.combined_score,
      relevance_reason: item.relevance_reason,
      source_status: item.source_status,
      review_status: item.review_status,
    });
    bucket.relevance_score = Math.max(bucket.relevance_score, item.combined_score);
    for (const paragraph of item.paragraphs) {
      if (!bucket.paragraphs.some(existing => existing.paragraph_id === paragraph.paragraph_id)) bucket.paragraphs.push(paragraph);
    }
    for (const proposition of item.propositions) {
      if (!bucket.propositions.some(existing => existing.proposition_id === proposition.proposition_id)) bucket.propositions.push(proposition);
    }
    for (const principle of item.principles) {
      if (!bucket.principles.some(existing => existing.principle_id === principle.principle_id)) bucket.principles.push(principle);
    }
  }

  const cases = Array.from(byCase.values())
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, Math.max(1, Number(max_cases) || 3))
    .map(item => ({
      ...item,
      paragraphs: item.paragraphs.slice(0, Math.max(1, Number(max_paragraphs) || 6)),
    }));

  return {
    mode,
    query,
    requested_issue_id: issue_id || "",
    inferred_issue_ids: issueIds,
    cases,
    audit: {
      registry_case_count: corpus.registry.length,
      paragraph_card_count: corpus.paragraphs.length,
      proposition_card_count: corpus.propositions.length,
      principle_card_count: corpus.principles.length,
      case_digest_card_count: corpus.digests.length,
      issue_map_count: corpus.issueMap.length,
      returned_case_count: cases.length,
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
