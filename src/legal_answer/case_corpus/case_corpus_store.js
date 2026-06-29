const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const CASE_CORPUS_DIR = path.join(ROOT, "data", "legal_ingest", "case_corpus");

const PATHS = {
  registryFull: path.join(CASE_CORPUS_DIR, "case_registry_10000.jsonl"),
  registrySample: path.join(CASE_CORPUS_DIR, "sample_case_registry_100.jsonl"),
  paragraphsSample: path.join(CASE_CORPUS_DIR, "paragraph_cards_sample_100.jsonl"),
  propositionsSample: path.join(CASE_CORPUS_DIR, "proposition_cards_sample_100.jsonl"),
  principlesSample: path.join(CASE_CORPUS_DIR, "principle_cards_sample_100.jsonl"),
  digestsSample: path.join(CASE_CORPUS_DIR, "case_digest_cards_sample_100.jsonl"),
  issueTaxonomy: path.join(CASE_CORPUS_DIR, "issue_taxonomy_hk_law_v1.json"),
  issueMapSample: path.join(CASE_CORPUS_DIR, "issue_case_map_sample_100.jsonl"),
};

function ensureCaseCorpusDir() {
  fs.mkdirSync(CASE_CORPUS_DIR, { recursive: true });
}

function normalizeParagraphText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function sha256NormalizedParagraphText(text = "") {
  return crypto.createHash("sha256").update(normalizeParagraphText(text), "utf8").digest("hex");
}

function readJsonl(filePath, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return [];
    throw new Error(`Missing JSONL file: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path.relative(ROOT, filePath)}:${index + 1}: invalid JSON: ${error.message}`);
      }
    });
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${records.map(record => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

function loadCaseCorpus({ mode = "sample" } = {}) {
  const registryPath = mode === "full" ? PATHS.registryFull : PATHS.registrySample;
  return {
    mode,
    registry: readJsonl(registryPath, { optional: true }),
    paragraphs: readJsonl(PATHS.paragraphsSample, { optional: true }),
    propositions: readJsonl(PATHS.propositionsSample, { optional: true }),
    principles: readJsonl(PATHS.principlesSample, { optional: true }),
    digests: readJsonl(PATHS.digestsSample, { optional: true }),
    issueMap: readJsonl(PATHS.issueMapSample, { optional: true }),
    issueTaxonomy: fs.existsSync(PATHS.issueTaxonomy)
      ? JSON.parse(fs.readFileSync(PATHS.issueTaxonomy, "utf8"))
      : { issues: [] },
  };
}

function byId(records, key) {
  return new Map((records || []).map(record => [record[key], record]));
}

function publicSourceUrl(url = "") {
  return /^https:\/\/(www\.)?(hklii\.hk|legalref\.judiciary\.hk|judiciary\.hk|elegislation\.gov\.hk)\//i.test(String(url || ""));
}

module.exports = {
  ROOT,
  CASE_CORPUS_DIR,
  PATHS,
  ensureCaseCorpusDir,
  normalizeParagraphText,
  sha256NormalizedParagraphText,
  readJsonl,
  writeJsonl,
  loadCaseCorpus,
  byId,
  publicSourceUrl,
};
