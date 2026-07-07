# Forms As Code Snippets Architecture

This layer treats private legal forms, precedents, clauses, checklists, and NotebookLM usage notes as typed workflow components rather than as a blind document RAG corpus.

## Why Blind Form RAG Is Dangerous

Blind retrieval can suggest a document at the wrong procedural stage, reuse clauses without the required facts, expose licensed/private text, or blend private templates with public legal authority. A similar-looking form is not necessarily a legally usable form. The system therefore requires structured filters before keyword/vector retrieval.

## Knowledge Layers

1. Public authority: HKLII, LegalRef, e-Legislation, court and public procedural materials. These support SOURCE_BACKED propositions only.
2. Private precedent/form layer: firm forms, precedents, court-form packs, pleadings, letters, checklists, and clause snippets. These support TEMPLATE_BASED drafting.
3. NotebookLM/internal-note layer: usage notes, human summaries, and candidate classifications. These are labelled INTERNAL_USAGE_NOTE and never become legal authority.

## Component Model

A private upload becomes a FormPack. Each document becomes one or more FormTemplate records. Each template is segmented into ClauseSnippet records with field requirements and usage rules. ClauseUsageRule records encode when a clause is recommended, blocked, or requires a missing fact/evidence task. ProceduralGate records block wrong-stage or contraindicated uses.

## Retrieval Flow

Matter facts are normalised into practice area, matter type, role, workflow stage, proceedings status, opponent identity, and evidence availability. The retriever first applies structured filters. Keyword/vector scoring is only used inside the already-eligible candidate set. Vector similarity alone cannot retrieve a form.

## Drafting Flow

When a template applies, the drafting engine maps known facts into fields, leaves placeholders for missing facts, creates questions/evidence tasks, and blocks final approval when required facts are missing. It does not invent missing facts.

## Lawyer Feedback Loop

Lawyers can approve, reject, or amend template classifications, clause rules, and SOP mappings. Approved changes feed back into the private form store as FIRM_SOP or LAWYER_APPROVED metadata while preserving the original private source trail.
