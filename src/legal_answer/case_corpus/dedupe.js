const fs = require("fs");
const path = require("path");
const {
  ROOT,
  loadCaseCorpus,
  normalizeParagraphText,
  sha256NormalizedParagraphText,
} = require("./case_corpus_store");

const DUPLICATES_REPORT_PATH = path.join(ROOT, "artifacts", "case_corpus_duplicates_report.json");

function normalizedCaseName(name = "") {
  return normalizeParagraphText(name)
    .toLowerCase()
    .replace(/\b(hksar|between|respondent|appellant|applicant|defendant)\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function duplicateGroups(records = [], keyFn = () => "") {
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, count: group.length, records: group }));
}

function summarizeGroups(groups = [], mapper = item => item) {
  return groups.map(group => ({
    key: group.key,
    count: group.count,
    records: group.records.map(mapper),
  }));
}

function buildDuplicatesReport({ mode = "sample", write = false } = {}) {
  const corpus = loadCaseCorpus({ mode });
  const sourceUrlDuplicates = duplicateGroups(corpus.registry, item => item.source_url);
  const citationDuplicates = duplicateGroups(corpus.registry, item => item.neutral_citation);
  const caseIdDuplicates = duplicateGroups(corpus.registry, item => item.case_id);
  const nameDateDuplicates = duplicateGroups(corpus.registry, item => `${normalizedCaseName(item.case_name)}|${item.judgment_date}`);
  const paragraphChecksumDuplicates = duplicateGroups(corpus.paragraphs, item => item.checksum || sha256NormalizedParagraphText(item.paragraph_text));
  const paragraphTextChecksumDuplicates = duplicateGroups(corpus.paragraphs, item => sha256NormalizedParagraphText(item.paragraph_text));

  const caseMapper = item => ({
    case_id: item.case_id,
    case_name: item.case_name,
    neutral_citation: item.neutral_citation,
    judgment_date: item.judgment_date,
    source_url: item.source_url,
  });
  const paragraphMapper = item => ({
    paragraph_id: item.paragraph_id,
    case_id: item.case_id,
    neutral_citation: item.neutral_citation,
    para_no: item.para_no,
    source_url: item.source_url,
  });

  const duplicateCaseGroupCount = sourceUrlDuplicates.length + citationDuplicates.length + caseIdDuplicates.length + nameDateDuplicates.length;
  const duplicateParagraphGroupCount = paragraphChecksumDuplicates.length + paragraphTextChecksumDuplicates.length;
  const denominator = Math.max(corpus.registry.length + corpus.paragraphs.length, 1);
  const duplicateRate = Number(((duplicateCaseGroupCount + duplicateParagraphGroupCount) / denominator).toFixed(6));

  const report = {
    report_id: "case_corpus_duplicates_report_v1",
    generated_at: "2026-06-29T00:00:00.000Z",
    mode,
    registry_case_count: corpus.registry.length,
    paragraph_card_count: corpus.paragraphs.length,
    duplicate_rate: duplicateRate,
    duplicate_group_counts: {
      source_url: sourceUrlDuplicates.length,
      neutral_citation: citationDuplicates.length,
      case_id: caseIdDuplicates.length,
      normalized_case_name_date: nameDateDuplicates.length,
      paragraph_checksum: paragraphChecksumDuplicates.length,
      paragraph_text_checksum: paragraphTextChecksumDuplicates.length,
    },
    duplicates: {
      source_url: summarizeGroups(sourceUrlDuplicates, caseMapper),
      neutral_citation: summarizeGroups(citationDuplicates, caseMapper),
      case_id: summarizeGroups(caseIdDuplicates, caseMapper),
      normalized_case_name_date: summarizeGroups(nameDateDuplicates, caseMapper),
      paragraph_checksum: summarizeGroups(paragraphChecksumDuplicates, paragraphMapper),
      paragraph_text_checksum: summarizeGroups(paragraphTextChecksumDuplicates, paragraphMapper),
    },
    status: duplicateCaseGroupCount === 0 ? "passed_no_case_duplicates" : "duplicates_require_review",
  };

  if (write) {
    fs.mkdirSync(path.dirname(DUPLICATES_REPORT_PATH), { recursive: true });
    fs.writeFileSync(DUPLICATES_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

module.exports = {
  DUPLICATES_REPORT_PATH,
  normalizedCaseName,
  buildDuplicatesReport,
};
