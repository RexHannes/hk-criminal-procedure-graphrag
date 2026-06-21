const COURT_WEIGHT = {
  CFA: 100,
  CA: 80,
  CFI: 60,
  DC: 40,
  MAG: 20,
};

const ROLE_WEIGHT = {
  ratio: 30,
  sets_out_test: 24,
  states_rule: 22,
  applies_rule: 18,
  application: 14,
  obiter: 8,
  party_argument: -20,
  procedural_history: -25,
};

function yearFromEvidence(item) {
  const dateMatch = String(item.date || "").match(/\b(19|20)\d{2}\b/);
  if (dateMatch) return Number(dateMatch[0]);
  const citationMatch = String(item.neutral_citation || item.case_id || "").match(/\b(19|20)\d{2}\b/);
  return citationMatch ? Number(citationMatch[0]) : 0;
}

function courtLevel(item) {
  const level = String(item.court_level || "").toUpperCase();
  if (level) return level;
  const citation = String(item.neutral_citation || "").toUpperCase();
  if (citation.includes("HKCFA")) return "CFA";
  if (citation.includes("HKCA")) return "CA";
  if (citation.includes("HKCFI")) return "CFI";
  if (citation.includes("HKDC")) return "DC";
  return "";
}

function lineageScore(item) {
  const level = courtLevel(item);
  const courtScore = COURT_WEIGHT[level] || 0;
  const roleScore = ROLE_WEIGHT[item.authority_role] ?? 0;
  const year = yearFromEvidence(item);
  const recencyScore = year ? Math.min(25, Math.max(0, year - 2000) * 0.8) : 0;
  const publicSourceScore = (item.validator_flags || []).includes("public_source_candidate") ? 8 : 0;
  const fixturePenalty = (item.validator_flags || []).includes("fixture_only") ? -60 : 0;
  const laterConsideredPenalty = /later_considered|limited|corrected/i.test(`${item.authority_status} ${item.lineage_note}`) ? -8 : 0;
  const quoteScore = item.supporting_quote && item.paragraph_text?.includes(item.supporting_quote) ? 12 : -30;
  return Number((courtScore + roleScore + recencyScore + publicSourceScore + fixturePenalty + laterConsideredPenalty + quoteScore).toFixed(3));
}

function lineageRankEvidence(evidence) {
  return (evidence || [])
    .map(item => ({
      ...item,
      court_level: item.court_level || courtLevel(item),
      lineage_year: yearFromEvidence(item),
      lineage_score: lineageScore(item),
      lineage_rank_reason: [
        item.court_level || courtLevel(item) || "unknown court",
        item.authority_role || "unknown role",
        item.neutral_citation || "",
        /later_considered|limited|corrected/i.test(`${item.authority_status} ${item.lineage_note}`) ? "later-treatment flag" : "",
        (item.validator_flags || []).includes("fixture_only") ? "fixture penalty" : "",
      ].filter(Boolean).join(" | "),
    }))
    .sort((a, b) => {
      if (b.lineage_score !== a.lineage_score) return b.lineage_score - a.lineage_score;
      if ((b.lineage_year || 0) !== (a.lineage_year || 0)) return (b.lineage_year || 0) - (a.lineage_year || 0);
      return String(a.proposition_id || "").localeCompare(String(b.proposition_id || ""));
    });
}

module.exports = {
  courtLevel,
  lineageRankEvidence,
  lineageScore,
  yearFromEvidence,
};
