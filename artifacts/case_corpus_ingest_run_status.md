# Case Corpus Ingest Run Status

Idempotent sample ingest/chunk/embed/index/eval run for the targeted public HKLII sample corpus. Network fetching and live Qdrant writes are disabled in CI.

| Stage | Attempted | Success | Failed | Skipped |
|---|---:|---:|---:|---:|
| discover_case | 120 | 120 | 0 | 0 |
| fetch_public_source | 120 | 120 | 0 | 0 |
| cache_raw_source | 120 | 120 | 0 | 0 |
| normalize_text | 344 | 344 | 0 | 0 |
| paragraphize | 120 | 120 | 0 | 0 |
| create_paragraph_cards | 344 | 344 | 0 | 0 |
| extract_propositions | 344 | 344 | 0 | 0 |
| build_principles | 344 | 344 | 0 | 0 |
| build_digests | 120 | 120 | 0 | 0 |
| issue_map | 584 | 584 | 0 | 0 |
| chunk | 918 | 918 | 0 | 0 |
| embed_dry_run_vectorize | 918 | 918 | 0 | 0 |
| index_dry_run | 918 | 918 | 0 | 0 |
| evaluate_retrieval | 12 | 12 | 0 | 0 |

## Outputs

- data/legal_ingest/case_corpus/ingest_queue_sample_100.jsonl
- data/legal_ingest/case_corpus/fetch_cache_manifest_sample_100.jsonl
- data/legal_ingest/case_corpus/chunks_sample_100.jsonl
- data/legal_ingest/case_corpus/embedded_chunks_manifest_sample_100.jsonl
- artifacts/case_corpus_qdrant_dry_run.json
- artifacts/case_corpus_retrieval_eval.json
- artifacts/case_corpus_ingest_run_status.json
- artifacts/case_corpus_ingest_run_status.md
