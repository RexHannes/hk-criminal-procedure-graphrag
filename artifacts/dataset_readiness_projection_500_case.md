# Dataset Readiness Projection For 500-Case Corpus

Projection only. This branch does not write PR #7 dataset files, run training, or promote answer-safe propositions.

| Metric | Value |
|---|---:|
| Registry cases | 530 |
| Paragraph cards | 1633 |
| Proposition cards | 1633 |
| Usable principles | 623 |
| Demoted principles | 1010 |
| Projected dataset rows | 6091 |
| 1k threshold met | true |
| 5k threshold met | true |

## Projected Tasks

| Task | Rows | Basis |
|---|---:|---|
| paragraph_to_proposition | 1633 | One quote-verified proposition row per verified proposition card. |
| proposition_to_principle | 623 | One usable research-only principle row per pass-quality principle. |
| demotion_classifier | 1010 | One demotion classifier row per demoted principle card, preserving the demotion reason. |
| issue_map_relevance | 2290 | One issue-to-case relevance row per issue map row with paragraph/proposition proof. |
| case_digest_summarization | 530 | One digest summarization row per case digest with paragraph proof. |
| retrieved_authorities_to_memo | 5 | Only the committed local demo/regression query patterns; no synthetic broad legal-advice prompts. |

## Boundary

- No PR #7 files are modified by this projection.
- No model training is run.
- No private/licensed material is used.
- No answer_safe labels are produced.
