const MAX_ITEMS = 12;
const MAX_TEXT_CHARS = 6000;

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sourceKindFrom({ name = "", declaredKind = "", text = "" } = {}) {
  const haystack = `${declaredKind} ${name} ${text.slice(0, 800)}`.toLowerCase();
  if (/\b(cctv|video|footage|camera|body[- ]?worn)\b/.test(haystack)) return "cctv_or_video_transcript";
  if (/\b(receipt|octopus|visa|mastercard|payment|card|wallet|transaction)\b/.test(haystack)) return "receipt_or_payment_record";
  if (/\b(charge|charge sheet|police|notebook|interview|caution|arrest)\b/.test(haystack)) return "police_or_charge_record";
  if (/\b(witness|statement|staff|security guard)\b/.test(haystack)) return "witness_statement";
  if (/\b(death certificate|birth certificate|marriage certificate|domicile|asset|will|estate|probate)\b/.test(haystack)) return "probate_document_text";
  if (declaredKind) return declaredKind.replace(/\s+/g, "_").toLowerCase();
  return "text_evidence";
}

function normalizeRawItems(body = {}) {
  const raw = []
    .concat(asArray(body.evidence_items))
    .concat(asArray(body.evidenceItems))
    .concat(asArray(body.uploaded_evidence))
    .concat(asArray(body.uploadedEvidence))
    .concat(asArray(body.documents))
    .concat(asArray(body.files));

  if (body.evidence_text || body.evidenceText) {
    raw.push({
      name: "evidence_text",
      source_kind: "text_evidence",
      text: body.evidence_text || body.evidenceText,
    });
  }

  if (typeof body.evidence === "string") {
    raw.push({ name: "evidence", source_kind: "text_evidence", text: body.evidence });
  } else {
    raw.push(...asArray(body.evidence));
  }

  return raw.slice(0, MAX_ITEMS);
}

function signalItems(text = "") {
  const q = String(text || "").toLowerCase();
  const helpful = [];
  const harmful = [];
  const neutral = [];
  const issueTags = new Set();

  function addIf(condition, bucket, tag, description) {
    if (!condition) return;
    bucket.push(description);
    if (tag) issueTags.add(tag);
  }

  addIf(/\b(visible|plain sight|basket|trolley|cart|held openly|not concealed)\b/.test(q), helpful, "theft_visibility", "Item appears visible or handled openly.");
  addIf(/\b(paid for other|receipt|attempted payment|card declined|octopus|wallet|queued|checkout)\b/.test(q), helpful, "theft_payment_context", "Payment/checkout context may support ordinary shopping or mistake.");
  addIf(/\b(phone call|child|medical|distracted|emergency|stress|forgot|mistake|accident)\b/.test(q), helpful, "theft_mistake_context", "Distraction or mistake context is asserted.");
  addIf(/\b(returned before|went back before|offered to pay before|voluntary return)\b/.test(q), helpful, "theft_return_before_confrontation", "Return/payment is described as voluntary before confrontation.");

  addIf(/\b(conceal|concealed|hide|hid|hidden|pocket|inside bag|under jacket|removed tag|tag removed)\b/.test(q), harmful, "theft_concealment", "Concealment or tag-removal language appears.");
  addIf(/\b(bypass|avoid(?:ed)? checkout|left without paying|exit(?:ed)?|ran|walked out|security stopped|caught after)\b/.test(q), harmful, "theft_checkout_exit", "Exit/security-stop facts may support prosecution inferences depending on detail.");
  addIf(/\b(inconsistent|changed story|lied|false name|prior similar|previous incident)\b/.test(q), harmful, "theft_credibility", "Credibility/similar-incident language appears.");

  addIf(/\b(charge sheet|charged with theft|arrested|cautioned|interview)\b/.test(q), neutral, "criminal_procedure_posture", "Police/charge/interview posture should be separated from liability.");
  addIf(/\b(death certificate|domicile|hong kong asset|asset schedule|no will|intestate|minor|under 18|grandchild|spouse|marriage certificate|birth certificate)\b/.test(q), neutral, "probate_evidence", "Probate identity, domicile, relationship or asset evidence is mentioned.");

  return {
    helpful,
    harmful,
    neutral,
    issue_tags: Array.from(issueTags).sort(),
  };
}

