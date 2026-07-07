# Form Clause Usage Rules

Clause snippets are reusable drafting units. Each clause has usage conditions, blockers, alternatives, field requirements, and provenance.

## Rule Types

- USE_WHEN: facts and stage make the clause appropriate.
- DO_NOT_USE_WHEN: facts or stage make the clause inappropriate.
- REQUIRE_FACT: the clause cannot be finalised until facts are supplied.
- REQUIRE_STAGE: the clause belongs only to a specified workflow stage.
- BLOCK_IF_STAGE_PASSED: the clause/document is obsolete after a stage has passed.
- BLOCK_IF_OPPONENT_UNKNOWN: final demand/claim correspondence cannot be sent if the opponent is unknown.
- BLOCK_IF_EVIDENCE_MISSING: quantum or evidential clauses remain placeholders until supporting evidence exists.
- REQUIRE_LAWYER_DECISION: the system may surface the clause but not finalise it.
- ALTERNATIVE_TO: points to a safer alternative clause or document.

## Clause Application

The drafting engine applies allowed clauses, leaves placeholders for missing required facts, and records blocked clauses in the draft report. A blocked clause is not deleted; it is visible for lawyer review with the reason.

## Provenance

Clauses extracted from private templates are TEMPLATE_BASED. Usage notes are INTERNAL_USAGE_NOTE. Lawyer amendments can add LAWYER_APPROVED metadata.
