const crypto = require("crypto");
const { CHUNK_SCHEMA_VERSION } = require("./chunker");

const DEFAULT_EMBEDDING_CONFIG = {
  embedding_provider: process.env.LEGAL_EMBEDDING_PROVIDER || "local-hash",
  embedding_model: process.env.OPENROUTER_EMBEDDING_MODEL || "local-hash-legal-demo-v1",
  vector_dimension: Number(process.env.LEGAL_EMBEDDING_DIM || 2048),
  tokenizer_or_token_estimator: "whitespace_token_estimate_x1_25",
  embedding_version: "case-corpus-embedding-v1",
  created_at: "2026-06-29T00:00:00.000Z",
  chunk_schema_version: CHUNK_SCHEMA_VERSION,
  payload_schema_version: "case-corpus-qdrant-payload-v1",
};

function embeddingConfig(overrides = {}) {
  return {
    ...DEFAULT_EMBEDDING_CONFIG,
    ...overrides,
    vector_dimension: Number(overrides.vector_dimension || DEFAULT_EMBEDDING_CONFIG.vector_dimension),
  };
}

function deterministicVector(text = "", { dimension = DEFAULT_EMBEDDING_CONFIG.vector_dimension } = {}) {
  const vector = [];
  let seed = crypto.createHash("sha256").update(String(text || ""), "utf8").digest();
  while (vector.length < dimension) {
    seed = crypto.createHash("sha256").update(seed).digest();
    for (const byte of seed) {
      vector.push(Number(((byte / 255) * 2 - 1).toFixed(6)));
      if (vector.length >= dimension) break;
    }
  }
  return vector;
}

function vectorChecksum(vector = []) {
  return crypto.createHash("sha256").update(JSON.stringify(vector.slice(0, 32)), "utf8").digest("hex");
}

function payloadForChunk(chunk = {}, config = embeddingConfig()) {
  return {
    chunk_id: chunk.chunk_id,
    chunk_type: chunk.chunk_type,
    source_object_id: chunk.source_object_id,
    case_id: chunk.case_id,
    case_name: chunk.case_name,
    citation: chunk.citation,
    court: chunk.court,
    judgment_date: chunk.judgment_date,
    domain_id: chunk.domain_id || "criminal_law_hk",
    source_kind: chunk.source_kind || "case_law",
    issue_tags: chunk.issue_tags || [],
    authority_role: chunk.authority_role,
    authority_strength: chunk.authority_strength,
    source_url: chunk.source_url,
    paragraph_ids: chunk.paragraph_ids || [],
    paragraph_id: (chunk.paragraph_ids || [])[0] || "",
    proposition_ids: chunk.proposition_ids || [],
    proposition_id: (chunk.proposition_ids || [])[0] || "",
    principle_ids: chunk.principle_ids || [],
    principle_id: (chunk.principle_ids || [])[0] || "",
    digest_ids: chunk.digest_ids || [],
    digest_id: (chunk.digest_ids || [])[0] || "",
    checksum: chunk.checksum,
    embedding_model: config.embedding_model,
    embedding_version: config.embedding_version,
    vector_dimension: config.vector_dimension,
    current_treatment_status: chunk.current_treatment_status || "unchecked",
    answer_layer_status: chunk.answer_layer_status,
    review_status: chunk.review_status,
    source_visibility: "public",
    tenant_id: "public",
  };
}

module.exports = {
  DEFAULT_EMBEDDING_CONFIG,
  embeddingConfig,
  deterministicVector,
  vectorChecksum,
  payloadForChunk,
};
