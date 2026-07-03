# Product Quality Repair Report

Generated: 2026-07-02T15:07:06.142Z

**Product quality fixed: YES**

## Claims

- case notes structured and useful: **yes**
- repeated case problem grouped: **yes**
- level2 analysis fact sensitive: **yes**
- sop editing works as demo: **yes**
- fable viewer intact: **yes**
- backend uses case notes and diversity: **yes**
- production branch mergeable: **yes**

## Structured case notes

- Notes: 40 (validation failures: 0)

## Case diversity per tree

| Tree | Distinct cases | Paragraphs | Top case share | Cluster | Needs more |
| --- | --- | --- | --- | --- | --- |
| criminal_public_order.assembly_proportionality | 3 | 20 | 70% | labelled | YES |
| criminal_procedure.bail | 26 | 71 | 10% | - | no |
| criminal_law.theft.dishonesty | 2 | 4 | 50% | labelled | YES |
| criminal_procedure.interview_caution_confession | 1 | 2 | 100% | labelled | YES |
| criminal_procedure.investigation_search | 2 | 7 | 57% | labelled | YES |
| criminal_law.sedition_public_expression | 1 | 8 | 100% | labelled | YES |
| civil_procedure.abuse_process_pleadings | 5 | 5 | 20% | - | no |

## Level 2 analysis quality

- Overall: PASS · avg 4.85/5
- theft_forgot_to_pay: 4.95/5
- theft_intention_return: 4.73/5
- theft_belonging_another: 4.73/5
- bail_after_theft: 4.95/5
- interview_no_rights: 4.59/5
- peaceful_protest_route: 5/5
- landlord_rent: 5/5

## SOP editing demo

- Status: working_demo
- propose edit modal
- compare versions diff
- approve/reject review queue
- changelog
- authority attachment
- export queue
- localStorage + seeded JSON persistence

## Backend retrieval

- round-robin case diversification (repeat paragraphs from one case rank after distinct authorities)
- appellate/leading cases (CFA/CA) ranked first
- leading_case_cluster flag when one case exceeds 40% of retrieved paragraphs
- structured case notes attached to every evidence item and passed to the answer composer
- retrieval metadata: issue_tag, sub_issue_tag, authority_role, case_level, paragraph_role, leading_case_cluster, diversity_rank, application_relevance_score
- case-grouped authorities exposed via case_authorities on /api/search-evidence and /api/doctrine-evidence
- structured research memo (research_memo) on /api/search-evidence

## Production branch

- `pr6-production-release` @ 093a033 (based on current origin/main: yes)

## Remaining limitations

- Material facts / procedural posture / obiter fields are only filled where the verified proof paragraphs support them; other cases carry structured unknown_or_unextracted markers pending full-judgment ingestion.
- Several trees remain below the 5-distinct-case target (see weak_trees_needing_authorities); single-authority trees are displayed as labelled leading-case clusters, not fake breadth.
- later_treatment/current_treatment_status is unchecked for all cases (no citator integration yet).
- Analysis-quality scoring is deterministic/heuristic; an LLM-judge pass is a future upgrade.
- Lawyer review / answer-safe certification remains a later HITL layer and does not gate research retrieval.

