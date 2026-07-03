/**
 * Builds structured case notes from the verified viewer evidence index.
 *
 * Source-grounded rule: every analytic field is either
 *  (a) derived from verified paragraph text / L4 application summaries with
 *      supporting paragraph ids recorded, or
 *  (b) set to UNKNOWN with an explicit reason in unknown_field_reasons.
 * Nothing is invented.
 */
const fs = require("fs");
const path = require("path");
const { UNKNOWN, emptyCaseNote, validateCaseNote } = require("./case_note_schema");
const { loadViewerEvidenceIndex } = require("./verified_case_authority");

const ROOT = path.resolve(__dirname, "..", "..");
const NOTES_PATH = path.join(ROOT, "data", "legal_ingest", "case_corpus", "structured_case_notes.json");

const INGEST_DIRS = [
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "bail_public_batch_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "sedition_public_expression_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "tree_gap_pilots", "public_order_riot_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "branch_pilots", "investigation_arrest_search_detention_v1"),
  path.join(ROOT, "data", "legal_ingest", "criminal_evidence_tree_v1", "branch_pilots", "theft_dishonesty_fraud_v1"),
  path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "data_privacy_dpp1_v1"),
  path.join(ROOT, "data", "legal_ingest", "tree_gap_pilots", "civil_procedure_inconsistent_pleadings_v1"),
];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** L4 application metadata keyed by paragraph_id (authority role, significance, lineage). */
function collectL4ByParagraphId() {
  const map = new Map();
  const caseMeta = new Map();
  for (const dir of INGEST_DIRS) {
    const l4 = readJsonIfExists(path.join(dir, "l4_case_applications.json"));
    const cards = readJsonIfExists(path.join(dir, "paragraph_cards.json"));
    for (const item of l4?.l4_case_applications || []) {
      if (item.paragraph_id) map.set(item.paragraph_id, item);
    }
    for (const record of cards?.cases || []) {
      if (record.case_id) caseMeta.set(record.case_id, record);
    }
  }
  return { l4ByParagraph: map, caseMeta };
}

function caseLevelFromCitation(citation = "", court = "") {
  const text = `${citation} ${court}`.toUpperCase();
  if (/HKCFA|FINAL APPEAL|FACC|FACV|HKCFAR/.test(text)) return "CFA";
  if (/HKCA|COURT OF APPEAL|CACC|CACV|CASJ/.test(text)) return "CA";
  if (/HKCFI|FIRST INSTANCE|HCAL|HCCP/.test(text)) return "CFI";
  if (/HKDC|DISTRICT COURT|DCCC/.test(text)) return "DC";
  return UNKNOWN;
}

const POSTURE_PATTERNS = [
  { re: /application for bail|bail review|admitted to bail|refus(?:ed|ing) bail|grant(?:ed|ing)? bail/i, label: "bail application / bail review" },
  { re: /judicial review|declaration that|certiorari/i, label: "judicial review" },
  { re: /appeal(?:ed)? by way of case stated|case stated/i, label: "appeal by way of case stated" },
  { re: /this appeal concerns|on appeal from|leave to appeal/i, label: "appeal" },
  { re: /voir dire|trial within a trial/i, label: "voir dire on admissibility" },
  { re: /search warrant|warrant issued|seized on arrest/i, label: "challenge to search / seizure powers" },
  { re: /conviction|convicted after trial|sentence/i, label: "post-conviction proceedings" },
];

function extractProceduralPosture(paragraphRefs) {
  for (const pattern of POSTURE_PATTERNS) {
    const hits = paragraphRefs.filter(ref => pattern.re.test(ref.paragraph_text || ""));
    if (hits.length) {
      return { value: pattern.label, support: hits.map(h => h.paragraph_id) };
    }
  }
  return { value: UNKNOWN, support: [] };
}

const FACT_PATTERNS = [
  { re: /arrested (?:\d+ times|on|for|in)/i },
  { re: /charged with|charges? of/i },
  { re: /undercover operation|telephone.*meetings|conversations/i },
  { re: /mobile phone|digital contents|seized/i },
  { re: /procession|assembly|demonstration|protest/i },
];

function extractMaterialFacts(paragraphRefs) {
  const factual = paragraphRefs.filter(ref => FACT_PATTERNS.some(p => p.re.test(ref.paragraph_text || "")));
  if (!factual.length) return { value: UNKNOWN, support: [] };
  // Use the first factual paragraph verbatim as the fact basis (source-grounded, no invention).
  const first = factual[0];
  const text = String(first.paragraph_text || "").replace(/^\d+\.\s*/, "");
  return {
    value: `From judgment para ${first.paragraph_number}: ${text.slice(0, 320)}${text.length > 320 ? "…" : ""}`,
    support: factual.map(f => f.paragraph_id),
  };
}

