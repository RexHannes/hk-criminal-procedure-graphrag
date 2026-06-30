# HK Legal Model Training Plan

## Purpose

This follow-up PR prepares training and evaluation infrastructure for a future HK legal extraction model. It does not fine-tune a model, call teacher-model APIs in CI, add secrets, scale the corpus, add new legal verticals, or promote anything to `answer_safe`.

The product principle is simple:

- Model weights learn extraction and analysis behaviour.
- The case-law corpus remains the source of truth.
- The verifier is the truth gate.
- The renderer turns verified records into lawyer-readable memos.
- The product does not give final legal advice.

The model should learn how to assist with legal research tasks, not memorise all HK law. The verified database must remain authoritative.

## Architecture

### Model Weights

The future model should learn repeatable skills:

- issue tagging;
- paragraph-to-proposition extraction;
- proposition-to-principle drafting;
- liability, sentencing, procedure and background classification;
- demotion reason prediction;
- case digest drafting;
- retrieved-authorities-to-research-memo drafting;
- abstention outside supported domains.

The model must not be treated as an authority source.

### Case-Law Corpus

The case-law corpus remains the source of truth. For this pilot, the source corpus is the frozen PR #6 targeted 120-case criminal-law sample with public paragraph cards, proposition cards, principle cards, digest cards, issue maps, usable/demoted principle filtering and research-only demo outputs.

### Verifier

The verifier decides what may enter the training set. A record may enter verified SFT/evaluation assets only if it is public, quote-backed, paragraph-linked and schema-clean. Teacher prose alone is never enough.

### Renderer

The renderer produces lawyer-readable research memos from retrieved verified authorities. It must preserve:

- public source URLs;
- exact paragraph anchors;
- exact quote support;
- `answer_safe=false`;
- lawyer-review-required boundaries;
- unsupported-query abstention.

## Hard Boundaries

- No final legal advice.
- No answer-safe promotion.
- No training on unverified teacher prose.
- No private, licensed or client source leakage.
- No `case_recall_only` authority in training examples.
- No live DeepSeek, OpenAI, Claude or other teacher-model calls in CI.
- No committed model weights or large binary artifacts.

DeepSeek, NotebookLM, Claude, GPT and manual notes may only produce teacher candidates. They are not legal authority. Only HKLII, LegalRef or Judiciary paragraph-verified, quote-backed outputs may enter the verified training set.

## Staged Roadmap

### Stage 0: PR #6 Frozen Demo

Freeze the source-proofed, research-only HK criminal-law demo over the targeted 120-case L1-L3.5 sample. Keep it stable for boss/VC review.

### Stage 1: Export Verified Cards To SFT/Eval JSONL

Export paragraph-to-proposition, proposition-to-principle, demotion-classifier and retrieved-authorities-to-memo examples from verified PR #6 artifacts.

### Stage 2: Teacher-Candidate Ingestion And Verification

Accept teacher candidates from DeepSeek, NotebookLM, Claude, GPT or manual analysis only as candidate records. Convert them to a verification queue and require public paragraph verification before any SFT use.

### Stage 3: 500-Case Verified Corpus

Scale only after the review gates remain green: source proof, quote support, unsupported abstention, zero wrong-domain leakage and demotion filtering.

### Stage 4: LoRA/QLoRA Pilot On 7B/14B Model

Run a dry-run or local/private training experiment only after enough verified examples exist. This repository stores example configs only, not weights.

### Stage 5: Model Used Only Behind Verifier/Retriever

The trained model should sit behind source retrieval and verification. It may draft extractions or memos, but verified source cards remain mandatory.

### Stage 6: Larger Model Only After Traction

Consider larger models only after the product shows reliable retrieval, verification, review workflows and user traction.

## Minimum Before LoRA

Recommended minimum before a real LoRA pilot:

- at least 500 verified public cases;
- at least 5,000 verified extraction examples across tasks;
- meaningful coverage across liability, sentencing, procedure and abstention;
- zero private-source leakage;
- source-proof and quote-support rates at 1.0 in the dataset validator;
- clear held-out evaluation prompts.
