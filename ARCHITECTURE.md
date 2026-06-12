# Architecture & Status Audit — Graph-Grounded Legal Inquiry

> Honest status of the "transparent, auditable, non-hallucinated legal knowledge
> trail" goal, written for whoever works on this next (human, Codex, or Cursor).
> Last audited: 2026-06-12.

## The target pipeline

```
user fact pattern ("I was hit by a car and injured…")
        │
        ▼
[1] Deterministic candidate retrieval        ← lexical scoring over ALL domain packs
        │                                      (data/index.json registry)
        ▼
[2] AI rerank (OpenRouter free models /      ← LLM may ONLY reorder candidate IDs;
    DeepSeek)                                  output validated against candidate set,
        │                                      invented IDs are dropped
        ▼
[3] Evidence join (Supabase)                 ← doctrine node → proposition_node_links
        │                                      → proposition_cards → legal_paragraphs
        │                                      → legal_cases (each with review_status)
        ▼
[4] Source-bounded analysis (LLM)            ← prompt forbids invention; must abstain
        │                                      if evidence is candidate_only/absent;
        │                                      JSON-schema output with warnings[]
        ▼
[5] UI: matched nodes + paragraph evidence   ← verification badges, firm SOP overlay,
    trail + firm SOP overlay                   audit notice on every result
```

## What IS implemented (in this repo, after PR #3)

| Stage | Where | Notes |
|---|---|---|
| [1] Deterministic retrieval | `api/search-evidence.js` (`deterministicMatches`) | Tokenised lexical scoring across all 5 domain packs; support nodes (case seeds, statutes) roll up to their parent doctrine node via edges. |
| [2] AI rerank | `api/search-evidence.js` (`askAiToRank`) | OpenRouter first, DeepSeek fallback. **Ranked IDs are filtered against the candidate whitelist** — the model cannot introduce a node it wasn't given. |
| [3] Evidence join | `api/search-evidence.js` (`evidenceForNode`) | Supabase REST chain: `proposition_node_links` → `proposition_cards` → `legal_paragraphs` → `legal_cases`. Each item carries `verification_status` and a derived `answer_layer_status` (`answer_safe` / `paragraph_verified` / `candidate_only`). |
| [4] Grounded analysis | `api/search-evidence.js` (`askAiToAnalyze`) | Temperature 0, JSON-only, explicit abstain flag, rules forbidding invented authorities. Post-validation now strips node/case references that do not match the supplied graph/evidence rows. Warnings are surfaced, never swallowed. |
| [5] UI | `viewer/app.js` ("AI Inquiry" view) | Fact-pattern textarea → calls the API → renders analysis, warnings, matched nodes (clickable into the Inspector), per-paragraph evidence with badges, and the firm SOP that applies wherever a matched node sits inside a flow with a linked SOP. Falls back to client-side lexical search (clearly labelled) when the API isn't deployed. |
| Single-node evidence lookup | `api/doctrine-evidence.js` | Same evidence chain for one `doctrine_node_id` (used for inspector drill-down). |
| Validation scripts | `scripts/validate_evidence_links.py`, `scripts/search_evidence_trace.py`, `scripts/export_doctrine_nodes.py` | CLI checks of the link integrity and trail. |
| Firm SOP overlay | `data/firm_overlay/demo_firm.json` + viewer | Versioned SOPs/templates layered onto flows; inquiry results show applicable SOPs. This is the "firm individualised private practices" layer — per-firm overlays are just more JSON files of the same shape. |

### Anti-hallucination guarantees, stated precisely

What is **structurally guaranteed** (code-enforced, not prompt-hoped):
- Matched node IDs always exist in the graph (whitelist filter after rerank).
- Evidence rows always come from Supabase rows, never model output.
- Coverage status is computed from stored `review_status`, not by the model.
- LLM `inquiry_analysis.node_references[]` and `case_references[]` are
  post-validated against the matched graph nodes and supplied evidence rows;
  unsupported references are dropped and returned as warnings.
- If Supabase or the AI is unavailable, the response degrades with explicit
  warnings (`backend_evidence_unavailable`, `ai_not_configured_fallback_search`)
  instead of silently pretending.

What is **prompt-enforced only** (i.e. could still drift — keep human review):
- The free-text `summary` / `legal_position` / `application` strings in
  `inquiry_analysis.summary`, `legal_position`, and `application`. The prompt
  forbids invention and demands abstention, but the prose itself is LLM output.
  **Treat it as a drafting aid, never as the audit record.** The audit record is
  the node + paragraph trail plus the post-validated references.

## What is NOT yet implemented (action items)

### A. Supabase — where it plays a role, and the gaps   ← for local Codex/Cursor

