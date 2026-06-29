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
      max_cases: 3,
      max_paragraphs: 4,
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
    "## Request",
    "",
    "```json",
    JSON.stringify(request, null, 2),
    "```",
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
