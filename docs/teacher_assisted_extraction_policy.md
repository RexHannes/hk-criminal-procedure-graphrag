# Teacher-Assisted Extraction Policy

## Status Of Teacher Outputs

DeepSeek, NotebookLM, Claude, GPT and manual analysis may help propose issue tags, quotes, propositions, principles, digests and demotion labels. Those outputs are teacher candidates only.

Teacher candidates are not authority. They are not admissible into the answer layer or SFT dataset until they pass public source verification.

## Authority Rule

Only public, paragraph-verified legal sources may support training examples:

- HKLII case paragraphs;
- LegalRef or Judiciary public judgment records where available;
- official public statute or source cards when relevant.

Private textbooks, licensed databases, client documents, AI-generated prose, recall-only cases and unverified candidate text are barred from verified SFT/evaluation assets.

## Candidate Requirements

Every teacher candidate must include:

- teacher tool and model if known;
- case name and citation;
- public source URL;
- candidate paragraph numbers;
- candidate quotes;
- candidate propositions or principles;
- candidate issue tags;
- candidate digest or demotion prediction where applicable;
- `authority_status = candidate_only`;
- `answer_layer_status = not_admissible_until_verified`;
- `answer_safe = false`.

## Verification Gate

A candidate may advance only if the verifier can match it to committed public source material:

- source URL is public and case-specific;
- paragraph numbers resolve to paragraph cards;
- quoted text appears in the paragraph text;
- generated proposition/principle cards link back to source paragraph IDs;
- demoted/background/sentencing-only material is not used as positive liability authority;
- review and answer-layer status remain research-only/lawyer-review-required.

## SFT Admission Rule

Teacher prose must not enter SFT directly. The SFT dataset may include only the verified extraction result and provenance fields showing:

- original teacher tool/model;
- verification status;
- source paragraph IDs;
- exact quote support;
- generated verified card IDs.

## CI Rule

CI may validate schemas, sample candidates, exported verified datasets and offline evaluation fixtures. CI must not call DeepSeek, OpenAI, Claude, NotebookLM or any live model endpoint.

## Product Boundary

The trained model, if later created, must remain a research assistant behind retrieval and verification. It must not be marketed as final legal advice, whole-HK legal RAG, lawyer-reviewed current treatment or answer-safe legal reasoning.
