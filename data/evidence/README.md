# Candidate Evidence Layer

This folder is reserved for generated or reviewed evidence links between the
clean doctrine skeleton and Casemap4 paragraph/proposition evidence.

The visible doctrine tree remains a skeleton:

```text
Domain -> Topic -> Issue -> Principle
```

Cases, paragraphs, statutory sections, and proposition cards should be attached
as evidence records, not inserted directly into the main tree as authoritative
nodes.

## Status Rules

- DeepSeek or any other LLM may only propose `machine_candidate` links.
- Candidate links are always `answer_layer_status = not_answer_safe`.
- A candidate is not legal authority until deterministic validation passes and a
  later review workflow promotes it.
- No paragraph proof means no proposition link.
- No official statutory text/source means no answer-safe legislation link.
- No validated doctrine node ID means no link.

## Promotion Boundary

This repository's candidate-linking scripts do not promote links to
`paragraph_verified`, `human_reviewed`, or `answer_safe`. Promotion requires a
separate review workflow with paragraph/source verification and smoke-test
checks.
