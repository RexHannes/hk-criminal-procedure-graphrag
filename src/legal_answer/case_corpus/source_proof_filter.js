const {
  loadCaseCorpus,
  byId,
  sha256NormalizedParagraphText,
  publicSourceUrl,
} = require("./case_corpus_store");
const { principleUsable } = require("./principle_quality");

function sourceProofIndexes(corpus = loadCaseCorpus({ mode: "sample" })) {
  return {
    paragraphById: byId(corpus.paragraphs, "paragraph_id"),
    propositionById: byId(corpus.propositions, "proposition_id"),
    principleById: byId(corpus.principles, "principle_id"),
    digestById: byId(corpus.digests, "case_digest_card_id"),
    digestByCaseId: byId(corpus.digests, "case_id"),
  };
}

function paragraphVerified(paragraph = null) {
  return Boolean(
    paragraph &&
    paragraph.paragraph_text &&
    paragraph.checksum === sha256NormalizedParagraphText(paragraph.paragraph_text) &&
    publicSourceUrl(paragraph.source_url) &&
    /#p\d+$/i.test(paragraph.source_url) &&
    paragraph.answer_layer_status === "research_only"
  );
}

function propositionVerified(proposition = null, indexes = sourceProofIndexes()) {
  if (!proposition || proposition.answer_layer_status !== "research_only") return false;
  const exactQuote = String(proposition.exact_quote_support || "").trim();
  if (!exactQuote) return false;
  return (proposition.source_paragraph_ids || []).some(id => {
    const paragraph = indexes.paragraphById.get(id);
    return paragraphVerified(paragraph) && paragraph.paragraph_text.includes(exactQuote);
  });
}

function principleVerified(principle = null, indexes = sourceProofIndexes()) {
  if (!principle || principle.answer_layer_status !== "research_only") return false;
  if (!principleUsable(principle)) return false;
  const hasProp = (principle.source_proposition_ids || []).some(id => propositionVerified(indexes.propositionById.get(id), indexes));
  const hasParagraph = (principle.source_paragraph_ids || []).some(id => paragraphVerified(indexes.paragraphById.get(id)));
  return hasProp && hasParagraph;
}

function proofReason(candidate = {}, indexes = sourceProofIndexes()) {
  const blob = JSON.stringify(candidate);
  if (/case_recall_only/i.test(blob)) return "case_recall_only_not_answer_authority";
  if (/private|client|licensed|lexis|westlaw/i.test(blob)) return "private_or_licensed_source_not_public_authority";
  if (candidate.answer_layer_status && candidate.answer_layer_status !== "research_only") return "not_research_only_public_demo";
  if (candidate.source_url && !publicSourceUrl(candidate.source_url)) return "non_public_source_url";

  const paragraphIds = candidate.paragraph_ids || [];
  const propIds = candidate.proposition_ids || [];
  const principleIds = candidate.principle_ids || [];
  const digestIds = candidate.digest_ids || [];

  const hasParagraph = paragraphIds.some(id => paragraphVerified(indexes.paragraphById.get(id)));
  const hasProposition = propIds.some(id => propositionVerified(indexes.propositionById.get(id), indexes));
  const hasPrinciple = principleIds.some(id => principleVerified(indexes.principleById.get(id), indexes));
  const hasDigest = digestIds.some(id => indexes.digestById.has(id)) || Boolean(candidate.case_id && indexes.digestByCaseId.has(candidate.case_id));

  if (candidate.chunk_type === "case_paragraph_chunk" && !hasParagraph) return "paragraph_card_missing_or_checksum_failed";
  if (candidate.chunk_type === "case_proposition_chunk" && !hasProposition) return "proposition_missing_quote_verified_paragraph";
  if (candidate.chunk_type === "case_principle_chunk" && !hasPrinciple) return "principle_missing_proposition_or_paragraph_proof";
  if (candidate.chunk_type === "case_digest_chunk" && !hasDigest) return "digest_missing";
  if (candidate.chunk_type === "issue_cluster_chunk" && !(hasParagraph && (hasProposition || hasPrinciple || hasDigest))) return "issue_cluster_missing_source_proof";
  if (!hasParagraph && !hasDigest) return "no_paragraph_or_digest_proof";
  if (candidate.current_treatment_status && candidate.current_treatment_status !== "checked_current") return "allowed_with_unchecked_treatment_warning";
  return "";
}

function filterSourceProof(candidates = [], { corpus = loadCaseCorpus({ mode: "sample" }) } = {}) {
  const indexes = sourceProofIndexes(corpus);
  const included = [];
  const excluded_results = [];
  for (const candidate of candidates) {
    const reason = proofReason(candidate, indexes);
    if (!reason || reason === "allowed_with_unchecked_treatment_warning") {
      included.push({
        ...candidate,
        source_proof_status: reason === "allowed_with_unchecked_treatment_warning"
          ? "passed_with_unchecked_treatment_warning"
          : "passed",
      });
    } else {
      excluded_results.push({
        chunk_id: candidate.chunk_id,
        source_object_id: candidate.source_object_id,
        case_id: candidate.case_id,
        reason,
      });
    }
  }
  return { included, excluded_results };
}

module.exports = {
  sourceProofIndexes,
  paragraphVerified,
  propositionVerified,
  principleVerified,
  proofReason,
  filterSourceProof,
};
