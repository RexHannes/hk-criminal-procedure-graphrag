#!/usr/bin/env node
/* Fetch public HKLII/LegalRef/Judiciary pages and paragraphize them into L2 cards.
 *
 * CI should not run network fetches. Use --sample to refresh the committed sample
 * from already verified public paragraph cards.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const {
  ROOT,
  PATHS,
  CASE_CORPUS_DIR,
  readJsonl,
  writeJsonl,
  sha256NormalizedParagraphText,
} = require("../src/legal_answer/case_corpus/case_corpus_store");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "hk-graphrag-case-corpus-research-bot/1.0" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchText(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`GET ${url} failed with ${response.statusCode}`));
        return;
      }
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function stripTags(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphizeHtml(html = "", caseRecord = {}) {
  const cards = [];
  const pRegex = /(?:id|name)=["']?p?(\d+)["']?[\s\S]{0,1200}?(?:<p[^>]*>|<div[^>]*>)?([\s\S]*?)(?=(?:id|name)=["']?p?\d+["']?|$)/gi;
  let match;
  while ((match = pRegex.exec(html)) && cards.length < 400) {
    const paraNo = match[1];
    const text = stripTags(match[2]);
    if (!text || text.length < 20) continue;
    cards.push({
      paragraph_id: `${caseRecord.case_id}_p${paraNo}`,
      case_id: caseRecord.case_id,
      case_name: caseRecord.case_name,
      neutral_citation: caseRecord.neutral_citation,
      court: caseRecord.court,
      judgment_date: caseRecord.judgment_date,
      para_no: String(paraNo),
      paragraph_text: text,
      source_url: `${caseRecord.source_url}#p${paraNo}`,
      source_system: caseRecord.source_system,
      checksum: sha256NormalizedParagraphText(text),
      checksum_algorithm: "sha256_normalized_paragraph_text",
      issue_tags_candidate: caseRecord.issue_seed_tags || [],
      authority_role_candidate: "source_verification_required",
      extraction_status: "network_paragraphized_candidate",
      verification_status: "source_verification_required",
      answer_layer_status: "research_only",
      review_status: "machine_candidate",
    });
  }
  return cards;
}

async function main() {
  const sample = hasFlag("--sample");
  const limit = Number(argValue("--limit", sample ? "100" : "10"));
  const offset = Number(argValue("--offset", "0"));
  const cacheDir = path.resolve(argValue("--cache-dir", path.join(ROOT, ".cache", "hklii_case_pages")));
  const resume = hasFlag("--resume");

  if (sample) {
    const current = readJsonl(PATHS.paragraphsSample, { optional: true });
    writeJsonl(PATHS.paragraphsSample, current.slice(0, limit));
    console.log(`Sample paragraph cards retained: ${Math.min(current.length, limit)}`);
    return;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const registry = readJsonl(PATHS.registryFull).slice(offset, offset + limit);
  const outDir = path.join(CASE_CORPUS_DIR, "paragraph_cards_chunks");
  fs.mkdirSync(outDir, { recursive: true });

  const allCards = [];
  for (const record of registry) {
    const cachePath = path.join(cacheDir, `${record.case_id}.html`);
    let html = "";
    if (resume && fs.existsSync(cachePath)) {
      html = fs.readFileSync(cachePath, "utf8");
    } else {
      html = await fetchText(record.source_url);
      fs.writeFileSync(cachePath, html, "utf8");
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    allCards.push(...paragraphizeHtml(html, record));
  }

  const chunkPath = path.join(outDir, `paragraph_cards_offset_${offset}_limit_${limit}.jsonl`);
  writeJsonl(chunkPath, allCards);
  console.log(`Wrote ${allCards.length} paragraph cards to ${path.relative(ROOT, chunkPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
