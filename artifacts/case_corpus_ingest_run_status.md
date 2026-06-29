# Case Corpus Ingest Run Status

Idempotent sample ingest/chunk/embed/index/eval run for the 100-case public HKLII corpus. Network fetching and live Qdrant writes are disabled in CI.

| Stage | Attempted | Success | Failed | Skipped |
|---|---:|---:|---:|---:|
| discover_case | 100 | 100 | 0 | 0 |
| fetch_public_source | 100 | 100 | 0 | 0 |
| cache_raw_source | 100 | 100 | 0 | 0 |
| normalize_text | 300 | 300 | 0 | 0 |
| paragraphize | 100 | 100 | 0 | 0 |
| create_paragraph_cards | 300 | 300 | 0 | 0 |
| extract_propositions | 300 | 300 | 0 | 0 |
| build_principles | 300 | 300 | 0 | 0 |
| build_digests | 100 | 100 | 0 | 0 |
| issue_map | 506 | 506 | 0 | 0 |
| chunk | 1012 | 1012 | 0 | 0 |
| embed_dry_run_vectorize | 1012 | 1012 | 0 | 0 |
| index_dry_run | 1012 | 1012 | 0 | 0 |
| evaluate_retrieval | 9 | 9 | 0 | 0 |

## Outputs

- data/legal_ingest/case_corpus/ingest_queue_sample_100.jsonl
- data/legal_ingest/case_corpus/fetch_cache_manifest_sample_100.jsonl
- data/legal_ingest/case_corpus/chunks_sample_100.jsonl
- data/legal_ingest/case_corpus/embedded_chunks_manifest_sample_100.jsonl
- artifacts/case_corpus_qdrant_dry_run.json
- artifacts/case_corpus_retrieval_eval.json
- artifacts/case_corpus_ingest_run_status.json
- artifacts/case_corpus_ingest_run_status.md