Supabase is the **evidence backbone**: it stores the crawled case corpus and the
human-reviewable links between cases and doctrine nodes. The doctrine graphs
(this repo's JSON packs) stay in git; Supabase holds what's too big / too
mutable for git.

Schema lives in **Casemap4** (`supabase/migrations/`):
- `20260523090000_legal_authority_rag_v2.sql`: `source_documents`, `legal_cases`,
  `legal_paragraphs`, `proposition_cards`, `proposition_spans`,
  `authority_relationships`, `legal_topics`, `golden_queries`, `ingestion_jobs`,
  `case_processing_status`, `extraction_runs`, `embedding_runs`,
  `human_review_items`, …
- `20260212120000_case_chunks_retrieval_scale.sql`: pgvector (384-dim,
  MiniLM-L6-v2) + FTS + HNSW index + hybrid-retrieval RPC on `case_chunks`.

**GAP 1 (blocking):** `api/search-evidence.js` queries
`proposition_node_links` (doctrine_node_id ↔ proposition_id, link_type,
confidence, review_status, linking_method). This repo now includes a migration
artifact at `supabase/migrations/20260612000000_create_proposition_node_links.sql`.
If Casemap4 remains the canonical Supabase project, copy/apply that migration
there and run the Supabase advisors before production.

**GAP 2:** Vercel env vars must be set for the API to leave fallback mode:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never expose to
the static viewer), `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`), or
`DEEPSEEK_API_KEY`. Without them the endpoint still works but returns
deterministic matches with warnings.

**GAP 3:** `evidenceForNode` does N+1 REST calls per match. Fine for a demo;
for production replace with one Postgres RPC (a `security definer` function
joining the four tables) — the pattern already exists in the case_chunks
migration.

### B. DeepSeek citation miner (your step 3) — partially built, unmerged

Branch `codex/deepseek-candidate-linking` in THIS repo contains a "DeepSeek
candidate doctrine linker" (commits `2546f1d`, `9ab5469`), but it is based on
an older tree and cannot be merged wholesale without deleting PR #3's restored
domain packs/API/viewer. Cherry-pick only its linker/validator/test files after
the `proposition_node_links` table exists. Casemap4 also has `extraction_runs`
/ `ingestion_jobs` tables and batch scripts (`scripts/targeted_authority_batch.py`).
The intended flow:

1. For each doctrine node, take its `case_seeds` / `statute_refs` (from the
   books/workflow-derived graph) as anchors.
2. DeepSeek (cheap, JSON-mode) reads candidate paragraphs and proposes
   `proposition_cards` + `proposition_node_links` rows with
   `review_status='machine_candidate'`.
3. Nothing machine-made is ever `answer_safe`; promotion happens only through
   `human_review_items`.

**Action:** port/cherry-pick the DeepSeek linker onto the PR #3 codebase, point
it at the `proposition_node_links` table from GAP 1, and keep all generated
links at `review_status='machine_candidate'` until human review.

### C. 200k-case miner (your step 4) — designed, not built

Casemap4 has the scaffolding (`ingestion_jobs`, `case_processing_status`,
`source_documents`, pgvector chunks) but there is **no crawler** in either repo.
Suggested order when building it:
1. Crawl HKLII/judiciary listings → `source_documents` (respect robots/rate
   limits; store raw HTML + checksum).
2. Parse → `legal_cases` + numbered `legal_paragraphs` (paragraph fidelity is
   what makes the trail auditable — keep `para_no` + `source_url`).
3. Embed paragraphs → `case_chunks` (pipeline exists in Casemap4).
4. Retrieval at inquiry time then becomes: doctrine-node match (graph) →
   linked propositions (curated) → *plus* hybrid vector/FTS search over chunks
   as a "wider net" tier, always labelled `candidate_only`.

### D. Rerank quality

Current rerank is LLM-listwise over ≤20 lexical candidates. Good enough for
demo. Upgrade path: embed doctrine nodes (Supabase already standardises on
MiniLM 384-dim) → cosine top-k → optional cross-encoder/LLM rerank. That makes
step [1] recall-robust for fact patterns that share no keywords with node
labels ("crashed by car" → `occupiers/negligence` nodes).

## Answers to the three confirmation questions

1. **Transparent, auditable, non-hallucinated trail?** Yes at the *retrieval and
   evidence* level (structurally enforced, see guarantees above); the free-prose
   analysis layer is prompt-constrained but should keep its "not the audit
   record" framing. Implemented and now restored + surfaced in the UI.
2. **Firm-individualised SOP overlay on a markable Graphflow?** Yes — the
   overlay JSON is versioned, per-firm, layered onto flows AND now onto inquiry
   results. Multi-firm = one overlay file per firm + an overlay picker (small
   follow-up task).
3. **RAG + rerank with the AI "reading strictly" from maintained graphs?** The
   architecture enforces strict reading where it can be enforced (ID whitelists,
   DB-sourced evidence, status from stored fields) and constrains the rest by
   prompt + abstention + warnings. The guarantee is therefore: *as long as the
   domain graphs and the Supabase evidence store are maintained and reviewed,
   nothing can enter a result that isn't in them — and anything unverified is
   labelled as such rather than hidden.*
