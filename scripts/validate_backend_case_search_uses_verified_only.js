#!/usr/bin/env node
/* Smoke-test /api/search-evidence for verified-only authority behavior. */

const handler = require("../api/search-evidence.js");
const {
  extractAuthorityItemsFromSearchPayload,
  hasVerifiedPublicParagraphAuthority,
} = require("../src/case_graph/verified_case_authority");

const errors = [];

function fail(message) {
  errors.push(message);
}

function localPost(query) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", body: { query } };
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

async function checkSupported(query, expectedCasePattern, expectedUrlPattern) {
  const payload = await localPost(query);
  const { fromMatches, fromAnalysis } = extractAuthorityItemsFromSearchPayload(payload);
  if (!fromMatches.length) fail(`${query}: backend returned no matched evidence`);
  for (const item of fromMatches) {
    if (!hasVerifiedPublicParagraphAuthority(item)) fail(`${query}: matched evidence lacks public paragraph proof (${item.case_name || item.source_url})`);
  }
  if (fromAnalysis.length) {
    for (const item of fromAnalysis) {
      if (!hasVerifiedPublicParagraphAuthority(item)) fail(`${query}: analysis case reference lacks public paragraph proof (${item.case_name || item.source_url})`);
    }
  }
  const combined = JSON.stringify(payload);
  if (expectedCasePattern && !expectedCasePattern.test(combined)) fail(`${query}: expected case pattern not found`);
  if (expectedUrlPattern && !expectedUrlPattern.test(combined)) fail(`${query}: expected source URL pattern not found`);
  if (payload.inquiry_analysis?.abstain === true) fail(`${query}: supported query abstained despite paragraph-linked evidence`);
}

async function checkUnsupported(query) {
  const payload = await localPost(query);
  if (payload.evidence_count !== 0) fail(`${query}: unsupported query returned evidence_count=${payload.evidence_count}`);
  if ((payload.matched_doctrine_nodes || []).length !== 0) fail(`${query}: unsupported query returned matched doctrine nodes`);
  if (payload.inquiry_analysis?.abstain !== true) fail(`${query}: unsupported query did not abstain`);
}

(async () => {
  await checkSupported(
    "HKSAR v Leung Kwok Hung [2005] 3 HKLRD 164",
    /Leung Kwok Hung and Others v HKSAR/,
    /DIS=45653.*#p17/
  );
  await checkSupported(
    "Lam Tat Ming detention after arrest confession",
    /Secretary for Justice v Lam Tat Ming and Another/,
    /DIS=33993.*#p24/
  );
  await checkSupported(
    "The police interviewed me without explaining my rights. What issues matter?",
    /Lam Tat Ming/,
    /DIS=33993.*#p24/
  );
  await checkUnsupported("My landlord increased my rent. What should I do?");

  if (errors.length) {
    console.error("Backend verified-only search validation failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("Backend search uses verified public paragraph evidence only.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
