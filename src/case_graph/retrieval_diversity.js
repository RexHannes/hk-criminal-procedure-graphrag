/**
 * Retrieval diversity + case-note enrichment for evidence lists.
 *
 * Responsibilities:
 *  - attach retrieval metadata to every evidence item:
 *      issue_tag, sub_issue_tag, authority_role, case_level, paragraph_role,
 *      leading_case_cluster, diversity_rank, application_relevance_score;
 *  - diversify: round-robin across cases so three paragraphs from one case do
 *    not crowd out other authorities, ranking appellate/leading cases first;
 *  - group: emit case-grouped authorities (one entry per case with nested
 *    paragraphs and the structured case note) for answer composition.
 */
const { caseNoteForCaseId, loadStructuredCaseNotes, caseLevelFromCitation } = require("./structured_case_notes");

const LEVEL_RANK = { CFA: 4, CA: 3, CFI: 2, DC: 1 };

function noteForItem(item) {
  if (item.case_id) {
    const note = caseNoteForCaseId(item.case_id);
    if (note) return note;
  }
  const payload = loadStructuredCaseNotes();
  const cite = item.neutral_citation || item.citation || "";
  return (payload.notes || []).find(note =>
    note.case_name === item.case_name && (note.citation === cite || note.neutral_citation === cite)) || null;
}

function tokenizeQuery(query) {
  return String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
}

function relevanceScore(item, note, queryTokens) {
  if (!queryTokens.length) return 0;
  const blob = [
    item.proposition_text, item.supporting_quote || item.exact_quote, item.paragraph_text,
    note?.holding, note?.ratio_or_core_principle, note?.application_summary,
    ...(note?.sub_issue_tags || []), ...(item.issue_tags || []),
  ].filter(Boolean).join(" ").toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (blob.includes(token)) hits += 1;
  }
  return Number((hits / queryTokens.length).toFixed(2));
}

function annotateEvidenceItem(item, { query = "", clusterCaseIds = new Set() } = {}) {
  const note = noteForItem(item);
  const level = note?.case_level && note.case_level !== "unknown_or_unextracted"
    ? note.case_level
    : caseLevelFromCitation(item.neutral_citation || item.citation || "", item.court || "");
  const tags = note?.sub_issue_tags?.length ? note.sub_issue_tags : (item.issue_tags || []);
  const caseKey = item.case_id || `${item.case_name}::${item.neutral_citation || item.citation || ""}`;
  return {
    ...item,
    issue_tag: (note?.doctrine_node_ids || [])[0] || item.doctrine_node_id || "",
    sub_issue_tag: tags[0] || "",
    sub_issue_tags: tags,
    authority_role: item.authority_role && item.authority_role !== "candidate"
      ? item.authority_role
      : (note?.authority_role && note.authority_role !== "unknown_or_unextracted" ? note.authority_role : "supporting"),
    case_level: level,
    paragraph_role: item.paragraph_role || item.significance_label || "supporting_paragraph",
    leading_case_cluster: clusterCaseIds.has(caseKey),
    application_relevance_score: relevanceScore(item, note, tokenizeQuery(query)),
    case_note: note
      ? {
          holding: note.holding,
          ratio_or_core_principle: note.ratio_or_core_principle,
          legal_issue: note.legal_issue,
          application_summary: note.application_summary,
          material_facts: note.material_facts,
          procedural_posture: note.procedural_posture,
          statutory_context: note.statutory_context,
          current_treatment_status: note.current_treatment_status,
        }
      : null,
  };
}

function caseKeyOf(item) {
  return item.case_id || `${item.case_name}::${item.neutral_citation || item.citation || ""}`;
}

/**
 * Diversify evidence: sort cases by (level rank, relevance, paragraph count),
 * then round-robin one paragraph per case so distinct authorities surface
 * before repeat paragraphs from the same case.
 */
function diversifyEvidence(evidence, { query = "" } = {}) {
  if (!Array.isArray(evidence) || evidence.length <= 1) {
    return (evidence || []).map((item, i) => ({ ...annotateEvidenceItem(item, { query }), diversity_rank: i + 1 }));
  }
  const total = evidence.length;
  const counts = new Map();
  for (const item of evidence) {
    const key = caseKeyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const clusterCaseIds = new Set(
    [...counts.entries()].filter(([, count]) => counts.size > 1 && count / total > 0.4).map(([key]) => key));

  const annotated = evidence.map(item => annotateEvidenceItem(item, { query, clusterCaseIds }));
  const byCase = new Map();
  for (const item of annotated) {
    const key = caseKeyOf(item);
    if (!byCase.has(key)) byCase.set(key, []);
    byCase.get(key).push(item);
  }
  const caseOrder = [...byCase.entries()].map(([key, items]) => {
    items.sort((a, b) => b.application_relevance_score - a.application_relevance_score);
    const best = items[0];
    return {
      key,
      items,
      levelRank: LEVEL_RANK[best.case_level] || 0,
      relevance: best.application_relevance_score,
    };
  }).sort((a, b) => b.levelRank - a.levelRank || b.relevance - a.relevance || b.items.length - a.items.length);

  const out = [];
  let round = 0;
  while (out.length < annotated.length) {
    let advanced = false;
    for (const group of caseOrder) {
      if (group.items[round]) {
        out.push(group.items[round]);
        advanced = true;
      }
    }
    if (!advanced) break;
    round += 1;
  }
  return out.map((item, index) => ({ ...item, diversity_rank: index + 1 }));
}

/** Group diversified evidence into one authority entry per case for answer composition. */
function groupEvidenceByCaseForAnswer(evidence, { query = "" } = {}) {
  const diversified = diversifyEvidence(evidence, { query });
  const groups = new Map();
  for (const item of diversified) {
    const key = caseKeyOf(item);
    if (!groups.has(key)) {
      groups.set(key, {
        case_id: item.case_id || "",
        case_name: item.case_name,
        citation: item.neutral_citation || item.citation || "",
        case_level: item.case_level,
        authority_role: item.authority_role,
        leading_case_cluster: item.leading_case_cluster,
        diversity_rank: item.diversity_rank,
        application_relevance_score: item.application_relevance_score,
        case_note: item.case_note,
        issue_tag: item.issue_tag,
        sub_issue_tags: item.sub_issue_tags || [],
        paragraphs: [],
      });
    }
    const group = groups.get(key);
    group.application_relevance_score = Math.max(group.application_relevance_score, item.application_relevance_score);
    group.paragraphs.push({
      para_no: item.para_no || item.paragraph_number || "",
      exact_quote: item.supporting_quote || item.exact_quote || "",
      paragraph_text: item.paragraph_text || "",
      source_url: item.source_url || "",
      paragraph_role: item.paragraph_role,
      proposition_text: item.proposition_text || "",
    });
  }
  return [...groups.values()].sort((a, b) => a.diversity_rank - b.diversity_rank);
}

module.exports = {
  annotateEvidenceItem,
  diversifyEvidence,
  groupEvidenceByCaseForAnswer,
};
