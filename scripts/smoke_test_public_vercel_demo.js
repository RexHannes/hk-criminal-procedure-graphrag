#!/usr/bin/env node
/* Smoke-test the deployed public PR #6 workspace and verified demo route. */

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

function extractArtifactUrls(demoUrl, html, js) {
  const urls = [
    resolveUrl(demoUrl, "case_corpus_demo.js"),
    resolveUrl(demoUrl, "../artifacts/demo_freeze_report.json"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/demo_query_pack.json"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/theft_dishonesty_research_memo.md"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/intention_permanently_deprive_research_memo.md"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/belonging_to_another_research_memo.md"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/bail_research_memo.md"),
    resolveUrl(demoUrl, "../artifacts/demo_outputs/unsupported_landlord_query.md"),
  ];

  for (const text of [html, js]) {
    for (const match of text.matchAll(/["'](\.\.\/artifacts\/[^"']+)["']/g)) {
      urls.push(resolveUrl(demoUrl, match[1]));
    }
  }
  return unique(urls);
}

function validateWorkspace(html, js = "") {
  const combined = `${html}\n${js}`;
  if (!/Legal Graph-SOP Workspace/i.test(html)) fail("/viewer/ does not show the polished Legal Graph-SOP Workspace");
  if (!/id=["']sidebar["']/i.test(html)) fail("/viewer/ missing sidebar shell");
  if (!/id=["']inspector["']/i.test(html)) fail("/viewer/ missing inspector shell");
  if (!/data-view=["']caseDemo["']/i.test(html)) fail("/viewer/ missing in-workspace Verified Case Demo nav item");
  if (!/Verified Case Demo/i.test(html)) fail("/viewer/ missing visible Verified Case Demo entry");
  if (!/app\.js/i.test(html)) fail("/viewer/ does not load the original workspace app.js");
  if (!/Legacy seed graph - not the verified case-law demo\./i.test(combined)) fail("workspace seed graph views are not labelled");
  if (!/case-demo-native/i.test(combined)) fail("workspace does not render the verified demo as a native module");
  if (!/viewer_evidence_index\.json/i.test(combined)) fail("workspace missing native viewer evidence index loader");
  if (!/viewer_node_evidence_map\.json/i.test(combined)) fail("workspace missing native viewer evidence map loader");
  if (!/viewer_seed_case_public_sources\.json/i.test(combined)) fail("workspace missing seed-case public source loader");
  if (!/Case Fruits \/ Paragraph Proof/i.test(combined)) fail("workspace missing inspector paragraph-proof panel");
  if (!/caseEvidenceInquiryMatches/i.test(combined)) fail("workspace missing native AI Inquiry evidence bridge");
  if (!/Unresolved seed cases excluded from demo/i.test(combined)) fail("workspace missing excluded seed audit boundary");
  if (/case-demo-frame|<iframe/i.test(combined)) fail("workspace must not iframe the verified demo route as the main solution");
  if (/Verification pending|Source check pending|Human review required|Lawyer review required|lawyer-review-required|answer_safe=false|needs_lawyer_review|needs verify|Linked authority/i.test(combined)) {
    fail("workspace still contains old pending-verification authority language");
  }
  if (/caseSeeds\.slice\(|Seed \/ graph references/i.test(combined)) {
    fail("workspace still renders unresolved seed cases as product references");
  }
  if (/Static proof fallback for smoke tests|Source-proofed HK criminal-law research demo/i.test(html)) {
    fail("/viewer/ appears to be the raw verified demo page instead of the workspace");
  }
}

function validateVerifiedDemo(combined, shellText) {
  const hasSourceLinks = /https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)\//i.test(combined);
  if (!/PR #6 verified case-corpus demo|PR #6 verified case demo|Source-proofed HK criminal-law research demo/i.test(combined)) {
    fail("verified route does not identify the PR #6 case-corpus demo");
  }
  if (!hasSourceLinks) fail("verified route has no HKLII/LegalRef links");
  if (!/#p\d+/i.test(combined)) fail("deployed demo has no paragraph #p anchors");
  if (!/(Exact quote:?|exact_quote)/i.test(combined)) fail("deployed demo has no exact quote proof");
  if (!/(Source-linked|Public judgment|Paragraph proof)/i.test(combined)) fail("deployed demo missing clean source-linked labels");
  if (!/(Research prototype|research_prototype)/i.test(combined)) fail("deployed demo missing research prototype label");
  if (!/(professional_advice_certified=false|"professional_advice_certified":\s*false)/i.test(combined)) fail("deployed demo missing quiet professional certification metadata");
  if (!/(unsupported_general_query|Unsupported Landlord Query|unsupported landlord|landlord\/rent query abstains)/i.test(combined)) {
    fail("deployed demo missing unsupported query demo");
  }
  if (!/(abstain|abstention|No case-by-case authority is attached)/i.test(combined)) {
    fail("deployed demo missing unsupported-query abstention wording");
  }
  if (!/(Demoted principles|demoted principles|demoted_principle_count|247)/i.test(combined)) {
    fail("deployed demo missing demoted-principle boundary");
  }
  if (/markdownToHtml|data-demo-markdown|```json|Static proof fallback for smoke tests/i.test(shellText)) {
    fail("verified route appears to expose raw markdown/JSON/audit dump as the main UI");
  }
  if (/(Human review required|Lawyer review required|lawyer-review-required|answer_safe=false|needs_lawyer_review|answer_safe:\s*true|Answer safe:\s*`true`|"answer_safe":\s*true)/i.test(combined)) fail("deployed demo must not show old answer-safe/lawyer-review labels");
}

(async () => {
  const parsedTarget = new URL(targetUrl);
  const pageUrl = parsedTarget.pathname.endsWith("/") || parsedTarget.pathname.endsWith(".html")
    ? parsedTarget.toString()
    : `${parsedTarget.toString()}/`;
  const workspaceUrl = parsedTarget.pathname.endsWith("case_corpus_demo.html")
    ? resolveUrl(pageUrl, "./")
    : pageUrl;
  const demoUrl = parsedTarget.pathname.endsWith("case_corpus_demo.html")
    ? pageUrl
    : resolveUrl(pageUrl, "case_corpus_demo.html");

  const workspaceHtml = await fetchText(workspaceUrl);
  const workspaceJs = await fetchText(resolveUrl(workspaceUrl, "app.js"), false);
  validateWorkspace(workspaceHtml, workspaceJs);

  const demoHtml = await fetchText(demoUrl);
  const jsUrl = resolveUrl(demoUrl, "case_corpus_demo.js");
  let js = "";
  try {
    js = await fetchText(jsUrl, false);
  } catch (_error) {
    js = "";
  }

  const artifactUrls = extractArtifactUrls(demoUrl, demoHtml, js);
  artifactUrls.push(resolveUrl(demoUrl, "../data/legal_ingest/case_corpus/viewer_evidence_index.json"));
  artifactUrls.push(resolveUrl(demoUrl, "../data/legal_ingest/case_corpus/viewer_node_evidence_map.json"));
  artifactUrls.push(resolveUrl(demoUrl, "../data/legal_ingest/case_corpus/viewer_seed_case_public_sources.json"));
  artifactUrls.push(resolveUrl(demoUrl, "../artifacts/excluded_unverified_case_seeds_report.json"));
  const fetched = [demoHtml, js];
  for (const url of artifactUrls) {
    try {
      fetched.push(await fetchText(url, false));
    } catch (_error) {
      fetched.push("");
    }
  }

  validateVerifiedDemo(fetched.join("\n"), `${demoHtml}\n${js}`);

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
