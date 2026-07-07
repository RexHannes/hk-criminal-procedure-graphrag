# Form Routing And Stage Gates

Form routing is a staged eligibility process. Structured gates run before search scoring.

## Routing Inputs

Matter facts, workflow stage, document intent, client role, proceedings status, opponent identity, evidence availability, limitation/deadline status, court/procedure track, firm, workspace, and template review status.

## Gate Examples

- If matter.proceedingsCommenced = true, block WRIT and other commencement forms.
- If opponentIdentified = false, block finalisation of LETTER_OF_CLAIM and suggest opponent-identification tasks.
- If medical evidence is missing, allow draft placeholders but block quantum finalisation and unsupported special damages.

## Output

The routing engine returns recommended forms, blocked forms, alternatives, missing facts, required evidence, allowed clauses, blocked clauses, NotebookLM notes, and provenance labels.

## Review Loop

Lawyer corrections update procedural gates, routing rules, and template classifications. The system keeps rejected/blocked suggestions in reports for audit instead of silently hiding them.