function normalizeEvidenceItem(raw, index) {
  if (typeof raw === "string") {
    const text = raw.trim().slice(0, MAX_TEXT_CHARS);
    return {
      evidence_id: `uploaded_evidence_${index + 1}`,
      name: `Uploaded evidence ${index + 1}`,
      source_kind: sourceKindFrom({ text }),
      text,
      parsed: Boolean(text),
      ...signalItems(text),
    };
  }

  const item = raw && typeof raw === "object" ? raw : {};
  const name = firstString(item.name, item.filename, item.file_name, item.title, item.document_name) || `Uploaded evidence ${index + 1}`;
  const declaredKind = firstString(item.source_kind, item.kind, item.type, item.document_type);
  const text = firstString(item.text, item.content, item.body, item.transcript, item.extracted_text, item.markdown).slice(0, MAX_TEXT_CHARS);
  return {
    evidence_id: firstString(item.evidence_id, item.id) || `uploaded_evidence_${index + 1}`,
    name,
    source_kind: sourceKindFrom({ name, declaredKind, text }),
    url: firstString(item.url, item.source_url),
    text,
    parsed: Boolean(text),
    unparsed_reason: text ? "" : "No text/transcript/extracted_text field was supplied for this item.",
    ...signalItems(text),
  };
}

function buildUploadedEvidenceBundle(body = {}) {
  const evidence_items = normalizeRawItems(body).map(normalizeEvidenceItem);
  const parsed = evidence_items.filter(item => item.parsed);
  const unparsed = evidence_items.filter(item => !item.parsed);
  const issueTags = new Set();
  const helpful = [];
  const harmful = [];
  const neutral = [];

  for (const item of parsed) {
    for (const tag of item.issue_tags || []) issueTags.add(tag);
    helpful.push(...(item.helpful || []).map(text => ({ evidence_id: item.evidence_id, name: item.name, text })));
    harmful.push(...(item.harmful || []).map(text => ({ evidence_id: item.evidence_id, name: item.name, text })));
    neutral.push(...(item.neutral || []).map(text => ({ evidence_id: item.evidence_id, name: item.name, text })));
  }

  return {
    status: parsed.length ? "text_evidence_parsed_research_only" : (evidence_items.length ? "evidence_items_unparsed" : "no_uploaded_evidence"),
    uploaded_evidence_ingested: parsed.length > 0,
    evidence_item_count: evidence_items.length,
    text_item_count: parsed.length,
    unparsed_item_count: unparsed.length,
    source_kinds: Array.from(new Set(evidence_items.map(item => item.source_kind))).sort(),
    issue_tags: Array.from(issueTags).sort(),
    helpful_facts: helpful,
    harmful_facts: harmful,
    neutral_facts: neutral,
    limitations: [
      "Text/transcript evidence is parsed for research triage only; it is not legal authority.",
      "No OCR, image, audio or video-file analysis is performed by this endpoint.",
      "A lawyer must verify authenticity, completeness, admissibility and factual weight before advice.",
    ],
    evidence_items: evidence_items.map(item => ({
      evidence_id: item.evidence_id,
      name: item.name,
      source_kind: item.source_kind,
      url: item.url || "",
      parsed: item.parsed,
      unparsed_reason: item.unparsed_reason || "",
      issue_tags: item.issue_tags || [],
      text_excerpt: item.text ? item.text.slice(0, 320) : "",
    })),
  };
}

function evidenceBundleToMemoItems(bundle = {}) {
  if (!bundle.uploaded_evidence_ingested) {
    if (bundle.evidence_item_count) {
      return [
        `Uploaded evidence received but not parsed: ${bundle.unparsed_item_count} item(s) lacked text/transcript/extracted_text.`,
        ...bundle.limitations,
      ];
    }
    return [];
  }

  const items = [
    `Uploaded evidence parsed: ${bundle.text_item_count} text item(s). Source kinds: ${bundle.source_kinds.join(", ") || "text_evidence"}.`,
  ];
  for (const fact of bundle.helpful_facts.slice(0, 6)) {
    items.push(`Uploaded evidence ${fact.evidence_id} (${fact.name}) helps: ${fact.text}`);
  }
  for (const fact of bundle.harmful_facts.slice(0, 6)) {
    items.push(`Uploaded evidence ${fact.evidence_id} (${fact.name}) hurts or needs explanation: ${fact.text}`);
  }
  for (const fact of bundle.neutral_facts.slice(0, 4)) {
    items.push(`Uploaded evidence ${fact.evidence_id} (${fact.name}) issue tag: ${fact.text}`);
  }
  items.push(...bundle.limitations);
  return items;
}

module.exports = {
  buildUploadedEvidenceBundle,
  evidenceBundleToMemoItems,
};
