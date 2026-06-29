const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  CASE_CORPUS_DIR,
  PATHS,
  normalizeParagraphText,
  publicSourceUrl,
  writeJsonl,
  readJsonl,
} = require("./case_corpus_store");

const CACHE_SCHEMA_VERSION = "case_source_fetch_cache_v1";
const DEFAULT_FETCHED_AT = "2026-06-29T00:00:00.000Z";

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function cacheKeyForSourceUrl(sourceUrl = "") {
  return `source_${sha256(String(sourceUrl || "").trim()).slice(0, 24)}`;
}

function assertPublicSource(sourceUrl = "") {
  if (!publicSourceUrl(sourceUrl)) {
    throw new Error(`Refusing to cache non-public source URL: ${sourceUrl}`);
  }
  if (/client|private|upload|drive\.google|dropbox|onedrive|lexis|westlaw|practical\s*law/i.test(sourceUrl)) {
    throw new Error(`Refusing to cache private/licensed source URL: ${sourceUrl}`);
  }
}

function rawSnapshotForCase(sourceCase = {}) {
  return [
    sourceCase.source_url,
    sourceCase.neutral_citation,
    sourceCase.case_name,
    sourceCase.court,
    sourceCase.judgment_date,
    ...(sourceCase.selected_paragraphs || []).map(paragraph => normalizeParagraphText(paragraph.paragraph_text)),
  ].join("\n");
}

function cacheRecordFromSourceCase(sourceCase = {}, { fetchedAt = DEFAULT_FETCHED_AT } = {}) {
  assertPublicSource(sourceCase.source_url);
  const raw = rawSnapshotForCase(sourceCase);
  return {
    cache_key: cacheKeyForSourceUrl(sourceCase.source_url),
    source_url: sourceCase.source_url,
    case_id: sourceCase.case_id,
    neutral_citation: sourceCase.neutral_citation,
    source_system: sourceCase.source_system || "hklii",
    http_status: 200,
    fetched_at: fetchedAt,
    raw_source_checksum: sha256(raw),
    checksum_algorithm: "sha256_source_snapshot_text",
    source_visibility: "public",
    cache_schema_version: CACHE_SCHEMA_VERSION,
    cache_status: "committed_source_snapshot",
    refetch_policy: "skip_when_checksum_unchanged",
    private_source_cached: false,
  };
}

function loadSourceArtifact() {
  const sourcePath = path.join(CASE_CORPUS_DIR, "criminal_sample_source_cases.json");
  if (!fs.existsSync(sourcePath)) return { cases: [] };
  return JSON.parse(fs.readFileSync(sourcePath, "utf8"));
}

function buildFetchCacheManifest({ write = false } = {}) {
  const artifact = loadSourceArtifact();
  const records = (artifact.cases || []).map(item => cacheRecordFromSourceCase(item));
  if (write) writeJsonl(PATHS.fetchCacheManifestSample, records);
  return records;
}

function loadFetchCacheManifest({ optional = true } = {}) {
  return readJsonl(PATHS.fetchCacheManifestSample, { optional });
}

function shouldRefetch({ existingRecord, newChecksum = "", forceRefresh = false } = {}) {
  if (forceRefresh) return true;
  if (!existingRecord) return true;
  return Boolean(newChecksum && existingRecord.raw_source_checksum !== newChecksum);
}

module.exports = {
  CACHE_SCHEMA_VERSION,
  DEFAULT_FETCHED_AT,
  cacheKeyForSourceUrl,
  cacheRecordFromSourceCase,
  buildFetchCacheManifest,
  loadFetchCacheManifest,
  shouldRefetch,
};
