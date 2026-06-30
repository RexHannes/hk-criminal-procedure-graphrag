# Legal Model Training Dry-Run Configs

This directory contains example LoRA/QLoRA configuration files only. This PR does not train a model, commit weights, start a job, call model APIs, or include secrets.

The intended future use is a small extraction/analysis model trained on verified public source-proofed examples. The model must remain behind retrieval and verification. It must not be used as a source of truth or as final legal advice.

## Included Examples

- `lora_config_7b.example.yaml`
- `qlora_config_14b.example.yaml`

## Boundaries

- Base model values are placeholders.
- Dataset paths point to committed JSONL exports.
- Output directories are local placeholders and must not be committed if they contain weights.
- No live training runs in CI.
- No API keys or secrets.
- No private/licensed/client source text.
- No answer-safe promotion.

Before any real LoRA pilot, the dataset report recommends at least 500 verified public cases and 5,000 verified task examples with source proof and quote support at 1.0.
