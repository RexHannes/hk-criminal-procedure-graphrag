# NotebookLM Export Contract For Forms

NotebookLM is cross-check metadata only. It is not a runtime engine, not public authority, not a form activator, and not a replacement for lawyer review.

Export NotebookLM outputs into:

```text
private_notebooklm_notes/
```

Supported filenames:

```text
family_service.md
family_answer.md
family_children.md
family_ancillary_relief.md
company_winding_up.md
pi_forms.md
contract_commercial.md
probate.md
```

These files are gitignored. Do not commit raw private form text, book excerpts, or copied NotebookLM passages containing private source text. The committed repo may contain only sanitized expectation metadata and reports.

## Required Front Matter

Each note should start with YAML front matter:

```yaml
---
note_type: form_usage_note
lane: company_winding_up
provenance: INTERNAL_USAGE_NOTE
source_notebook: atkin_forms
exported_at: 2026-07-07
---
```

For textbook scenario notes, use:

```yaml
---
note_type: scenario_expectation
lane: company_winding_up
provenance: INTERNAL_USAGE_NOTE
source_notebook: textbook_scenarios
exported_at: 2026-07-07
---
```

## Form Usage Note Shape

For each form/document family, include:

```markdown
## Form Usage

- lane:
- form_document_intent:
- workflow_stage:
- use_when:
  - ...
- do_not_use_when:
  - ...
- missing_facts:
  - ...
- required_evidence:
  - ...
- wrong_stage_blockers:
  - ...
- alternative_forms:
  - ...
- draftability_status: draftable | placeholder_only | blocked | lawyer_only
- expected_scenarios:
  - scenario_id:
    facts:
    expected_recommended_forms:
    expected_blocked_forms:
    expected_timeline_tasks:
- source_references:
  - reference_label:
    source_type: notebook_internal_reference | public_rule_reference | private_source_reference
    citation_or_pointer:
```

## Scenario Expectation Shape

For scenario/procedural trap outputs, include:

```markdown
## Scenario Expectation

- scenario_id:
- lane:
- workflow_stage:
- client_role:
- matter_type:
- facts:
  key: value
- expected_recommended_forms:
  - ...
- expected_blocked_forms:
  - ...
- expected_placeholder_only_forms:
  - ...
- expected_missing_facts:
  - ...
- expected_required_evidence:
  - ...
- expected_timeline_tasks:
  - ...
- procedural_traps:
  - if already X, do not use Y
- source_references:
  - reference_label:
    source_type:
    citation_or_pointer:
```

## Hard Rules

- `provenance` must be `INTERNAL_USAGE_NOTE`.
- NotebookLM notes do not activate templates.
- NotebookLM notes do not override review gates.
- NotebookLM notes are not public authority.
- NotebookLM notes must not contain raw private form text.
- Mismatches become reports or review queue items, not automatic fixes.

## Suggested NotebookLM Prompt

```text
For the selected practice lane, produce a metadata-only form usage map.
Do not quote private form text. Do not reproduce clauses. For each form family,
provide lane, document intent, workflow stage, use-when, do-not-use-when,
missing facts, required evidence, wrong-stage blockers, alternative forms,
draftability status, expected scenarios, expected recommended forms,
expected blocked forms, expected timeline tasks, and source references if
available. Mark all output as INTERNAL_USAGE_NOTE and do not state that any
template is approved.
```
