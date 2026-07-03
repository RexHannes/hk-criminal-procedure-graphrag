/**
 * Integration for mined authority candidates (LLM/browser as candidate finder,
 * deterministic verification here).
 *
 * Candidates come from data/legal_ingest/case_corpus/mined_authority_candidates.json
 * (extracted from rendered public HKLII judgment pages). A candidate is only
 * admitted when it passes the same paragraph-proof gate as every other
 * authority: public source URL + paragraph number + exact quote that is a
 * substring of the paragraph text + proposition summary.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const MINED_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "mined_authority_candidates.json");

const ISSUE_AREA_TO_DOCTRINE_NODES = {
  assembly_proportionality: ["criminal_law_hk.public_order.assembly_proportionality", "criminal_procedure_hk.hksar_v_leung_kwok_hung"],
  bail: ["criminal_procedure_hk.bail_factors", "criminal_procedure_hk.bail_right_to_bail"],
  theft_belonging_to_another: ["criminal_law_hk.theft.belonging_to_another"],
  theft_intention_permanently_deprive: ["criminal_law_hk.theft.intention_permanently_deprive"],
  theft_dishonesty: ["criminal_law_hk.theft.dishonesty"],
  interview_caution_confession: ["criminal_procedure_hk.invest_detention_after_arrest", "criminal_procedure_hk.hksar_v_lam_tat_ming"],
};

const PUBLIC_SOURCE_RE = /^https:\/\/(www\.)?(hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk)\//i;

function slugifyCaseId(candidate) {
  const name = String(candidate.case_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const cite = String(candidate.neutral_citation || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `mined_${name}_${cite}`.slice(0, 80);
}

function verifyMinedCandidate(candidate = {}) {
  const errors = [];
  const quote = String(candidate.exact_quote || "").trim();
  const paragraph = String(candidate.paragraph_text || "").trim();
  if (!PUBLIC_SOURCE_RE.test(candidate.source_url || "")) errors.push("non_public_source_url");
  if (!String(candidate.para_no || "").trim()) errors.push("missing_para_no");
  if (quote.length < 12) errors.push("quote_too_short");
  if (!paragraph || !paragraph.includes(quote)) errors.push("quote_not_in_paragraph");
  if (!String(candidate.proposition_text || "").trim()) errors.push("missing_proposition");
  if (!candidate.case_name || !candidate.neutral_citation) errors.push("missing_case_identity");
  if (!ISSUE_AREA_TO_DOCTRINE_NODES[candidate.issue_area]) errors.push("unknown_issue_area");
  return { ok: errors.length === 0, errors };
}

/**
 * Returns verified mined proofs shaped like ingest proof inputs, grouped by
 * doctrine node id, plus a rejection report.
 */
function loadVerifiedMinedProofs() {
  if (!fs.existsSync(MINED_PATH)) return { byDoctrineNode: new Map(), accepted: [], rejected: [] };
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(MINED_PATH, "utf8"));
  } catch (error) {
    return { byDoctrineNode: new Map(), accepted: [], rejected: [{ reason: "unparseable_mined_file" }] };
  }
  const byDoctrineNode = new Map();
  const accepted = [];
  const rejected = [];
  for (const candidate of payload.candidates || []) {
    const check = verifyMinedCandidate(candidate);
    if (!check.ok) {
      rejected.push({ case_name: candidate.case_name, para_no: candidate.para_no, errors: check.errors });
      continue;
    }
    const caseId = slugifyCaseId(candidate);
    const proof = {
      case_id: caseId,
      case_name: candidate.case_name,
      neutral_citation: candidate.neutral_citation,
      law_report_citation: candidate.law_report_citation || "",
      court: candidate.court || "",
      judgment_date: candidate.judgment_date || "",
      para_no: String(candidate.para_no),
      paragraph_number: String(candidate.para_no),
      paragraph_id: `${caseId}_p${candidate.para_no}`,
      exact_quote: candidate.exact_quote,
      paragraph_text: candidate.paragraph_text,
      source_url: candidate.source_url,
      proposition_text: candidate.proposition_text,
      issue_tags: [candidate.issue_area],
      link_type: "mined_paragraph_proof",
      mined: true,
    };
    accepted.push(proof);
    for (const nodeId of ISSUE_AREA_TO_DOCTRINE_NODES[candidate.issue_area]) {
      if (!byDoctrineNode.has(nodeId)) byDoctrineNode.set(nodeId, []);
      byDoctrineNode.get(nodeId).push(proof);
    }
  }
  return { byDoctrineNode, accepted, rejected };
}

module.exports = { loadVerifiedMinedProofs, verifyMinedCandidate, ISSUE_AREA_TO_DOCTRINE_NODES, MINED_PATH };
