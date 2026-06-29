#!/usr/bin/env node
/* Generate L1-L3.5 case-corpus demo outputs from the real API handler. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "artifacts", "demo_outputs");

const REQUESTS = [
  {
    file: "theft_case_corpus_l35_answer",
    title: "Theft L1-L3.5 Case-Corpus Research Memo",
    request: {
      query: "If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me, what are the AR/MR issues and what facts help or hurt?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.dishonesty",
      max_cases: 8,
      max_paragraphs: 12,
      evidence_text: "CCTV transcript: customer picked up chocolate, kept it visible in hand, paid for a drink at checkout, received a phone call, walked out still holding chocolate, security stopped him outside, he immediately offered to pay.",
    },
    writeJson: true,
  },
  {
    file: "probate_case_corpus_l35_answer",
    title: "Probate L1-L3.5 Case-Corpus Boundary Memo",
    request: {
      query: "If my father dies in US and does not have will, now left a son, a daughter and 2 granddaughters; one is 18 and the other is not, what happens?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "probate.intestacy",
      max_cases: 3,
      max_paragraphs: 4,
    },
  },
  {
    file: "unsupported_general_query_l35_answer",
    title: "Unsupported General Query L1-L3.5 Boundary Memo",
    request: {
      query: "Can my landlord increase rent for my Hong Kong flat next month?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      max_cases: 3,
      max_paragraphs: 4,
    },
  },
  {
    file: "theft_dishonesty_research_memo",
    title: "Theft Dishonesty Research Memo",
    request: {
      query: "What Hong Kong theft dishonesty cases should I research where the issue is whether the accused acted dishonestly?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.dishonesty",
      max_cases: 8,
      max_paragraphs: 12,
    },
  },
  {
    file: "forgot_to_pay_with_evidence_text",
    title: "Forgot To Pay With Evidence Text",
    request: {
      query: "I forgot to pay at a shop and security stopped me. What mens rea and dishonesty case-law research helps or hurts?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.dishonesty",
      max_cases: 8,
      max_paragraphs: 12,
      evidence_text: "CCTV transcript: customer picked up chocolate, kept it visible in hand, paid for a drink at checkout, received a phone call, walked out still holding chocolate, security stopped him outside, and immediately offered to pay.",
    },
  },
  {
    file: "theft_sentencing_boundary",
    title: "Theft Sentencing Boundary",
    request: {
      query: "What theft sentencing cases are useful, and why should they not be used as liability rules?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.sentencing",
      max_cases: 8,
      max_paragraphs: 12,
    },
  },
  {
    file: "intention_permanently_deprive_research_memo",
    title: "Intention Permanently To Deprive Research Memo",
    request: {
      query: "For Hong Kong theft, what cases discuss intention permanently to deprive, especially where the accused says the property would be returned?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.intention_permanently_deprive",
      max_cases: 8,
      max_paragraphs: 12,
    },
  },
  {
    file: "belonging_to_another_research_memo",
    title: "Belonging To Another Research Memo",
    request: {
      query: "For Hong Kong theft, what cases discuss whether property belonged to another, and how should that element be applied to facts?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.theft.belonging_to_another",
      max_cases: 8,
      max_paragraphs: 12,
    },
  },
  {
    file: "fraud_dishonesty_boundary",
    title: "Fraud Dishonesty Boundary",
    request: {
      query: "Fraud and deception dishonesty cases: what research authorities are in the sample, and what is the boundary against theft liability?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      issue_id: "criminal_law.fraud",
      max_cases: 8,
      max_paragraphs: 12,
    },
  },
  {
    file: "unsupported_landlord_query",
    title: "Unsupported Landlord Query",
    request: {
      query: "Can my landlord increase rent for my Hong Kong flat next month?",
      use_case_corpus: true,
      case_corpus_mode: "sample",
      max_cases: 3,
      max_paragraphs: 4,
    },
  },
];

function run(body) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", body };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(`HTTP ${this.statusCode}: ${JSON.stringify(payload)}`));
        else resolve(payload);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function markdown(title, request, payload) {
  return [
    `# ${title}`,
    "",
    "## Product Mode",
    "",
    `- Mode: \`${payload.product_mode?.mode || "unknown"}\``,
    `- Answer safe: \`${payload.product_mode?.answer_safe === true ? "true" : "false"}\``,
    `- Lawyer review required: \`${payload.product_mode?.needs_lawyer_review === true ? "true" : "false"}\``,
    "",
    "## Case-Corpus Research",
    "",
    String(payload.case_law_research?.markdown || "No case-corpus memo returned.").trim(),
    "",
    "## Full Answer Markdown",
    "",
    String(payload.answer_markdown || "").trim(),
    "",
    "## Request",
    "",
    "```json",
    JSON.stringify(request, null, 2),
    "```",
    "",
  ].join("\n");
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const demo of REQUESTS) {
    const payload = await run(demo.request);
    fs.writeFileSync(path.join(OUT_DIR, `${demo.file}.md`), `${markdown(demo.title, demo.request, payload)}\n`, "utf8");
    if (demo.writeJson) {
      fs.writeFileSync(path.join(OUT_DIR, `${demo.file}.json`), `${JSON.stringify({
        query: payload.query,
        product_mode: payload.product_mode,
        case_law_research: payload.case_law_research,
        audit_trail: {
          case_corpus_audit: payload.audit_trail?.case_corpus_audit,
          paragraph_proof_audit: payload.audit_trail?.paragraph_proof_audit,
        },
      }, null, 2)}\n`, "utf8");
    }
  }
  console.log(`Generated ${REQUESTS.length} L1-L3.5 demo output(s).`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
