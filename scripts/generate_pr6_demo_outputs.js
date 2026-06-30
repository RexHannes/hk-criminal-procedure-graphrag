#!/usr/bin/env node
/* Generate boss-demo memo outputs from the real answer-first API handler. */

const fs = require("fs");
const path = require("path");
const handler = require("../api/search-evidence.js");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "artifacts", "demo_outputs");

const DEMOS = [
  {
    id: "demo-a-theft-no-evidence",
    title: "Demo A - Theft / Shoplifting Without Uploaded Evidence",
    request: {
      query: "If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me, what are the AR/MR issues and what facts help or hurt?",
    },
  },
  {
    id: "demo-b-theft-with-evidence-text",
    title: "Demo B - Theft / Shoplifting With Uploaded Text Evidence",
    request: {
      query: "If I am alleged to be stealing something in the convenience store, but I forgot to pay and security stopped me, what are the AR/MR issues and what facts help or hurt?",
      evidence_text: "CCTV transcript: customer picked up chocolate, kept it visible in hand, paid for a drink at checkout, received a phone call, walked out still holding chocolate, security stopped him outside, he immediately offered to pay.",
    },
  },
  {
    id: "demo-c-unsupported-landlord-rent",
    title: "Demo C - Unsupported General Landlord / Rent Query",
    request: {
      query: "Can my landlord increase rent for my Hong Kong flat next month?",
    },
  },
];

function runHandler(body) {
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

function yamlSafe(value) {
  return JSON.stringify(value);
}

function buildMarkdown(demo, payload) {
  const evidenceSummary = payload.evidence_ingest_summary || {};
  return [
    "---",
    `demo_id: ${yamlSafe(demo.id)}`,
    `title: ${yamlSafe(demo.title)}`,
    `product_mode: ${yamlSafe(payload.product_mode?.mode || "")}`,
    `answer_mode: ${yamlSafe(payload.product_mode?.answer_mode || "research_prototype")}`,
    `lawyer_review_status: ${yamlSafe(payload.product_mode?.lawyer_review_status || "unreviewed")}`,
    `professional_advice_certified: ${payload.product_mode?.professional_advice_certified === true ? "true" : "false"}`,
    `uploaded_evidence_ingested: ${evidenceSummary.uploaded_evidence_ingested === true ? "true" : "false"}`,
    `evidence_status: ${yamlSafe(evidenceSummary.status || "no_uploaded_evidence")}`,
    "---",
    "",
    `# ${demo.title}`,
    "",
    "## Request",
    "",
    "```json",
    JSON.stringify(demo.request, null, 2),
    "```",
    "",
    "## Product Mode",
    "",
    `- Mode: \`${payload.product_mode?.mode || "unknown"}\``,
    `- Answer mode: \`${payload.product_mode?.answer_mode || "research_prototype"}\``,
    `- Professional advice certified: \`${payload.product_mode?.professional_advice_certified === true ? "true" : "false"}\``,
    `- HITL certification status: \`${payload.product_mode?.lawyer_review_status || "unreviewed"}\``,
    `- Uploaded evidence mode: \`${payload.product_mode?.uploaded_evidence_mode || "no_uploaded_evidence_parsed"}\``,
    "",
    "## Evidence Ingest Summary",
    "",
    `- Status: \`${evidenceSummary.status || "no_uploaded_evidence"}\``,
    `- Uploaded evidence ingested: \`${evidenceSummary.uploaded_evidence_ingested === true ? "true" : "false"}\``,
    `- Text items: \`${evidenceSummary.text_item_count || 0}\``,
    `- Unparsed items: \`${evidenceSummary.unparsed_item_count || 0}\``,
    "",
    "## Legal Memo",
    "",
    String(payload.answer_markdown || "").trim(),
    "",
    "## Audit Boundary",
    "",
    "- Raw graph matches and source-card debug data are audit material, not the demo headline.",
    "- Uploaded text/transcript evidence is fact/evidence material only; it is not legal authority.",
    "- This output is a research prototype. Professional certification is false until a later HITL product step.",
    "",
  ].join("\n");
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = [];
  for (const demo of DEMOS) {
    const payload = await runHandler(demo.request);
    const markdown = buildMarkdown(demo, payload);
    const outPath = path.join(OUT_DIR, `${demo.id}.md`);
    fs.writeFileSync(outPath, markdown, "utf8");
    summary.push({
      id: demo.id,
      title: demo.title,
      output: path.relative(ROOT, outPath),
      product_mode: payload.product_mode?.mode,
      answer_mode: payload.product_mode?.answer_mode || "research_prototype",
      lawyer_review_status: payload.product_mode?.lawyer_review_status || "unreviewed",
      professional_advice_certified: payload.product_mode?.professional_advice_certified === true,
      uploaded_evidence_ingested: payload.evidence_ingest_summary?.uploaded_evidence_ingested === true,
      evidence_status: payload.evidence_ingest_summary?.status || "no_uploaded_evidence",
    });
  }
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify({ demos: summary }, null, 2)}\n`, "utf8");
  console.log(`Generated ${summary.length} PR 6 demo output(s) in ${path.relative(ROOT, OUT_DIR)}.`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