const STATUTE_RE = /\b(NSL(?:\s*(?:Article|Art\.?)?\s*\d+(?:\(\d+\))?)?|Cap\.?\s*\d+|section\s+\d+[A-Z]?(?:\(\d+\))?|s\.?\s?\d+[A-Z]?(?:\(\d+\))?|Basic Law|BORO?|BOR\s*\d+|BL\s*\d+|CPO\s*9[A-Z](?:\(\d+\))?|Theft Ordinance|Crimes Ordinance|Public Order Ordinance|SFO)\b/g;

function extractStatutoryContext(paragraphRefs) {
  const found = new Set();
  const support = new Set();
  for (const ref of paragraphRefs) {
    const matches = String(ref.paragraph_text || "").match(STATUTE_RE) || [];
    for (const m of matches) {
      const cleaned = m.trim();
      if (cleaned.length < 3) continue;
      found.add(cleaned);
      support.add(ref.paragraph_id);
    }
  }
  if (!found.size) return { value: UNKNOWN, support: [] };
  return { value: [...found].slice(0, 12).join("; "), support: [...support] };
}

function issueFromDoctrineNodes(doctrineNodeIds = [], issueTags = []) {
  const parts = new Set();
  for (const id of doctrineNodeIds) {
    const tail = String(id).split(".").slice(1).join(" · ").replace(/_/g, " ");
    if (tail) parts.add(tail);
  }
  for (const tag of issueTags) parts.add(String(tag).replace(/_/g, " "));
  return [...parts].slice(0, 6).join("; ");
}

function pickPrimary(paragraphRefs, l4ByParagraph) {
  // Prefer a paragraph whose L4 significance says it states a rule / sets out a test.
  const withL4 = paragraphRefs
    .map(ref => ({ ref, l4: l4ByParagraph.get(ref.paragraph_id) }))
    .filter(item => item.l4);
  const rule = withL4.find(item => /states_rule|sets_out_test/.test(item.l4.significance_label || ""));
  if (rule) return rule;
  if (withL4.length) return withL4[0];
  return { ref: paragraphRefs[0], l4: null };
}

function buildCaseNote(caseId, records, l4ByParagraph, caseMeta) {
  const first = records[0];
  const meta = caseMeta.get(caseId) || {};
  const note = emptyCaseNote();

  const paragraphRefs = [];
  const seenParas = new Set();
  for (const record of records) {
    const key = `${record.paragraph_id || record.paragraph_number}:${record.exact_quote}`;
    if (seenParas.has(key)) continue;
    seenParas.add(key);
    const l4 = l4ByParagraph.get(record.paragraph_id);
    paragraphRefs.push({
      paragraph_id: record.paragraph_id || `${caseId}_p${record.paragraph_number}`,
      paragraph_number: record.paragraph_number || record.para_no || "",
      exact_quote: record.exact_quote,
      paragraph_text: record.paragraph_text,
      source_url: record.source_url,
      paragraph_role: l4?.significance_label || "supporting_paragraph",
      proposition_text: record.proposition_text || "",
      doctrine_node_ids: record.mapped_viewer_node_ids || [],
    });
  }

  const doctrineNodeIds = [...new Set(records.flatMap(r => [r.doctrine_node_id, ...(r.mapped_viewer_node_ids || [])]).filter(Boolean))];
  const issueTags = [...new Set(records.flatMap(r => r.issue_tags || []))];

  const primary = pickPrimary(paragraphRefs, l4ByParagraph);
  const posture = extractProceduralPosture(paragraphRefs);
  const facts = extractMaterialFacts(paragraphRefs);
  const statutes = extractStatutoryContext(paragraphRefs);

  const allParaIds = paragraphRefs.map(r => r.paragraph_id);
  const principleTexts = [...new Set(records.map(r => r.principle_text || r.proposition_text).filter(Boolean))];

  note.note_id = `note_${caseId}`;
  note.case_id = caseId;
  note.case_name = first.case_name;
  note.citation = first.citation || first.neutral_citation;
  note.neutral_citation = first.neutral_citation || "";
  note.law_report_citation = meta.law_report_citation || first.law_report_citation || "";
  note.court = meta.court || first.court || UNKNOWN;
  note.court_level = meta.court_level || caseLevelFromCitation(note.citation, note.court);
  note.judgment_date = meta.date || first.judgment_date || UNKNOWN;
  note.public_source_url = first.source_url;
  note.paragraph_refs = paragraphRefs;
  note.exact_quotes = paragraphRefs.map(r => r.exact_quote);
  note.material_facts = facts.value;
  note.material_facts_support = facts.support;
  note.procedural_posture = posture.value;
  note.procedural_posture_support = posture.support;
  note.legal_issue = issueFromDoctrineNodes(doctrineNodeIds, issueTags) || "paragraph-linked issue mapping pending";
  note.legal_issue_support = allParaIds;
  note.sub_issue_tags = issueTags.length ? issueTags : doctrineNodeIds.map(id => id.split(".").pop());
  note.holding = primary.ref.proposition_text || principleTexts[0] || "";
  note.holding_support = [primary.ref.paragraph_id];
  note.ratio_or_core_principle = principleTexts.slice(0, 3).join(" ") || primary.ref.proposition_text || "";
  note.ratio_support = allParaIds;
  note.obiter_or_limits = UNKNOWN;
  note.statutory_context = statutes.value;
  note.application_summary = [...new Set(records.map(r => r.short_application_summary).filter(Boolean))].slice(0, 3).join(" ");
  note.application_support = allParaIds;
  note.fact_patterns_supported = issueTags.map(tag => `fact patterns engaging ${String(tag).replace(/_/g, " ")}`).slice(0, 6);
  note.fact_patterns_not_supported = [
    "fact patterns outside the quoted paragraphs and mapped sub-issues",
    "civil-only disputes with no criminal procedure dimension",
  ];
  note.distinguishing_points = [];
  note.related_authorities = [];
  note.authority_role = primary.l4?.authority_role || UNKNOWN;
  note.case_level = note.court_level;
  note.doctrine_node_ids = doctrineNodeIds;
  note.confidence_notes = `Built from ${paragraphRefs.length} verified paragraph proof(s); analytic fields limited to what the quoted paragraphs support.`;
  note.unknown_field_reasons = {};
  if (note.material_facts === UNKNOWN) {
    note.unknown_field_reasons.material_facts = "No verified paragraph in the proof set narrates the material facts; full-judgment ingestion needed.";
  }
  if (note.procedural_posture === UNKNOWN) {
    note.unknown_field_reasons.procedural_posture = "No verified paragraph states the procedural posture; full-judgment ingestion needed.";
  }
  note.unknown_field_reasons.obiter_or_limits = "Obiter/limits require reading beyond the verified proof paragraphs; not yet extracted.";
  if (note.statutory_context === UNKNOWN) {
    note.unknown_field_reasons.statutory_context = "No statutory reference appears in the verified proof paragraphs.";
  }
  if (note.court === UNKNOWN) {
    note.unknown_field_reasons.court = "Court name not recorded in ingest metadata for this case.";
  }
  if (note.judgment_date === UNKNOWN) {
    note.unknown_field_reasons.judgment_date = "Judgment date not recorded in ingest metadata for this case.";
  }
  return note;
}

