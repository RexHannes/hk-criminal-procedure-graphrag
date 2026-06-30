#!/usr/bin/env node
/* Smoke-test the deployed public PR #6 demo page. */

const DEFAULT_URL = "https://hk-criminal-procedure-graphrag.vercel.app/viewer/";
const targetUrl = process.env.PUBLIC_DEMO_URL || DEFAULT_URL;
const errors = [];

function fail(message) {
  errors.push(message);
}

async function fetchText(url, required = true) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    if (required) throw new Error(`${url}: HTTP ${response.status}`);
    return "";
  }
  return response.text();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function resolveUrl(base, relativePath) {
  return new URL(relativePath, base).toString();
}

function extractArtifactUrls(pageUrl, html, js) {
  const urls = [
    resolveUrl(pageUrl, "case_corpus_demo.html"),
    resolveUrl(pageUrl, "case_corpus_demo.js"),
    resolveUrl(pageUrl, "../artifacts/demo_freeze_report.json"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/demo_query_pack.json"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/theft_dishonesty_research_memo.md"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/intention_permanently_deprive_research_memo.md"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/belonging_to_another_research_memo.md"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/bail_research_memo.md"),
    resolveUrl(pageUrl, "../artifacts/demo_outputs/unsupported_landlord_query.md"),
  ];

  for (const text of [html, js]) {
    for (const match of text.matchAll(/["'](\.\.\/artifacts\/[^"']+)["']/g)) {
      urls.push(resolveUrl(pageUrl, match[1]));
    }
  }
  return unique(urls);
}

function validateCombinedText(html, combined) {
  const oldOnly = /Verification pending|data\/legal_domain_packs\/demo_maps|Casemap4|window\.DATA_INDEX/.test(html);
  const hasSourceLinks = /https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)\//i.test(combined);
  if (oldOnly && !hasSourceLinks) {
    fail("deployed page appears to show only the old pending graph with no source links");
  }
  if (!/PR #6 verified case-corpus demo|Source-proofed HK criminal-law research demo/i.test(combined)) {
    fail("deployed page does not identify the verified PR #6 case-corpus demo");
  }
  if (!hasSourceLinks) fail("deployed demo has no HKLII/LegalRef links");
  if (!/#p\d+/i.test(combined)) fail("deployed demo has no paragraph #p anchors");
  if (!/Exact quote:/i.test(combined)) fail("deployed demo has no exact quote proof");
  if (!/(answer_safe=false|Answer safe:\s*`false`|Answer safe:\s*false|"expected_answer_safe":\s*false)/i.test(combined)) {
    fail("deployed demo missing answer_safe=false boundary");
  }
  if (!/(lawyer-review-required|Lawyer review required|needs_lawyer_review=true|needs_lawyer_review":\s*true)/i.test(combined)) {
    fail("deployed demo missing lawyer-review-required boundary");
  }
  if (!/(unsupported_general_query|Unsupported Landlord Query|unsupported landlord|landlord\/rent query abstains)/i.test(combined)) {
    fail("deployed demo missing unsupported query demo");
  }
  if (!/(abstain|abstention|No case-by-case authority is attached)/i.test(combined)) {
    fail("deployed demo missing unsupported-query abstention wording");
  }
  if (!/(Demoted principles|demoted principles|demoted_principle_count|247)/i.test(combined)) {
    fail("deployed demo missing demoted-principle boundary");
  }
  if (/(answer_safe:\s*true|Answer safe:\s*`true`|"answer_safe":\s*true)/i.test(combined)) {
    fail("deployed demo must not show answer_safe=true");
  }
}

(async () => {
  const html = await fetchText(targetUrl);
  const parsedTarget = new URL(targetUrl);
  const pageUrl = parsedTarget.pathname.endsWith("/") || parsedTarget.pathname.endsWith(".html")
    ? parsedTarget.toString()
    : `${parsedTarget.toString()}/`;
  const jsUrl = resolveUrl(pageUrl, "case_corpus_demo.js");
  let js = "";
  try {
    js = await fetchText(jsUrl, false);
  } catch (_error) {
    js = "";
  }

  const artifactUrls = extractArtifactUrls(pageUrl, html, js);
  const fetched = [html, js];
  for (const url of artifactUrls) {
    try {
      fetched.push(await fetchText(url, false));
    } catch (_error) {
      fetched.push("");
    }
  }

  validateCombinedText(html, fetched.join("\n"));

  if (errors.length) {
    console.error(`Public Vercel demo smoke failed for ${targetUrl}:`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Public Vercel demo smoke passed for ${targetUrl}.`);
})().catch(error => {
  console.error(`Public Vercel demo smoke failed for ${targetUrl}: ${error.message}`);
  process.exit(1);
});
