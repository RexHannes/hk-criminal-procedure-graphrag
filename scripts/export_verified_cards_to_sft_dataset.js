#!/usr/bin/env node
/* Export verified PR #6 cards into legal-model SFT/eval JSONL assets. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const OUT_DIR = path.join(ROOT, "data", "legal_model_training", "sft");
const CORPUS_DIR = path.join(ROOT, "data", "legal_ingest", "case_corpus");
const DEMO_DIR = path.join(ROOT, "artifacts", "demo_outputs");
const GENERATED_AT = "2026-06-30T00:00:00.000Z";

const OUTPUTS = {
  paragraph_to_proposition: {
    train: "paragraph_to_proposition_train.jsonl",
    eval: "paragraph_to_proposition_eval.jsonl",
  },
  proposition_to_principle: {
    train: "proposition_to_principle_train.jsonl",
    eval: "proposition_to_principle_eval.jsonl",
  },
  demotion_classifier: {
    train: "demotion_classifier_train.jsonl",
    eval: "demotion_classifier_eval.jsonl",
  },
  retrieved_authorities_to_memo: {
    train: "retrieved_authorities_to_memo_train.jsonl",
    eval: "retrieved_authorities_to_memo_eval.jsonl",
  },
};

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map(JSON.parse);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function countJsonl(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, "utf8").trim();
  return text ? text.split(/\n+/).filter(Boolean).length : 0;
}

function by(items, key) {
  return new Map(items.map(item => [item[key], item]));
}

function publicSourceUrl(url = "") {
  return /^https:\/\/(www\.)?(hklii|legalref|judiciary)\./i.test(url);
}

function splitFor(index) {
  return index % 5 === 0 ? "eval" : "train";
}

function commonFields({
  task,
  split,
  sourceObjectIds,
  paragraph,
  proposition,
  principle,
  exactQuote,
  issueTags,
  usable,
  demotionReasons,
}) {
  const source = principle || proposition || paragraph || {};
  return {
    task,
    split,
    source_object_ids: sourceObjectIds.filter(Boolean),
    case_id: source.case_id || paragraph?.case_id || "",
    case_name: source.case_name || paragraph?.case_name || "",
    citation: source.neutral_citation || paragraph?.neutral_citation || "",
    court: source.court || paragraph?.court || "",
    judgment_date: source.judgment_date || paragraph?.judgment_date || "",
    paragraph_ids: paragraph ? [paragraph.paragraph_id] : [],
    source_urls: paragraph?.source_url ? [paragraph.source_url] : [],
    exact_quote_support: exactQuote || "",
    issue_tags: issueTags || source.issue_tags || paragraph?.issue_tags_candidate || [],
    answer_layer_status: "research_only",
    review_status: source.review_status || "machine_candidate",
    usable_in_answer_layer: Boolean(usable),
    demotion_reasons: demotionReasons || [],
    answer_safe: false,
    provenance: {
      source: "pr6_verified_public_case_corpus",
      teacher_candidate: false,
      verification_status: source.verification_status || paragraph?.verification_status || "source_verified_public",
    },
  };
}

function propositionHasProof(proposition, paragraphById) {
  if (!proposition || proposition.answer_layer_status !== "research_only") return false;
  const quote = String(proposition.exact_quote_support || "").trim();
  if (quote.length < 8) return false;
  return (proposition.source_paragraph_ids || []).some(id => {
    const paragraph = paragraphById.get(id);
    return paragraph && publicSourceUrl(paragraph.source_url) && paragraph.source_url.includes("#p") && paragraph.paragraph_text.includes(quote);
  });
}

function principleHasProof(principle, propositionById, paragraphById) {
  if (!principle || principle.answer_layer_status !== "research_only") return false;
  const hasParagraph = (principle.source_paragraph_ids || []).some(id => {
    const paragraph = paragraphById.get(id);
    const quote = String(principle.exact_quote_support || "").trim();
    return paragraph && publicSourceUrl(paragraph.source_url) && paragraph.paragraph_text.includes(quote);
  });
  const hasProposition = (principle.source_proposition_ids || []).some(id => propositionHasProof(propositionById.get(id), paragraphById));
  return hasParagraph && hasProposition;
}

function buildParagraphToProposition({ propositions, paragraphById }) {
  const examples = [];
  for (const proposition of propositions) {
    if (!propositionHasProof(proposition, paragraphById)) continue;
    const paragraph = paragraphById.get((proposition.source_paragraph_ids || [])[0]);
    const index = examples.length;
    examples.push({
      example_id: `ptp_${proposition.proposition_id}`,
      ...commonFields({
        task: "paragraph_to_proposition",
        split: splitFor(index),
        sourceObjectIds: [paragraph.paragraph_id, proposition.proposition_id],
        paragraph,
        proposition,
        exactQuote: proposition.exact_quote_support,
        issueTags: proposition.issue_tags,
        usable: true,
        demotionReasons: [],
      }),
      input: {
        paragraph_text: paragraph.paragraph_text,
        paragraph_id: paragraph.paragraph_id,
        source_url: paragraph.source_url,
      },
      output: {
        proposition_text: proposition.proposition_text,
        legal_function: proposition.legal_function || "",
        authority_role_candidate: proposition.authority_role_candidate || "",
      },
    });
  }
  return examples;
}

function buildPropositionToPrinciple({ principles, propositionById, paragraphById }) {
  const examples = [];
  for (const principle of principles) {
    if (principle.principle_quality_status !== "pass" || principle.usable_in_answer_layer !== true) continue;
    if (!principleHasProof(principle, propositionById, paragraphById)) continue;
    const proposition = propositionById.get((principle.source_proposition_ids || [])[0]);
    const paragraph = paragraphById.get((principle.source_paragraph_ids || [])[0]);
    const index = examples.length;
    examples.push({
      example_id: `ptpr_${principle.principle_id}`,
      ...commonFields({
        task: "proposition_to_principle",
        split: splitFor(index),
        sourceObjectIds: [paragraph.paragraph_id, proposition.proposition_id, principle.principle_id],
        paragraph,
        proposition,
        principle,
        exactQuote: principle.exact_quote_support || proposition.exact_quote_support,
        issueTags: principle.issue_tags,
        usable: true,
        demotionReasons: [],
      }),
      input: {
        proposition_text: proposition.proposition_text,
        exact_quote_support: proposition.exact_quote_support,
        source_paragraph_ids: proposition.source_paragraph_ids || [],
      },
      output: {
        principle_text: principle.principle_text,
        liability_relevance: principle.liability_relevance || "liability",
        limits: principle.limits || "",
        distinguishable_when: principle.distinguishable_when || "",
      },
    });
  }
  return examples;
}

function buildDemotionClassifier({ principles, propositionById, paragraphById }) {
  const examples = [];
  for (const principle of principles) {
    if (!principleHasProof(principle, propositionById, paragraphById)) continue;
    const paragraph = paragraphById.get((principle.source_paragraph_ids || [])[0]);
    const proposition = propositionById.get((principle.source_proposition_ids || [])[0]);
    const index = examples.length;
    const demotionReasons = principle.demotion_reasons || (principle.demotion_reason ? [principle.demotion_reason] : []);
    examples.push({
      example_id: `demotion_${principle.principle_id}`,
      ...commonFields({
        task: "demotion_classifier",
        split: splitFor(index),
        sourceObjectIds: [paragraph.paragraph_id, proposition?.proposition_id, principle.principle_id],
        paragraph,
        proposition,
        principle,
        exactQuote: principle.exact_quote_support || proposition?.exact_quote_support || "",
        issueTags: principle.issue_tags,
        usable: principle.usable_in_answer_layer === true,
        demotionReasons,
      }),
      input: {
        principle_text: principle.principle_text,
        exact_quote_support: principle.exact_quote_support || proposition?.exact_quote_support || "",
        paragraph_text: paragraph.paragraph_text,
        authority_role_candidate: proposition?.authority_role_candidate || "",
      },
      output: {
        principle_quality_status: principle.principle_quality_status || "needs_review",
        liability_relevance: principle.liability_relevance || "background",
        usable_in_answer_layer: principle.usable_in_answer_layer === true,
        demotion_reasons: demotionReasons,
      },
    });
  }
  return examples;
}

function firstParagraphFromUrls(urls, paragraphByUrl) {
  for (const url of urls) {
    const paragraph = paragraphByUrl.get(url);
    if (paragraph) return paragraph;
  }
  return null;
}

function buildMemoExamples({ paragraphByUrl }) {
  const queryPackPath = path.join(DEMO_DIR, "demo_query_pack.json");
  const pack = fs.existsSync(queryPackPath) ? JSON.parse(fs.readFileSync(queryPackPath, "utf8")) : { queries: [] };
  const memoFiles = {
    A: "theft_dishonesty_research_memo.md",
    B: "intention_permanently_deprive_research_memo.md",
    C: "belonging_to_another_research_memo.md",
    E: "unsupported_landlord_query.md",
  };
  const examples = [];
  for (const query of pack.queries || []) {
    const fileName = memoFiles[query.id];
    if (!fileName) continue;
    const memoPath = path.join(DEMO_DIR, fileName);
    if (!fs.existsSync(memoPath)) continue;
    const memo = fs.readFileSync(memoPath, "utf8");
    const urls = Array.from(new Set(Array.from(memo.matchAll(/https:\/\/www\.hklii\.hk\/en\/cases\/[^\s)]+#p\d+/g)).map(match => match[0])));
    const paragraph = firstParagraphFromUrls(urls, paragraphByUrl);
    const unsupported = query.should_abstain === true;
    const index = examples.length;
    examples.push({
      example_id: `memo_${query.id.toLowerCase()}`,
      task: "retrieved_authorities_to_memo",
      split: splitFor(index),
      source_object_ids: unsupported ? [] : urls.map(url => paragraphByUrl.get(url)?.paragraph_id).filter(Boolean),
      case_id: unsupported ? "" : paragraph?.case_id || "",
      case_name: unsupported ? "" : paragraph?.case_name || "",
      citation: unsupported ? "" : paragraph?.neutral_citation || "",
      court: unsupported ? "" : paragraph?.court || "",
      judgment_date: unsupported ? "" : paragraph?.judgment_date || "",
      paragraph_ids: unsupported ? [] : urls.map(url => paragraphByUrl.get(url)?.paragraph_id).filter(Boolean),
      source_urls: unsupported ? [] : urls,
      exact_quote_support: unsupported ? "" : "See cited exact quotes in memo output.",
      issue_tags: query.expected_issue_id ? [query.expected_issue_id] : [],
      answer_layer_status: unsupported ? "unsupported_abstention" : "research_only",
      review_status: "lawyer_review_required",
      usable_in_answer_layer: !unsupported,
      demotion_reasons: [],
      answer_safe: false,
      input: {
        query: query.query,
        retrieved_authorities: unsupported ? [] : urls.map(url => ({ source_url: url })),
        expected_abstention: unsupported,
      },
      output: {
        memo_markdown: memo,
        supported_legal_answer: !unsupported,
        answer_safe: false,
      },
      provenance: {
        source: "pr6_demo_outputs",
        teacher_candidate: false,
        verification_status: unsupported ? "unsupported_domain_abstention" : "paragraph_quote_verified_research_only",
      },
    });
  }
  return examples;
}

function splitExamples(examples) {
  return {
    train: examples.filter(example => example.split === "train"),
    eval: examples.filter(example => example.split === "eval"),
  };
}

function build() {
  const paragraphs = readJsonl(path.join(CORPUS_DIR, "paragraph_cards_sample_100.jsonl"));
  const propositions = readJsonl(path.join(CORPUS_DIR, "proposition_cards_sample_100.jsonl"));
  const principles = readJsonl(path.join(CORPUS_DIR, "principle_cards_sample_100.jsonl"));
  readJsonl(path.join(CORPUS_DIR, "case_digest_cards_sample_100.jsonl"));
  readJsonl(path.join(CORPUS_DIR, "issue_case_map_sample_100.jsonl"));
  const paragraphById = by(paragraphs, "paragraph_id");
  const paragraphByUrl = by(paragraphs, "source_url");
  const propositionById = by(propositions, "proposition_id");

  const datasets = {
    paragraph_to_proposition: buildParagraphToProposition({ propositions, paragraphById }),
    proposition_to_principle: buildPropositionToPrinciple({ principles, propositionById, paragraphById }),
    demotion_classifier: buildDemotionClassifier({ principles, propositionById, paragraphById }),
    retrieved_authorities_to_memo: buildMemoExamples({ paragraphByUrl }),
  };

  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    script: "export_verified_cards_to_sft_dataset",
    generated_at: GENERATED_AT,
    dry_run: DRY_RUN,
    outputs: {},
    stale_outputs: [],
    status: "passed",
  };

  for (const [task, examples] of Object.entries(datasets)) {
    const split = splitExamples(examples);
    summary.outputs[task] = {
      train: split.train.length,
      eval: split.eval.length,
      total: examples.length,
    };
    if (!DRY_RUN) {
      writeJsonl(path.join(OUT_DIR, OUTPUTS[task].train), split.train);
      writeJsonl(path.join(OUT_DIR, OUTPUTS[task].eval), split.eval);
    } else {
      const trainPath = path.join(OUT_DIR, OUTPUTS[task].train);
      const evalPath = path.join(OUT_DIR, OUTPUTS[task].eval);
      const committedTrain = countJsonl(trainPath);
      const committedEval = countJsonl(evalPath);
      if (committedTrain !== split.train.length) {
        summary.stale_outputs.push({
          file: path.relative(ROOT, trainPath),
          expected: split.train.length,
          committed: committedTrain,
        });
      }
      if (committedEval !== split.eval.length) {
        summary.stale_outputs.push({
          file: path.relative(ROOT, evalPath),
          expected: split.eval.length,
          committed: committedEval,
        });
      }
    }
  }
  if (summary.stale_outputs.length) summary.status = "failed";
  return summary;
}

const summary = build();
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== "passed") process.exit(1);