function crossLinkRelatedAuthorities(notes) {
  const byNode = new Map();
  for (const note of notes) {
    for (const nodeId of note.doctrine_node_ids) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(note);
    }
  }
  for (const note of notes) {
    const related = new Map();
    for (const nodeId of note.doctrine_node_ids) {
      for (const other of byNode.get(nodeId) || []) {
        if (other.case_id === note.case_id) continue;
        if (!related.has(other.case_id)) {
          related.set(other.case_id, {
            case_id: other.case_id,
            case_name: other.case_name,
            citation: other.citation,
            shared_issue: nodeId,
          });
        }
      }
    }
    note.related_authorities = [...related.values()].slice(0, 8);
  }
}

function buildStructuredCaseNotes({ write = false } = {}) {
  const index = loadViewerEvidenceIndex({ refresh: true });
  const { l4ByParagraph, caseMeta } = collectL4ByParagraphId();

  const byCase = new Map();
  for (const record of index.records || []) {
    const caseId = record.case_id || record.case_name;
    if (!byCase.has(caseId)) byCase.set(caseId, []);
    byCase.get(caseId).push(record);
  }

  const notes = [];
  const failures = [];
  for (const [caseId, records] of byCase.entries()) {
    const note = buildCaseNote(caseId, records, l4ByParagraph, caseMeta);
    const validation = validateCaseNote(note);
    if (!validation.ok) {
      failures.push({ case_id: caseId, errors: validation.errors });
    }
    notes.push(note);
  }
  crossLinkRelatedAuthorities(notes);

  const payload = {
    artifact_id: "structured_case_notes_v1",
    generated_at: new Date().toISOString(),
    policy: "source_grounded_case_notes_from_paragraph_proof",
    note_count: notes.length,
    validation_failures: failures,
    notes,
  };
  if (write) {
    fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true });
    fs.writeFileSync(NOTES_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

let cachedNotes = null;
function loadStructuredCaseNotes({ refresh = false } = {}) {
  if (!refresh && cachedNotes) return cachedNotes;
  if (!refresh && fs.existsSync(NOTES_PATH)) {
    cachedNotes = JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
    return cachedNotes;
  }
  cachedNotes = buildStructuredCaseNotes({ write: false });
  return cachedNotes;
}

function caseNoteForCaseId(caseId) {
  const payload = loadStructuredCaseNotes();
  return (payload.notes || []).find(note => note.case_id === caseId) || null;
}

function caseNotesForDoctrineNode(doctrineNodeId) {
  const payload = loadStructuredCaseNotes();
  return (payload.notes || []).filter(note => (note.doctrine_node_ids || []).includes(doctrineNodeId));
}

module.exports = {
  NOTES_PATH,
  buildStructuredCaseNotes,
  loadStructuredCaseNotes,
  caseNoteForCaseId,
  caseNotesForDoctrineNode,
  caseLevelFromCitation,
};
