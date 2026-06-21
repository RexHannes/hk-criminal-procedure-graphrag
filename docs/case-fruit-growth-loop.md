# Case Fruit Growth Loop

This loop is the operational bridge between the criminal procedure principle tree
and recallable, source-gated case evidence.

It is deliberately not a bulk scraper. It grows case "fruits" section by
section:

```text
principle branch
-> public case source manifest
-> paragraph cards
-> candidate proposition cards
-> doctrine-node links
-> L4 case applications / L5 paragraph proof
-> Supabase review queue
-> Qdrant vectors with legal metadata filters
-> retrieval bundle
-> source-gated answer / SOP cache
-> human review and correction loop
```

## Why This Exists

The previous pieces existed separately:

- public bail batch builder;
- DeepSeek proposal helper;
- exact-quote proposal validator;
- doctrine-node linker;
- Qdrant indexer;
- Supabase seed script;
- scale-readiness gates;
- answer/SOP cache.

The growth loop ties them together and keeps the policy clear:

```text
DeepSeek may propose.
Validators decide.
Reviewers promote.
The answer composer cites or abstains.
```

## Default Scope

The default loop is bail-only:

```text
criminal_procedure_hk.nsl_bail
criminal_procedure_hk.bail_factors
criminal_procedure_hk.bail_flow_step5
criminal_procedure_hk.bail_right_to_bail
```

It is capped at 50 public bail cases unless later gates are green.

It blocks:

- cross-domain 20k criminal crawl;
- private/licensed books;
- firm forms;
- bulk auto-attach;
- automatic answer-safe promotion.

## Token-Saving DeepSeek Policy

DeepSeek is optional and used only for candidate extraction-rule proposals.

The prompt budget is intentionally small:

```text
one source paragraph per call
max 7000 paragraph characters
max 3 candidate proposals per paragraph
JSON-only
temperature 0
```

Never send full books or whole judgments. Send one paragraph, minimal source
metadata and the allowed doctrine-node list. The proposal still has to pass:

- exact quote appears in paragraph;
- doctrine node exists;
- doctrine node is in the allowed branch;
- review state is `machine_candidate`;
- answer-safe is false.

## Browser-Guided Case Discovery

Targeted search is allowed only as a discovery and verification stage. It is not
a legal reasoning stage and it cannot promote anything to answer-safe.

The loop uses:

```text
doctrine branch / book-derived vocabulary
-> deterministic query seeds
-> optional DeepSeek case-name leads
-> allowlisted public-source search
-> public case verification
-> public judgment fetch
-> paragraph parser
-> exact-quote proposition validator
```

DeepSeek-proposed case names start as `llm_unverified_seed`. Book-derived case
names start as `book_derived_seed`. Neither status can enter the proposition
pipeline until a public source has verified the case and the fetched judgment
has been paragraphized.

The browser/search policy is governed by:

```text
data/legal_ingest/criminal_evidence_tree_v1/browser_discovery_policy.json
```

The policy is intentionally narrow:

```text
allowed public legal domains only
slow per-run limits
no CAPTCHA, paywall, login, robots/terms evasion
no private book/form ingestion
no answer-safe promotion
```

This is the safe targeted path:

```text
case seed -> verified public case -> fetched public judgment -> parsed paragraph
```

This is forbidden:

```text
DeepSeek says case exists -> database authority
```

Lineage edges also require text support or human review. An LLM assertion that
one case follows, applies, distinguishes or overrules another is only a lead
until the cited case and relation can be found in the judgment text, or a human
reviewer confirms it.

Validate this layer:

```bash
node scripts/validate_browser_guided_discovery.js
```

## Run The Loop

Report only:

```bash
node scripts/run_case_fruit_growth_loop.js
```

Safe local execution:

```bash
node scripts/run_case_fruit_growth_loop.js --execute-safe
```

Write reusable loop state:

```bash
node scripts/run_case_fruit_growth_loop.js --write-state
```

This writes git-ignored operational files under:

```text
data/legal_ingest/reports/case_fruit_growth_loop/
├─ last_report.json
├─ branch_backlog.json
└─ correction_queue.json
```

`branch_backlog.json` shows which doctrine nodes have candidate fruits, which
paragraph prompt cache keys already exist, and whether another DeepSeek call is
actually needed. This is the main token-saving loop memory.

`correction_queue.json` stores quote mismatches, wrong-branch candidates,
lineage issues and unsupported SOP steps for retry/review. Retried items still
remain `machine_candidate`.

Remote seed/index is intentionally a second explicit flag:

```bash
node scripts/run_case_fruit_growth_loop.js --execute-safe --include-remote
```

That can run the existing Supabase/Qdrant seed/index commands only if the
preflight says the bail rung is allowed.

Validate the loop itself:

```bash
node scripts/validate_case_fruit_growth_loop.js
```

## Correction Loop

Rejected or suspicious items go to the correction queue categories:

- `quote_not_found`
- `paragraph_not_found`
- `unknown_doctrine_node`
- `wrong_branch_candidate`
- `forbidden_issue_family_leakage`
- `party_argument_mislabelled_as_holding`
- `lineage_or_later_case_missing`
- `duplicate_or_stale_source`
- `retrieval_miss_on_golden_query`
- `unsupported_sop_step`

Machine retries are capped. Retried material still cannot become answer-safe
without human review.

## SOP Contribution

A case fruit can contribute to SOP output only through a retrieval bundle and
source fingerprint:

```text
retrieval_bundles
legal_answer_snapshots
sop_playbooks
```

If the source fingerprint changes, if a proposition is rejected, or if the
support remains research-only, the cached SOP must be recomputed or downgraded.

Build a no-LLM SOP bridge from a recalled doctrine branch:

```bash
node scripts/build_case_fruit_sop_bridge.js \
  --node-id criminal_procedure_hk.bail_factors
```

This creates:

- a retrieval bundle record;
- an answer snapshot record;
- a draft SOP playbook record;
- a source fingerprint tying the SOP to the recalled case fruits.
- a lineage-ranked source trail that prefers higher courts/current treatment.

It does not call DeepSeek or any LLM. It does not promote candidate case fruits
to answer-safe.

To write those records to the existing Supabase cache tables:

```bash
node scripts/build_case_fruit_sop_bridge.js \
  --node-id criminal_procedure_hk.bail_factors \
  --write-cache
```

The cache write remains conservative: candidate-only fruits produce draft /
research-only SOP records, not final legal propositions.

Lineage ranking is deterministic and local. It prefers:

```text
CFA / CA over CFI
ratio / rule statements over background or party arguments
public-source candidates over fixtures
items without later-treatment warnings over limited/corrected items
quote-verified paragraph proof over unsupported text
```

Sorting never changes review status. Candidate-only evidence remains
candidate-only after ranking.

The same bridge is exposed as a read-only API:

```text
GET /api/case-fruit-sop?node_id=criminal_procedure_hk.bail_factors
```

Cache writes are admin-gated:

```text
POST /api/case-fruit-sop?node_id=criminal_procedure_hk.bail_factors&write_cache=1
Authorization: Bearer $LEGAL_REVIEW_ADMIN_TOKEN
```

The API still returns draft / research-only SOP records unless the underlying
case fruits have been human-reviewed and promoted.

## Scale Rule

The loop may grow bail to 20-50 cases with warnings.

It may not run 20k until these gates are green:

```text
production_embeddings_configured
production_reranker_configured
durable_orchestration_configured
bail_gold_review_set_exists
retrieval quality floor
lineage/treatment checks
tenant/private-source controls
```

That is the whole point: grow the law tree by reviewed evidence, not by dumping
raw cases into vectors.
