#!/usr/bin/env node
/* DOM-level smoke test for the PR #6 viewer UX recovery. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.VIEWER_BASE_URL || "";
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function resolveUrl(base, relativePath) {
  return new URL(relativePath, base).toString();
}

async function loadTargets() {
  if (BASE_URL) {
    const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
    const workspace = await fetchText(base);
    const workspaceJs = await fetchText(resolveUrl(base, "app.js"));
    const demoUrl = resolveUrl(base, "case_corpus_demo.html");
    const demo = await fetchText(demoUrl);
    const demoJs = await fetchText(resolveUrl(demoUrl, "case_corpus_demo.js"));
    const nativeEvidence = await Promise.all([
      "../data/legal_ingest/case_corpus/viewer_evidence_index.json",
      "../data/legal_ingest/case_corpus/viewer_node_evidence_map.json",
    ].map(file => fetchText(resolveUrl(demoUrl, file))));
    const artifacts = await Promise.all([
      "../artifacts/demo_outputs/theft_dishonesty_research_memo.md",
      "../artifacts/demo_outputs/intention_permanently_deprive_research_memo.md",
      "../artifacts/demo_outputs/belonging_to_another_research_memo.md",
      "../artifacts/demo_outputs/bail_research_memo.md",
      "../artifacts/demo_outputs/unsupported_landlord_query.md",
    ].map(file => fetchText(resolveUrl(demoUrl, file))));
    return { workspace, workspaceJs, demo, demoJs, nativeEvidence: nativeEvidence.join("\n"), artifacts: artifacts.join("\n") };
  }
  return {
    workspace: read("viewer/index.html"),
    workspaceJs: read("viewer/app.js"),
    demo: read("viewer/case_corpus_demo.html"),
    demoJs: read("viewer/case_corpus_demo.js"),
    nativeEvidence: [
      read("data/legal_ingest/case_corpus/viewer_evidence_index.json"),
      read("data/legal_ingest/case_corpus/viewer_node_evidence_map.json"),
    ].join("\n"),
    artifacts: [
      read("artifacts/demo_outputs/theft_dishonesty_research_memo.md"),
      read("artifacts/demo_outputs/intention_permanently_deprive_research_memo.md"),
      read("artifacts/demo_outputs/belonging_to_another_research_memo.md"),
      read("artifacts/demo_outputs/bail_research_memo.md"),
      read("artifacts/demo_outputs/unsupported_landlord_query.md"),
    ].join("\n"),
  };
}

function assertMatch(text, re, message) {
  if (!re.test(text)) fail(message);
}

(async () => {
  const { workspace, workspaceJs, demo, demoJs, nativeEvidence, artifacts } = await loadTargets();
  const workspaceCombined = `${workspace}\n${workspaceJs}`;
  const demoShell = `${demo}\n${demoJs}`;
  const demoCombined = `${demoShell}\n${nativeEvidence}\n${artifacts}`;

  assertMatch(workspace, /Legal Graph-SOP Workspace/i, "/viewer/ is not the original workspace shell");
  assertMatch(workspace, /id=["']sidebar["']/i, "/viewer/ missing sidebar");
  assertMatch(workspace, /id=["']inspector["']/i, "/viewer/ missing inspector");
  assertMatch(workspace, /data-view=["']caseDemo["']/i, "/viewer/ missing Verified Case Demo workspace view");
  assertMatch(workspace, /Verified Case Demo/i, "/viewer/ missing visible Verified Case Demo entry");
  assertMatch(workspaceCombined, /case-demo-native/i, "Verified Case Demo does not render as a native workspace module");
  assertMatch(workspaceCombined, /viewer_evidence_index\.json/i, "workspace missing native evidence index loader");
  assertMatch(workspaceCombined, /viewer_node_evidence_map\.json/i, "workspace missing native evidence map loader");
  assertMatch(workspaceCombined, /Case Fruits \/ Paragraph Proof/i, "workspace missing inspector paragraph-proof panel");
  assertMatch(workspaceCombined, /caseEvidenceInquiryMatches/i, "workspace missing AI Inquiry evidence bridge");
  assertMatch(workspaceCombined, /Legacy seed graph - not the verified case-law demo\./i, "seed graph warning missing");
  if (/case-demo-frame|<iframe/i.test(workspaceCombined)) {
    fail("workspace must not iframe the verified demo route as the main solution");
  }

  assertMatch(demo, /Source-proofed HK criminal-law research demo/i, "direct verified demo missing title");
  assertMatch(demoJs, /demo-grid/i, "direct verified demo missing structured layout renderer");
  assertMatch(demoJs, /authority-card/i, "direct verified demo missing authority cards");
  assertMatch(demoCombined, /https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)\//i, "verified demo missing HKLII/LegalRef link");
  assertMatch(demoCombined, /#p\d+/i, "verified demo missing paragraph anchor");
  assertMatch(demoCombined, /Exact quote|exact_quote/i, "verified demo missing exact quote label");
  assertMatch(demoCombined, /answer_safe=false|Answer safe:\s*`false`|Answer safe:\s*false|"answer_safe":\s*false/i, "verified demo missing answer_safe=false");
  assertMatch(demoCombined, /unsupported_general_query|Unsupported Landlord Query|abstention/i, "verified demo missing unsupported-query abstention");
  assertMatch(nativeEvidence, /criminal_law\.theft\.dishonesty/i, "native evidence missing theft/dishonesty mapping");
  assertMatch(nativeEvidence, /criminal_procedure\.bail/i, "native evidence missing bail mapping");

  if (/markdownToHtml|data-demo-markdown|Static proof fallback for smoke tests|```json/.test(demoShell)) {
    fail("verified demo shell exposes raw markdown/JSON/audit dump");
  }
  if (/Verification pending/i.test(workspace.split("</header>")[0] || workspace)) {
    fail("/viewer/ still presents Verification pending as a top-level state");
  }

  if (errors.length) {
    console.error("Viewer UI quality smoke failed:");
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Viewer UI quality smoke passed${BASE_URL ? ` for ${BASE_URL}` : " for local files"}.`);
})().catch(error => {
  console.error(`Viewer UI quality smoke failed: ${error.message}`);
  process.exit(1);
});
