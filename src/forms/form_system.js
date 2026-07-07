const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  buildClassificationReview,
  isTemplateActiveForRouting,
} = require("./form_classification_review");
const {
  buildFormWorkflowTimeline,
  crmExportRowsFromTimeline,
} = require("./form_workflow_timeline");

const PROVENANCE = {
  SOURCE_BACKED: "SOURCE_BACKED",
  TEMPLATE_BASED: "TEMPLATE_BASED",
  FIRM_SOP: "FIRM_SOP",
  AI_SUGGESTED: "AI_SUGGESTED",
  INTERNAL_USAGE_NOTE: "INTERNAL_USAGE_NOTE",
  LAWYER_APPROVED: "LAWYER_APPROVED",
};

const REVIEW = {
  CANDIDATE: "machine_extracted_candidate",
  LAWYER_REQUIRED: "lawyer_review_required",
  APPROVED: "approved",
};

const DANGEROUS_EXTENSIONS = new Set([
  ".app", ".bat", ".bin", ".cmd", ".com", ".dmg", ".exe", ".js", ".msi", ".ps1", ".scr", ".sh",
]);

const SUPPORTED_TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".docx", ".doc", ".pdf"]);

const COMMENCEMENT_INTENTS = new Set(["WRIT", "ORIGINATING_SUMMONS", "STATEMENT_OF_CLAIM", "PROBATE_APPLICATION", "COMPANY_WINDING_UP_PETITION"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "item";
}

function stableId(prefix, parts) {
  return `${prefix}_${sha256Text(parts.filter(Boolean).join("|")).slice(0, 12)}`;
}

function normaliseText(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function tokenize(text) {
  return Array.from(new Set(String(text || "").toLowerCase().match(/[a-z0-9_]+/g) || []));
}

function getPath(obj, dotted) {
  if (!dotted) return undefined;
  const cleaned = dotted.replace(/^matter\./, "");
  return cleaned.split(".").reduce((cur, part) => (cur && Object.prototype.hasOwnProperty.call(cur, part) ? cur[part] : undefined), obj);
}

function isTruthyValue(value) {
  return value === true || value === "true" || value === "yes" || value === 1;
}

function fileInventoryRecord(filePath, rootDir, buffer) {
  const rel = rootDir ? path.relative(rootDir, filePath) : path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  return {
    fileId: stableId("file", [rel, buffer ? sha256Buffer(buffer) : filePath]),
    relativePath: rel,
    fileName: path.basename(filePath),
    extension: ext,
    byteSize: buffer ? buffer.length : fs.statSync(filePath).size,
    sha256: buffer ? sha256Buffer(buffer) : sha256Buffer(fs.readFileSync(filePath)),
    supported: SUPPORTED_TEXT_EXTENSIONS.has(ext),
    rejected: DANGEROUS_EXTENSIONS.has(ext),
    warnings: DANGEROUS_EXTENSIONS.has(ext) ? ["dangerous_extension_rejected"] : [],
  };
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function listZipEntries(zipPath) {
  try {
    const output = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function readZipEntry(zipPath, entryName) {
  return execFileSync("unzip", ["-p", zipPath, entryName], { maxBuffer: 30 * 1024 * 1024 });
}

function inventoryFormPack(inputPath) {
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) throw new Error(`Input does not exist: ${inputPath}`);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    return listFilesRecursive(abs).map(file => fileInventoryRecord(file, abs));
  }
  if (path.extname(abs).toLowerCase() === ".zip") {
    const entries = listZipEntries(abs);
    return entries.map(entry => {
      const ext = path.extname(entry).toLowerCase();
      let buffer = Buffer.from("");
      try {
        if (!entry.endsWith("/")) buffer = readZipEntry(abs, entry);
      } catch (error) {
        // Keep inventory even if one entry cannot be read.
      }
      return {
        fileId: stableId("file", [entry, sha256Buffer(buffer)]),
        relativePath: entry,
        fileName: path.basename(entry),
        extension: ext,
        byteSize: buffer.length,
        sha256: sha256Buffer(buffer),
        supported: SUPPORTED_TEXT_EXTENSIONS.has(ext),
        rejected: DANGEROUS_EXTENSIONS.has(ext),
        warnings: DANGEROUS_EXTENSIONS.has(ext) ? ["dangerous_extension_rejected"] : [],
        zipEntry: true,
      };
    });
  }
  return [fileInventoryRecord(abs, path.dirname(abs))];
}

function textFromDocxBuffer(buffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "form-docx-"));
  const docxPath = path.join(tmp, "input.docx");
  fs.writeFileSync(docxPath, buffer);
  try {
    const xml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+\n/g, "\n");
  } catch (error) {
    return "";
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function textFromPdfBuffer(buffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "form-pdf-"));
  const pdfPath = path.join(tmp, "input.pdf");
  const txtPath = path.join(tmp, "output.txt");
  fs.writeFileSync(pdfPath, buffer);
  try {
    execFileSync("pdftotext", [pdfPath, txtPath], { stdio: "ignore" });
    return fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf8") : "";
  } catch (error) {
    return "";
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function textFromDocBuffer(buffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "form-doc-"));
  const docPath = path.join(tmp, "input.doc");
  fs.writeFileSync(docPath, buffer);
  try {
    return execFileSync("textutil", ["-convert", "txt", "-stdout", docPath], {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    });
  } catch (error) {
    return "";
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function extractTextFromBuffer(buffer, ext) {
  if ([".txt", ".md", ".markdown"].includes(ext)) return buffer.toString("utf8");
  if (ext === ".docx") return textFromDocxBuffer(buffer);
  if (ext === ".doc") return textFromDocBuffer(buffer);
  if (ext === ".pdf") return textFromPdfBuffer(buffer);
  return "";
}

function extractFormDocuments(inputPath, inventory = inventoryFormPack(inputPath)) {
  const abs = path.resolve(inputPath);
  const stat = fs.statSync(abs);
  const docs = [];
  if (stat.isDirectory()) {
    for (const item of inventory) {
      if (item.rejected || !item.supported) continue;
      const full = path.join(abs, item.relativePath);
      const buffer = fs.readFileSync(full);
      const text = normaliseText(extractTextFromBuffer(buffer, item.extension));
      docs.push({
        fileRef: item,
        title: titleFromFileName(item.fileName),
        text,
        extractionWarnings: text ? [] : [`${item.extension}_text_extraction_empty_or_unavailable`],
      });
    }
  } else if (path.extname(abs).toLowerCase() === ".zip") {
    for (const item of inventory) {
      if (item.rejected || !item.supported || item.relativePath.endsWith("/")) continue;
      let buffer = Buffer.from("");
      try { buffer = readZipEntry(abs, item.relativePath); } catch (error) {}
      const text = normaliseText(extractTextFromBuffer(buffer, item.extension));
      docs.push({
        fileRef: item,
        title: titleFromFileName(item.fileName),
        text,
        extractionWarnings: text ? [] : [`${item.extension}_text_extraction_empty_or_unavailable`],
      });
    }
  } else {
    const item = inventory[0];
    if (!item.rejected && item.supported) {
      const buffer = fs.readFileSync(abs);
      docs.push({
        fileRef: item,
        title: titleFromFileName(item.fileName),
        text: normaliseText(extractTextFromBuffer(buffer, item.extension)),
        extractionWarnings: [],
      });
    }
  }
  return docs;
}

function titleFromFileName(fileName) {
  return path.basename(fileName, path.extname(fileName)).replace(/[_.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function readUseBlock(text, label) {
  const re = new RegExp(`${label}\\\\s*(?:when)?\\\\s*:?\\\\s*([^\\n]+(?:\\n(?![A-Z][^\\n]{0,60}:)[^\\n]+)*)`, "i");
  const match = String(text || "").match(re);
  if (!match) return [];
  return match[1]
    .split(/;|\n|\. (?=[A-Z])/)
    .map(x => x.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function classifyFromText(title, text) {
  const titleHay = String(title || "").toLowerCase();
  const textHay = String(text || "").toLowerCase();
  const leadHay = textHay.slice(0, 8000);
  const hay = `${titleHay} ${leadHay}`;
  const explicitProbateTitle = /\b(formw\d|probate|letters of administration|grant of probate|testament(?:ary)?|executor|administrator|affidavit of due execution|handwriting and signature|plight and condition|alterations in will)\b/.test(titleHay)
    || /\bwill\b/.test(titleHay) && !/\b(will be|will not|will have|will include|will apply|will provide)\b/.test(titleHay);
  const probateBody = /\b(grant of probate|letters of administration|non-contentious probate|testamentary|executor|administrator|testator|deceased estate|affidavit of due execution|plight and condition|handwriting and signature|alterations in will)\b/.test(leadHay);
  const explicitContractTitle = /\b(contract|agreement|consultancy|lease|conditions for the (purchase|supply)|purchase of it equipment|supply of it equipment|intellectual property clause|shareholders.? agreement|joint venture|facility agreement|guarantee)\b/.test(titleHay);
  const contractBody = /\b(contract|agreement|consultancy|lease|supplier|customer|buyer|seller|intellectual property|shareholders.? agreement|joint venture|facility agreement|guarantee)\b/.test(leadHay);
  const explicitCompanyTitle = /\b(company|companies|corporate|corp insolvency|insolvency|winding|liquidation|director|shareholder|board|creditor|petition|originating summons|proceedings by and against companies|voided|void|ccp|ipo|listing)\b/.test(titleHay);
  const companyBody = /\b(company|companies|corporate|director|shareholder|board|winding up|insolvency|liquidation|creditor|petition|companies ordinance|cap 32|cap 622|ipo|listing)\b/.test(leadHay);
  const explicitFinancialTitle = /\b(frp|financial regulatory|sfc|securities|futures|listing rules|market misconduct|regulated|regulatory)\b/.test(titleHay);
  const financialRegBody = /\b(sfc|securities|futures|listing rules|market misconduct|regulated activity|regulatory|financial regulatory)\b/.test(leadHay);
  const pi = /\b(personal injury|road traffic|traffic accident|medical report|police report|injury)\b/.test(hay);
  const contract = explicitContractTitle || (!explicitProbateTitle && !explicitCompanyTitle && contractBody);
  const financialReg = explicitFinancialTitle || (!explicitProbateTitle && financialRegBody);
  const company = explicitCompanyTitle || (!explicitProbateTitle && !contract && companyBody);
  const probate = explicitProbateTitle || (!contract && !company && !financialReg && probateBody);
  const base = {
    practiceArea: probate ? "probate" : contract ? "commercial_contracts" : company ? "company_corporate" : financialReg ? "financial_regulatory" : pi ? "personal_injury" : "general_litigation",
    subPracticeArea: /road traffic|traffic accident|driver|vehicle|car/.test(hay) ? "road_traffic_personal_injury" : "",
    jurisdiction: "HK",
    applicableMatterTypes: probate ? ["probate_grant", "wills_probate"] : contract ? ["commercial_contract", "transactional_drafting"] : company ? ["company", "corporate", /winding|insolvency|liquidation|creditor|petition/.test(hay) ? "company_winding_up" : "company_general"].filter(Boolean) : financialReg ? ["financial_regulatory", "listed_company_compliance"] : /road traffic|traffic accident|driver|vehicle|car/.test(hay) ? ["road_traffic_pi"] : ["general_matter"],
    applicableRoles: probate ? ["executor", "administrator", "beneficiary", "solicitor"] : contract ? ["buyer", "seller", "supplier", "customer", "company", "solicitor"] : company ? ["company", "director", "shareholder", "creditor", "solicitor"] : ["claimant", "plaintiff", "solicitor"],
  };
  if (probate && /application for probate|application.*grant|grant of probate|letters of administration/.test(hay)) {
    return { ...base, documentIntent: "PROBATE_APPLICATION", proceduralStage: "PROBATE_APPLICATION" };
  }
  if (/affirmation|affidavit|due execution|handwriting and signature|plight and condition|alterations in will/.test(hay) && probate) {
    return { ...base, documentIntent: "PROBATE_AFFIDAVIT", proceduralStage: "EVIDENCE_COLLECTION" };
  }
  if (/will drafting|joanne.?s will|draft.*\bwill\b|\bwill\b/.test(titleHay) && probate) {
    return { ...base, documentIntent: "WILL_DRAFT", proceduralStage: "DOCUMENT_DRAFTING" };
  }
  if (contract && /shareholders.? agreement|joint venture/.test(hay)) {
    return { ...base, documentIntent: "SHAREHOLDERS_AGREEMENT", proceduralStage: "TRANSACTIONAL_DRAFTING" };
  }
  if (contract && /lease/.test(hay)) {
    return { ...base, documentIntent: "LEASE_AGREEMENT", proceduralStage: "TRANSACTIONAL_DRAFTING" };
  }
  if (contract && /clause|intellectual property/.test(hay)) {
    return { ...base, documentIntent: "CONTRACT_CLAUSE", proceduralStage: "TRANSACTIONAL_DRAFTING" };
  }
  if (contract && /agreement|conditions for the|consultancy|facility agreement|guarantee|purchase of it equipment|supply of it equipment/.test(hay)) {
    return { ...base, documentIntent: "CONTRACT_AGREEMENT", proceduralStage: "TRANSACTIONAL_DRAFTING" };
  }
  if (company && /originating summons/.test(titleHay)) {
    return { ...base, documentIntent: "ORIGINATING_SUMMONS", proceduralStage: "COMMENCEMENT" };
  }
  if (/winding|insolvency|liquidation|creditor|petition|voided|void/.test(titleHay) && company) {
    return { ...base, documentIntent: "COMPANY_WINDING_UP_PETITION", proceduralStage: "COMPANY_WINDING_UP" };
  }
  if (financialReg) {
    return { ...base, documentIntent: "REGULATORY_COMPLIANCE_NOTE", proceduralStage: "REGULATORY_COMPLIANCE" };
  }
  if (company) {
    return { ...base, documentIntent: "COMPANY_COMPLIANCE_MEMO", proceduralStage: "COMPANY_COMPLIANCE" };
  }
  if (/letter of claim|claim letter|demand/.test(hay)) {
    return { ...base, documentIntent: "LETTER_OF_CLAIM", proceduralStage: "PRE_ACTION_CORRESPONDENCE" };
  }
  if (/police report|traffic accident record|opponent identification/.test(hay)) {
    return { ...base, documentIntent: "POLICE_REPORT_REQUEST", proceduralStage: "URGENT_ACTIONS" };
  }
  if (/medical record|medical report|consultation note|prognosis/.test(hay)) {
    return { ...base, documentIntent: "MEDICAL_RECORDS_REQUEST", proceduralStage: "MEDICAL_EVIDENCE" };
  }
  if (/\bwrit\b|commencement|commence proceedings/.test(hay)) {
    return { ...base, documentIntent: "WRIT", proceduralStage: "COMMENCEMENT" };
  }
  if (/checklist/.test(hay)) {
    return { ...base, documentIntent: "EVIDENCE_CHECKLIST", proceduralStage: "EVIDENCE_COLLECTION" };
  }
  return { ...base, documentIntent: "CLIENT_INTAKE", proceduralStage: "INTAKE" };
}

function placeholdersFromText(text) {
  const found = new Set();
  String(text || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    found.add(key.trim());
    return "";
  });
  return Array.from(found);
}

function inferFieldLabel(fieldKey) {
  return fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function extractTemplateFields(doc) {
  return placeholdersFromText(doc.text).map(fieldKey => ({
    fieldKey,
    label: inferFieldLabel(fieldKey),
    valueType: fieldKey.includes("date") ? "date" : fieldKey.includes("days") ? "number" : "text",
    required: true,
    placeholder: `{{${fieldKey}}}`,
    evidenceRequired: /medical|damages|receipt|report|police/.test(fieldKey),
    lawyerOnly: /settlement|offer|liability|quantum/.test(fieldKey),
  }));
}

function classifyFormTemplate(doc, context = {}) {
  const cls = classifyFromText(doc.title, doc.text);
  const useWhen = readUseBlock(doc.text, "Use");
  const doNotUseWhen = readUseBlock(doc.text, "Do not use");
  const id = stableId("form", [context.firmId, context.workspaceId, doc.fileRef?.sha256, doc.title]);
  const demoFixture = context.demoMode === true || /synthetic fixture only/i.test(context.sourceLicenseNote || "");
  const template = {
    id,
    firmId: context.firmId,
    workspaceId: context.workspaceId,
    formPackId: context.formPackId,
    title: doc.title,
    normalizedTitle: slugify(doc.title),
    practiceArea: cls.practiceArea,
    subPracticeArea: cls.subPracticeArea,
    jurisdiction: cls.jurisdiction,
    documentIntent: cls.documentIntent,
    proceduralStage: cls.proceduralStage,
    applicableMatterTypes: cls.applicableMatterTypes,
    applicableRoles: cls.applicableRoles,
    prerequisites: prerequisitesForIntent(cls.documentIntent),
    contraindications: contraindicationsForIntent(cls.documentIntent),
    blockedWhen: blockedWhenForIntent(cls.documentIntent),
    recommendedWhen: useWhen.length ? useWhen : recommendedWhenForIntent(cls.documentIntent),
    bodyStructured: {
      headings: headingsFromText(doc.text),
      text: doc.text,
    },
    fieldSchema: extractTemplateFields(doc),
    clauseIds: [],
    sourceFileRef: doc.fileRef,
    sourceLicenseNote: context.sourceLicenseNote,
    templateVersion: "0.1.0",
    reviewStatus: REVIEW.LAWYER_REQUIRED,
    classificationStatus: "machine_candidate",
    classificationReviewId: "",
    routingActiveInDemo: demoFixture,
    activeInRouting: false,
    demoFixture,
    proposedPracticeArea: cls.practiceArea,
    proposedDocumentIntent: cls.documentIntent,
    proposedProceduralStage: cls.proceduralStage,
    proposedMatterTypes: cls.applicableMatterTypes,
    proposedPrerequisites: prerequisitesForIntent(cls.documentIntent),
    proposedContraindications: contraindicationsForIntent(cls.documentIntent),
    classificationExtractionTrace: {
      method: "regex_keyword_machine_extraction",
      title: doc.title,
      sourceFileRef: doc.fileRef,
      confidence: 0.72,
      caveat: "Machine classification only; not lawyer-approved.",
    },
    reviewerDecision: {
      status: "pending",
      reviewer: "",
      reviewedAt: "",
      comment: "",
      approvedValues: null,
    },
    provenanceLabel: PROVENANCE.TEMPLATE_BASED,
  };
  const review = buildClassificationReview(template, doc);
  template.classificationReviewId = review.id;
  template.activeInRouting = isTemplateActiveForRouting(template);
  return template;
}

function headingsFromText(text) {
  return String(text || "").split(/\n+/).map(x => x.trim()).filter(x => x && x.length < 90 && !x.includes("{{")).slice(0, 20);
}

function prerequisitesForIntent(intent) {
  if (intent === "PROBATE_APPLICATION") return ["deathCertificate", "originalWillOrCopyWill", "executorIdentity", "estateAssetsKnown"];
  if (intent === "PROBATE_AFFIDAVIT") return ["willIssueIdentified", "deponentIdentity", "exhibitAvailable"];
  if (intent === "WILL_DRAFT") return ["testatorCapacityConfirmed", "instructionsTaken", "beneficiariesIdentified"];
  if (["CONTRACT_AGREEMENT", "LEASE_AGREEMENT", "SHAREHOLDERS_AGREEMENT"].includes(intent)) return ["partiesIdentified", "commercialTermsSettled", "authorityToDraft"];
  if (intent === "CONTRACT_CLAUSE") return ["hostAgreementIdentified", "clausePurposeKnown"];
  if (intent === "COMPANY_WINDING_UP_PETITION") return ["debtOrGroundIdentified", "companyIdentified", "standingChecked"];
  if (intent === "COMPANY_COMPLIANCE_MEMO") return ["companyIdentified", "transactionOrEventKnown"];
  if (intent === "REGULATORY_COMPLIANCE_NOTE") return ["regulatedEntityIdentified", "regulatoryIssueKnown"];
  if (intent === "LETTER_OF_CLAIM") return ["opponentIdentified", "liabilityFactsKnown"];
  if (intent === "POLICE_REPORT_REQUEST") return ["accidentDate", "accidentLocation"];
  if (intent === "MEDICAL_RECORDS_REQUEST") return ["injuryExists", "clientIdentityKnown"];
  if (COMMENCEMENT_INTENTS.has(intent)) return ["lawyerDecisionToCommence", "defendantIdentified", "limitationChecked"];
  return ["matterOpened"];
}

function contraindicationsForIntent(intent) {
  if (intent === "PROBATE_APPLICATION") return ["contentiousProbate", "foreignDomicileUnresolved", "originalWillMissingWithoutAffidavit"];
  if (intent === "PROBATE_AFFIDAVIT") return ["noPersonalKnowledge", "exhibitsUnavailable"];
  if (intent === "WILL_DRAFT") return ["capacityConcernUnresolved", "undueInfluenceConcernUnresolved"];
  if (["CONTRACT_AGREEMENT", "LEASE_AGREEMENT", "SHAREHOLDERS_AGREEMENT", "CONTRACT_CLAUSE"].includes(intent)) return ["commercialTermsUnsettled", "clientAuthorityMissing"];
  if (intent === "COMPANY_WINDING_UP_PETITION") return ["debtGenuinelyDisputed", "statutoryDemandDefectUnresolved", "standingUnclear"];
  if (intent === "COMPANY_COMPLIANCE_MEMO") return ["factsOrBoardApprovalUnclear"];
  if (intent === "REGULATORY_COMPLIANCE_NOTE") return ["regulatedStatusUnclear", "factsUnverified"];
  if (intent === "LETTER_OF_CLAIM") return ["proceedingsCommenced", "opponentUnknownForFinalVersion"];
  if (intent === "POLICE_REPORT_REQUEST") return ["policeReportAlreadyObtained"];
  if (intent === "MEDICAL_RECORDS_REQUEST") return ["fullMedicalEvidenceAlreadyReceived"];
  if (COMMENCEMENT_INTENTS.has(intent)) return ["proceedingsCommenced"];
  return [];
}

function blockedWhenForIntent(intent) {
  if (intent === "PROBATE_APPLICATION") return ["matter.contentiousProbate == true", "matter.foreignDomicileUnresolved == true"];
  if (intent === "PROBATE_AFFIDAVIT") return ["matter.deponentHasPersonalKnowledge == false"];
  if (["CONTRACT_AGREEMENT", "LEASE_AGREEMENT", "SHAREHOLDERS_AGREEMENT", "CONTRACT_CLAUSE"].includes(intent)) return ["matter.commercialTermsSettled != true blocks finalisation"];
  if (intent === "COMPANY_WINDING_UP_PETITION") return ["matter.debtGenuinelyDisputed == true", "matter.standingChecked != true"];
  if (intent === "LETTER_OF_CLAIM") return ["matter.proceedingsCommenced == true", "matter.opponentIdentified == false blocks finalisation"];
  if (COMMENCEMENT_INTENTS.has(intent)) return ["matter.proceedingsCommenced == true"];
  return [];
}

function recommendedWhenForIntent(intent) {
  if (intent === "PROBATE_APPLICATION") return ["non-contentious probate", "executor or applicant identified", "core estate documents available"];
  if (intent === "PROBATE_AFFIDAVIT") return ["probate registry requires evidence on execution, handwriting, condition, or alterations"];
  if (intent === "WILL_DRAFT") return ["testamentary instructions are taken and capacity/undue influence checks are clear"];
  if (intent === "CONTRACT_AGREEMENT") return ["commercial terms are sufficiently settled for first draft"];
  if (intent === "CONTRACT_CLAUSE") return ["host agreement exists and clause objective is identified"];
  if (intent === "LEASE_AGREEMENT") return ["lease heads of terms are agreed"];
  if (intent === "SHAREHOLDERS_AGREEMENT") return ["joint venture/shareholding structure is known"];
  if (intent === "COMPANY_WINDING_UP_PETITION") return ["debt or statutory ground identified and standing checked"];
  if (intent === "COMPANY_COMPLIANCE_MEMO") return ["company event or transaction requires compliance steps"];
  if (intent === "REGULATORY_COMPLIANCE_NOTE") return ["regulated entity or listed-company issue requires compliance triage"];
  if (intent === "LETTER_OF_CLAIM") return ["pre-action stage", "opponent or insurer identified", "liability facts sufficiently known"];
  if (intent === "POLICE_REPORT_REQUEST") return ["opponent unknown", "police report missing", "road traffic accident"];
  if (intent === "MEDICAL_RECORDS_REQUEST") return ["injury exists", "medical evidence incomplete"];
  if (COMMENCEMENT_INTENTS.has(intent)) return ["lawyer decides to commence", "proceedings not commenced"];
  return ["matter opened"];
}

function clauseTypeForHeading(heading) {
  const h = heading.toLowerCase();
  if (/special damages|receipt|invoice/.test(h)) return "SPECIAL_DAMAGES";
  if (/medical/.test(h)) return "MEDICAL_EVIDENCE";
  if (/liability|negligence|collision/.test(h)) return "LIABILITY_ALLEGATION";
  if (/settlement|proposal|offer/.test(h)) return "SETTLEMENT_PROPOSAL";
  if (/police|traffic accident record/.test(h)) return "POLICE_REPORT_REQUEST";
  if (/client|party|parties|plaintiff|defendant|patient/.test(h)) return "PARTY_DESCRIPTION";
  if (/purpose|request|records requested/.test(h)) return "DOCUMENT_REQUEST";
  return "BACKGROUND_FACTS";
}

function extractClauseSnippets(template) {
  const rawText = template.bodyStructured?.text || "";
  const parts = [];
  let current = { heading: "Opening", lines: [] };
  for (const line of rawText.split(/\n+/)) {
    const clean = line.trim();
    if (!clean) continue;
    const looksHeading = clean.length < 90 && !/[.!?]$/.test(clean) && !clean.includes("{{") && !/^use when|^do not use/i.test(clean) && !/^synthetic fixture/i.test(clean);
    if (looksHeading && current.lines.length) {
      parts.push(current);
      current = { heading: clean, lines: [] };
    } else if (looksHeading && !current.lines.length) {
      current.heading = clean;
    } else {
      current.lines.push(clean);
    }
  }
  if (current.lines.length) parts.push(current);
  return parts.map((part, index) => {
    const text = part.lines.join("\n");
    const clauseType = clauseTypeForHeading(part.heading);
    const id = stableId("clause", [template.id, part.heading, text]);
    return {
      id,
      templateId: template.id,
      clauseKey: `${template.normalizedTitle}.${slugify(part.heading)}`,
      heading: part.heading,
      text,
      normalizedText: normaliseText(text).toLowerCase(),
      clauseType,
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      issueTags: issueTagsForClause(template, clauseType),
      factRequirements: factRequirementsForClause(clauseType),
      fieldRequirements: placeholdersFromText(text),
      useWhen: useWhenForClause(template, clauseType),
      doNotUseWhen: doNotUseWhenForClause(template, clauseType),
      alternatives: alternativesForClause(template, clauseType),
      risks: risksForClause(clauseType),
      sourceLocation: {
        sourceFileRef: template.sourceFileRef?.relativePath || template.sourceFileRef?.fileName || "",
        heading: part.heading,
        ordinal: index + 1,
      },
      notebooklmUsageNoteIds: [],
      lawyerReviewStatus: "unreviewed",
      reviewStatus: REVIEW.LAWYER_REQUIRED,
      provenanceLabel: PROVENANCE.TEMPLATE_BASED,
    };
  });
}

function issueTagsForClause(template, clauseType) {
  return Array.from(new Set([template.practiceArea, template.subPracticeArea, template.documentIntent, clauseType].filter(Boolean).map(slugify)));
}

function factRequirementsForClause(clauseType) {
  if (clauseType === "SPECIAL_DAMAGES") return ["specialDamagesEvidenceAvailable"];
  if (clauseType === "MEDICAL_EVIDENCE") return ["medicalEvidenceReceived"];
  if (clauseType === "POLICE_REPORT_REQUEST") return ["accidentDate", "accidentLocation"];
  if (clauseType === "LIABILITY_ALLEGATION") return ["liabilityFactsKnown"];
  return [];
}

function useWhenForClause(template, clauseType) {
  if (clauseType === "SPECIAL_DAMAGES") return ["receipts, pay slips, medical bills, or other supporting documents are available"];
  if (clauseType === "MEDICAL_EVIDENCE") return ["medical evidence exists or is being requested"];
  if (clauseType === "POLICE_REPORT_REQUEST") return ["police report or opponent identity is missing"];
  return template.recommendedWhen || [];
}

function doNotUseWhenForClause(template, clauseType) {
  if (clauseType === "SPECIAL_DAMAGES") return ["supporting evidence for the figures is missing"];
  if (clauseType === "MEDICAL_EVIDENCE") return ["medical position is complete and already summarised elsewhere"];
  return template.contraindications || [];
}

function alternativesForClause(template, clauseType) {
  if (clauseType === "SPECIAL_DAMAGES") return ["insert placeholder and evidence task"];
  if (template.documentIntent === "WRIT") return ["SUMMONS", "AMENDED_PLEADING", "CONSENT_ORDER"];
  return [];
}

function risksForClause(clauseType) {
  if (clauseType === "SPECIAL_DAMAGES") return ["Do not invent figures; require supporting documents."];
  if (clauseType === "SETTLEMENT_PROPOSAL") return ["Settlement authority and lawyer decision required."];
  return [];
}

function inferClauseUsageRules(clauses) {
  const rules = [];
  for (const clause of clauses) {
    rules.push({
      id: stableId("rule", [clause.id, "use"]),
      clauseId: clause.id,
      ruleType: "USE_WHEN",
      conditionExpression: expressionForUse(clause),
      naturalLanguageCondition: (clause.useWhen || [])[0] || "Use only when document intent and stage match.",
      examplesUse: clause.useWhen || [],
      examplesDoNotUse: clause.doNotUseWhen || [],
      requiredFacts: clause.factRequirements || [],
      blockingMissingFacts: clause.factRequirements || [],
      notebooklmUsageNoteIds: clause.notebooklmUsageNoteIds || [],
      publicAuthorityIds: [],
      firmSopStepIds: [],
      priority: 50,
      confidence: 0.72,
      reviewStatus: REVIEW.LAWYER_REQUIRED,
    });
    if (clause.clauseType === "SPECIAL_DAMAGES") {
      rules.push({
        id: stableId("rule", [clause.id, "missing-evidence"]),
        clauseId: clause.id,
        ruleType: "BLOCK_IF_EVIDENCE_MISSING",
        conditionExpression: "matter.specialDamagesEvidenceAvailable != true",
        naturalLanguageCondition: "Block final special-damages wording until supporting evidence is available.",
        examplesUse: ["Receipts or pay slips uploaded"],
        examplesDoNotUse: ["Client has not provided receipts or wage evidence"],
        requiredFacts: ["specialDamagesEvidenceAvailable"],
        blockingMissingFacts: ["specialDamagesEvidenceAvailable"],
        notebooklmUsageNoteIds: clause.notebooklmUsageNoteIds || [],
        publicAuthorityIds: [],
        firmSopStepIds: [],
        priority: 90,
        confidence: 0.86,
        reviewStatus: REVIEW.LAWYER_REQUIRED,
      });
    }
  }
  return rules;
}

function expressionForUse(clause) {
  if (clause.documentIntent === "LETTER_OF_CLAIM") return "matter.proceedingsCommenced != true";
  if (clause.documentIntent === "WRIT") return "matter.proceedingsCommenced != true && matter.lawyerDecisionToCommence == true";
  if (clause.clauseType === "MEDICAL_EVIDENCE") return "matter.injuryExists == true";
  return "structured_filters_match == true";
}

function parseNotebooklmNotes(markdown, sourceNotebook = "notebooklm") {
  const text = normaliseText(markdown);
  if (!text) return [];
  const sections = text.split(/\n(?=# )/).filter(Boolean);
  return sections.map((section, idx) => {
    const title = (section.match(/^#\s+(.+)$/m) || [])[1] || `NotebookLM note ${idx + 1}`;
    return {
      id: stableId("note", [sourceNotebook, title, section]),
      sourceNotebook,
      noteTitle: title.trim(),
      noteText: section,
      relatedTemplateIds: [],
      relatedClauseIds: [],
      templateLinks: [],
      clauseLinks: [],
      note_template_link_status: "candidate",
      note_clause_link_status: "candidate",
      suggestedUseWhen: markdownListAfter(section, "Use when"),
      suggestedDoNotUseWhen: markdownListAfter(section, "Do not use when"),
      suggestedWorkflowStage: inferStageFromText(section),
      suggestedMatterType: /road traffic|motor accident|vehicle|car/i.test(section) ? "road_traffic_pi" : "",
      confidence: /\[VERIFY\]/.test(section) ? 0.55 : 0.7,
      status: /\[VERIFY\]/.test(section) ? "verification_required" : "candidate_usage_note",
      reviewerComment: "",
      provenanceLabel: PROVENANCE.INTERNAL_USAGE_NOTE,
    };
  });
}

function markdownListAfter(text, heading) {
  const re = new RegExp(`##\\\\s+${heading}\\\\s*\\\\n([\\\\s\\\\S]*?)(?=\\\\n##\\\\s+|\\\\n#\\\\s+|$)`, "i");
  const match = text.match(re);
  if (!match) return [];
  return match[1].split(/\n/).map(line => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

function inferStageFromText(text) {
  const t = String(text || "").toLowerCase();
  if (/pre-action|letter of claim|settlement demand/.test(t)) return "PRE_ACTION_CORRESPONDENCE";
  if (/medical/.test(t)) return "MEDICAL_EVIDENCE";
  if (/police|opponent|insurer|cctv/.test(t)) return "URGENT_ACTIONS";
  if (/proceedings|writ|commence/.test(t)) return "COMMENCEMENT";
  return "INTAKE";
}

function linkNotebooklmUsageNotes(templates, clauses, notes) {
  for (const note of notes) {
    const noteTokens = new Set(tokenize(`${note.noteTitle} ${note.noteText}`));
    for (const template of templates) {
      const overlap = tokenize(`${template.title} ${template.documentIntent} ${template.proceduralStage}`).filter(t => noteTokens.has(t));
      if (overlap.length || note.suggestedWorkflowStage === template.proceduralStage) {
        note.relatedTemplateIds.push(template.id);
        note.templateLinks = note.templateLinks || [];
        note.templateLinks.push({
          templateId: template.id,
          note_template_link_status: "candidate",
          reason: overlap.length ? `token_overlap:${overlap.slice(0, 6).join(",")}` : "workflow_stage_match",
        });
      }
    }
    for (const clause of clauses) {
      const overlap = tokenize(`${clause.heading} ${clause.clauseType} ${clause.text}`).filter(t => noteTokens.has(t));
      if (overlap.length >= 1) {
        note.relatedClauseIds.push(clause.id);
        note.clauseLinks = note.clauseLinks || [];
        note.clauseLinks.push({
          clauseId: clause.id,
          note_clause_link_status: "candidate",
          reason: `token_overlap:${overlap.slice(0, 6).join(",")}`,
        });
        clause.notebooklmUsageNoteIds = Array.from(new Set([...(clause.notebooklmUsageNoteIds || []), note.id]));
        clause.notebooklmUsageLinks = Array.from(new Map([
          ...(clause.notebooklmUsageLinks || []),
          { noteId: note.id, note_clause_link_status: "candidate", reason: `token_overlap:${overlap.slice(0, 6).join(",")}` },
        ].map(link => [link.noteId, link])).values());
      }
    }
  }
  return { templates, clauses, notes };
}

function buildPrivateFormIndex(store) {
  const records = [];
  for (const template of store.templates || []) {
    records.push({
      recordId: `template:${template.id}`,
      kind: "template",
      templateId: template.id,
      text: [
        template.title,
        template.practiceArea,
        template.documentIntent,
        template.proceduralStage,
        ...(template.recommendedWhen || []),
        ...(template.prerequisites || []),
      ].join(" "),
      filters: {
        firmId: template.firmId,
        workspaceId: template.workspaceId,
        practiceArea: template.practiceArea,
        matterTypes: template.applicableMatterTypes || [],
        documentIntent: template.documentIntent,
        workflowStage: template.proceduralStage,
        reviewStatus: template.reviewStatus,
      },
      provenanceLabel: PROVENANCE.TEMPLATE_BASED,
    });
  }
  for (const clause of store.clauses || []) {
    records.push({
      recordId: `clause:${clause.id}`,
      kind: "clause",
      clauseId: clause.id,
      templateId: clause.templateId,
      text: [clause.heading, clause.text, clause.clauseType, ...(clause.useWhen || [])].join(" "),
      filters: {
        documentIntent: clause.documentIntent,
        workflowStage: clause.proceduralStage,
        clauseType: clause.clauseType,
        issueTags: clause.issueTags || [],
      },
      provenanceLabel: PROVENANCE.TEMPLATE_BASED,
    });
  }
  return {
    indexVersion: "forms-as-code-snippets-mvp-1",
    retrievalPolicy: "structured_filters_before_keyword_or_vector",
    vectorOnlyAllowed: false,
    records,
  };
}

function writePrivateFormStore(outputDir, store) {
  fs.mkdirSync(outputDir, { recursive: true });
  const files = {
    "form_pack_manifest.json": store.formPack,
    "form_templates.json": store.templates,
    "form_classification_reviews.json": store.classificationReviews || [],
    "clause_snippets.json": store.clauses,
    "clause_usage_rules.json": store.usageRules,
    "notebooklm_usage_notes.json": store.notebooklmUsageNotes || [],
    "form_routing_rules.json": store.routingRules || defaultFormRoutingRules(),
    "private_form_index.json": store.privateFormIndex || buildPrivateFormIndex(store),
  };
  for (const [name, value] of Object.entries(files)) writeJson(path.join(outputDir, name), value);
  return Object.keys(files).map(name => path.join(outputDir, name));
}

function defaultFormRoutingRules() {
  return [
    {
      id: "gate_no_writ_after_commencement",
      ruleType: "BLOCK_IF_STAGE_PASSED",
      documentIntent: "WRIT",
      workflowStage: "COMMENCEMENT",
      conditionExpression: "matter.proceedingsCommenced == true",
      outcome: "block",
      message: "Proceedings have already commenced; do not suggest a new writ.",
      provenanceLabel: PROVENANCE.FIRM_SOP,
    },
    {
      id: "gate_letter_final_opponent_unknown",
      ruleType: "BLOCK_IF_OPPONENT_UNKNOWN",
      documentIntent: "LETTER_OF_CLAIM",
      workflowStage: "PRE_ACTION_CORRESPONDENCE",
      conditionExpression: "matter.opponentIdentified != true",
      outcome: "block_finalisation",
      message: "Letter of claim may be drafted as incomplete, but finalisation is blocked until opponent or insurer is identified.",
      provenanceLabel: PROVENANCE.FIRM_SOP,
    },
    {
      id: "gate_quantum_medical_missing",
      ruleType: "BLOCK_IF_EVIDENCE_MISSING",
      documentIntent: "LETTER_OF_CLAIM",
      workflowStage: "PRE_ACTION_CORRESPONDENCE",
      conditionExpression: "matter.medicalEvidenceReceived != true",
      outcome: "placeholder_only",
      message: "Quantum and medical-evidence sections must remain placeholders until medical evidence is received.",
      provenanceLabel: PROVENANCE.FIRM_SOP,
    },
  ];
}

function ingestPrivateFormPack(options) {
  const {
    input,
    firm,
    workspace,
    sourcePack,
    licenseNote,
    notebooklmNotes,
    output,
    uploadedBy = "local-user",
    demoMode = false,
    uploadedAt = "",
  } = options;
  if (!input) throw new Error("--input is required");
  if (!firm) throw new Error("--firm is required");
  if (!workspace) throw new Error("--workspace is required");
  if (!sourcePack) throw new Error("--source-pack is required");
  if (!licenseNote) throw new Error("--license-note is required for private precedent ingestion");
  if (!output) throw new Error("--output is required");
  const inventory = inventoryFormPack(input);
  if (inventory.some(item => item.rejected)) {
    throw new Error(`Rejected suspicious files: ${inventory.filter(item => item.rejected).map(item => item.relativePath).join(", ")}`);
  }
  const packHash = sha256Text(inventory.map(item => `${item.relativePath}:${item.sha256}`).join("|"));
  const formPackId = stableId("pack", [firm, workspace, sourcePack, packHash]);
  const formPack = {
    id: formPackId,
    firmId: firm,
    workspaceId: workspace,
    sourcePackName: sourcePack,
    uploadHash: packHash,
    uploadedAt: uploadedAt || (demoMode ? "2026-07-06T00:00:00.000Z" : new Date().toISOString()),
    uploadedBy,
    sourceLicenseNote: licenseNote,
    visibility: "FIRM_PRIVATE",
    fileInventory: inventory,
    ingestionStatus: "extracted_classified_indexed",
    extractionWarnings: [],
    reviewStatus: REVIEW.LAWYER_REQUIRED,
  };
  const noteAbs = notebooklmNotes ? path.resolve(notebooklmNotes) : "";
  const inputAbs = path.resolve(input);
  const docs = extractFormDocuments(input, inventory).filter(doc => {
    if (!noteAbs) return true;
    const rel = doc.fileRef?.relativePath || "";
    const candidate = fs.existsSync(inputAbs) && fs.statSync(inputAbs).isDirectory()
      ? path.resolve(inputAbs, rel)
      : "";
    return candidate !== noteAbs && path.resolve(rel) !== noteAbs && path.basename(rel) !== path.basename(noteAbs);
  });
  const templates = [];
  const clauses = [];
  const classificationReviews = [];
  for (const doc of docs) {
    const template = classifyFormTemplate(doc, {
      firmId: firm,
      workspaceId: workspace,
      formPackId,
      sourceLicenseNote: licenseNote,
      demoMode,
    });
    const review = buildClassificationReview(template, doc);
    template.classificationReviewId = review.id;
    const templateClauses = extractClauseSnippets(template);
    template.clauseIds = templateClauses.map(clause => clause.id);
    templates.push(template);
    clauses.push(...templateClauses);
    classificationReviews.push(review);
  }
  let notes = [];
  if (notebooklmNotes && fs.existsSync(notebooklmNotes)) {
    notes = parseNotebooklmNotes(fs.readFileSync(notebooklmNotes, "utf8"), path.basename(notebooklmNotes));
  }
  linkNotebooklmUsageNotes(templates, clauses, notes);
  const usageRules = inferClauseUsageRules(clauses);
  const store = {
    formPack,
    templates,
    classificationReviews,
    clauses,
    usageRules,
    notebooklmUsageNotes: notes,
    routingRules: defaultFormRoutingRules(),
  };
  store.privateFormIndex = buildPrivateFormIndex(store);
  writePrivateFormStore(output, store);
  return {
    ...store,
    privateStorePath: output,
    manifest: {
      formPack,
      templates,
      classificationReviews,
      clauses,
      usageRules,
      notebooklmUsageNotes: notes,
      privateStorePath: output,
      warnings: docs.flatMap(doc => doc.extractionWarnings || []),
    },
  };
}

function loadFormStore(storePath) {
  const base = storePath || process.env.PRIVATE_FORM_STORE_PATH || path.join(process.cwd(), "fixtures", "forms", "synthetic_store");
  const readMaybe = (file, fallback) => {
    const p = path.join(base, file);
    return fs.existsSync(p) ? readJson(p) : fallback;
  };
  return {
    basePath: base,
    formPack: readMaybe("form_pack_manifest.json", null),
    templates: readMaybe("form_templates.json", []),
    classificationReviews: readMaybe("form_classification_reviews.json", []),
    clauses: readMaybe("clause_snippets.json", []),
    usageRules: readMaybe("clause_usage_rules.json", []),
    notebooklmUsageNotes: readMaybe("notebooklm_usage_notes.json", []),
    routingRules: readMaybe("form_routing_rules.json", defaultFormRoutingRules()),
    privateFormIndex: readMaybe("private_form_index.json", { records: [] }),
  };
}

function inferMatterFromQuery(query) {
  const q = String(query || "").toLowerCase();
  const roadVehicle = /\b(traffic|car|vehicle|road)\b/.test(q);
  const probate = /\b(probate|letters of administration|grant of probate|executor|administrator|estate|will drafting|draft.*will)\b/.test(q);
  const companyWinding = /\b(winding up|winding-up|liquidation|insolvency|statutory demand|creditor.?s petition|petition to wind|wind up)\b/.test(q);
  const company = companyWinding || /\b(company|companies|corporate|director|shareholder|board|originating summons|companies ordinance)\b/.test(q);
  const contract = /\b(contract|agreement|consultancy|lease|shareholders.? agreement|joint venture|clause|commercial terms|supply of it equipment|purchase of it equipment)\b/.test(q);
  const financialReg = /\b(sfc|securities|futures|listing rules|market misconduct|regulated activity|financial regulatory)\b/.test(q);
  const pi = /\binjur|accident|medical|police|writ|claim letter|letter of claim/.test(q) || roadVehicle;
  return {
    practiceArea: pi ? "personal_injury" : probate ? "probate" : company ? "company_corporate" : financialReg ? "financial_regulatory" : contract ? "commercial_contracts" : "",
    matterType: roadVehicle ? "road_traffic_pi" : probate ? "probate_grant" : companyWinding ? "company_winding_up" : company ? "company_general" : financialReg ? "financial_regulatory" : contract ? "commercial_contract" : "",
    workflowStage: companyWinding ? "COMPANY_WINDING_UP" : /writ|commence|proceedings/.test(q) ? "COMMENCEMENT" : /letter|claim|demand/.test(q) ? "PRE_ACTION_CORRESPONDENCE" : /medical/.test(q) ? "MEDICAL_EVIDENCE" : /police|opponent|insurer/.test(q) ? "URGENT_ACTIONS" : contract ? "TRANSACTIONAL_DRAFTING" : probate ? "PROBATE_APPLICATION" : financialReg ? "REGULATORY_COMPLIANCE" : "",
    documentIntent: companyWinding ? "COMPANY_WINDING_UP_PETITION" : /writ/.test(q) ? "WRIT" : /letter of claim|claim letter|demand/.test(q) ? "LETTER_OF_CLAIM" : /medical/.test(q) ? "MEDICAL_RECORDS_REQUEST" : /police/.test(q) ? "POLICE_REPORT_REQUEST" : /shareholders.? agreement|joint venture/.test(q) ? "SHAREHOLDERS_AGREEMENT" : /lease/.test(q) ? "LEASE_AGREEMENT" : /clause/.test(q) && contract ? "CONTRACT_CLAUSE" : contract ? "CONTRACT_AGREEMENT" : /affidavit|affirmation/.test(q) && probate ? "PROBATE_AFFIDAVIT" : /will drafting|draft.*will/.test(q) ? "WILL_DRAFT" : probate ? "PROBATE_APPLICATION" : financialReg ? "REGULATORY_COMPLIANCE_NOTE" : "",
    clientRole: "claimant",
    proceedingsCommenced: /already commenced|proceedings commenced|action commenced/.test(q),
    opponentIdentified: /opponent identified|insurer identified|defendant known/.test(q),
    policeReportObtained: /police report received|police report obtained/.test(q),
    injuryExists: /injur|medical|hurt/.test(q),
    medicalEvidenceReceived: /medical record received|medical report received|medical evidence received/.test(q),
    specialDamagesEvidenceAvailable: /receipt|invoice|pay slip|special damages evidence/.test(q),
    liabilityFactsKnown: /hit|crash|collided|driver/.test(q),
  };
}

function isFormsIntentQuery(query) {
  const q = String(query || "").toLowerCase();
  if (!q.trim()) return false;
  return /\b(form|forms|precedent|precedents|template|templates|draft|drafting|letter of claim|claim letter|writ|clause|clauses|document|which form|use this clause|generate|prepare)\b/.test(q);
}

function scoreRecord(query, record) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;
  const rTokens = new Set(tokenize(record.text));
  return qTokens.filter(t => rTokens.has(t)).length / qTokens.length;
}

function templateEligibleByStructuredFilters(template, matter, documentIntent) {
  if (!isTemplateActiveForRouting(template, { allowDemoCandidates: matter.allowDemoCandidates === true })) return false;
  if (matter.practiceArea && template.practiceArea !== matter.practiceArea) return false;
  if (
    matter.matterType &&
    Array.isArray(template.applicableMatterTypes) &&
    template.applicableMatterTypes.length &&
    !template.applicableMatterTypes.includes("general_matter") &&
    !template.applicableMatterTypes.includes(matter.matterType)
  ) return false;
  if (
    matter.clientRole &&
    Array.isArray(template.applicableRoles) &&
    template.applicableRoles.length &&
    !template.applicableRoles.includes(matter.clientRole)
  ) return false;
  if (documentIntent && template.documentIntent !== documentIntent) return false;
  if (matter.workflowStage && template.proceduralStage !== matter.workflowStage) {
    if (!(matter.workflowStage === "URGENT_ACTIONS" && ["POLICE_REPORT_REQUEST", "MEDICAL_RECORDS_REQUEST"].includes(template.documentIntent))) return false;
  }
  if (template.reviewStatus === "rejected") return false;
  return true;
}

function proceduralBlocksForTemplate(template, matter) {
  const blocks = [];
  if (isTruthyValue(matter.consentOrderAgreed) && COMMENCEMENT_INTENTS.has(template.documentIntent)) {
    blocks.push({
      gateId: "gate_consent_route_not_new_commencement",
      severity: "block",
      reason: "A consent route appears available; do not recommend a fresh commencement form for this stage.",
      alternatives: ["CONSENT_SUMMONS", "CONSENT_ORDER", "DRAFT_ORDER"],
    });
  }
  if (
    (isTruthyValue(matter.proceedingsCommenced) || isTruthyValue(matter.companyInExistingProcedure)) &&
    COMMENCEMENT_INTENTS.has(template.documentIntent)
  ) {
    blocks.push({
      gateId: "gate_no_writ_after_commencement",
      severity: "block",
      reason: "Proceedings have already commenced; commencement forms are not recommended.",
      alternatives: ["AMENDED_PLEADING", "SUMMONS", "CONSENT_ORDER"],
    });
  }
  if (template.documentIntent === "COMPANY_WINDING_UP_PETITION") {
    const required = [
      ["companyIdentified", "Company identity is required before a winding-up petition can be prepared."],
      ["debtOrGroundIdentified", "Debt or statutory ground must be identified before finalising a winding-up petition."],
      ["standingChecked", "Creditor/member standing must be checked before finalising a winding-up petition."],
      ["statutoryDemandOrServiceEvidenceAvailable", "Statutory demand/service evidence is missing; keep petition drafting as placeholder-only."],
    ];
    for (const [fact, reason] of required) {
      if (!isTruthyValue(matter[fact])) {
        blocks.push({
          gateId: `gate_company_winding_up_${fact}`,
          severity: fact === "statutoryDemandOrServiceEvidenceAvailable" ? "placeholder_only" : "block_finalisation",
          reason,
          missingFact: fact,
          alternatives: ["EVIDENCE_CHECKLIST", "COMPANY_COMPLIANCE_MEMO"],
        });
      }
    }
  }
  if (["COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION", "COMPANY_PROVISIONAL_LIQUIDATOR_AFFIDAVIT"].includes(template.documentIntent)) {
    const required = [
      ["companyIdentified", "Company identity is required before a provisional liquidator application workflow can be prepared."],
      ["standingChecked", "Standing must be checked before finalising a provisional liquidator application workflow."],
      ["urgencyGroundsIdentified", "Urgency grounds must be identified before finalising a provisional liquidator application workflow."],
      ["assetRiskEvidenceAvailable", "Asset dissipation/risk evidence is missing; keep provisional liquidator drafting as placeholder-only."],
    ];
    for (const [fact, reason] of required) {
      if (!isTruthyValue(matter[fact])) {
        blocks.push({
          gateId: `gate_provisional_liquidator_${fact}`,
          severity: fact === "assetRiskEvidenceAvailable" ? "placeholder_only" : "block_finalisation",
          reason,
          missingFact: fact,
          alternatives: ["EVIDENCE_CHECKLIST", "COMPANY_COMPLIANCE_MEMO"],
        });
      }
    }
    if (isTruthyValue(matter.voluntaryWindingUpOnly)) {
      blocks.push({
        gateId: "gate_provisional_liquidator_wrong_winding_up_path",
        severity: "block",
        reason: "Voluntary winding-up-only facts do not support this provisional liquidator route.",
        alternatives: ["COMPANY_VOLUNTARY_WINDING_UP_MEMO"],
      });
    }
  }
  if (["FAMILY_SERVICE_ACKNOWLEDGMENT", "FAMILY_SERVICE_AFFIRMATION", "FAMILY_SERVICE_INSTRUCTIONS"].includes(template.documentIntent)) {
    const required = [
      ["proceedingsIssued", "Proceedings must be issued before service documents are finalised."],
      ["respondentIdentified", "Respondent identity must be known before service documents are finalised."],
      ["serviceAddressKnown", "Service address/location is missing; keep service drafting as placeholder-only."],
      ["serviceMethodSelected", "Service method must be selected before service documents are finalised."],
    ];
    for (const [fact, reason] of required) {
      if (!isTruthyValue(matter[fact])) {
        blocks.push({
          gateId: `gate_family_service_${fact}`,
          severity: fact === "serviceAddressKnown" ? "placeholder_only" : "block_finalisation",
          reason,
          missingFact: fact,
          alternatives: ["FAMILY_SERVICE_INSTRUCTIONS", "EVIDENCE_CHECKLIST"],
        });
      }
    }
    if (isTruthyValue(matter.postTrialStage)) {
      blocks.push({
        gateId: "gate_family_service_post_trial_wrong_stage",
        severity: "block",
        reason: "Post-trial facts do not support the service-stage document route.",
        alternatives: ["FAMILY_POST_TRIAL_DIRECTIONS"],
      });
    }
  }
  if (template.documentIntent === "LETTER_OF_CLAIM" && !isTruthyValue(matter.opponentIdentified)) {
    blocks.push({
      gateId: "gate_letter_final_opponent_unknown",
      severity: "block_finalisation",
      reason: "Opponent/insurer is unknown, so finalising the letter of claim is blocked. An incomplete working draft is allowed.",
      alternatives: ["POLICE_REPORT_REQUEST", "EVIDENCE_CHECKLIST"],
    });
  }
  if (template.documentIntent === "LETTER_OF_CLAIM" && !isTruthyValue(matter.medicalEvidenceReceived)) {
    blocks.push({
      gateId: "gate_quantum_medical_missing",
      severity: "placeholder_only",
      reason: "Medical evidence is incomplete; quantum sections must remain placeholders.",
      alternatives: ["MEDICAL_RECORDS_REQUEST"],
    });
  }
  return blocks;
}

function clauseBlockedReasons(clause, matter) {
  const blocks = [];
  if (clause.clauseType === "SPECIAL_DAMAGES" && !isTruthyValue(matter.specialDamagesEvidenceAvailable)) {
    blocks.push("Special damages evidence is missing; use placeholder and evidence task only.");
  }
  if (clause.clauseType === "MEDICAL_EVIDENCE" && !isTruthyValue(matter.medicalEvidenceReceived)) {
    blocks.push("Medical evidence is missing or incomplete; do not finalise this clause.");
  }
  if (clause.documentIntent === "WRIT" && isTruthyValue(matter.proceedingsCommenced)) {
    blocks.push("Proceedings have already commenced; writ clauses are blocked.");
  }
  if (
    ["COMPANY_PROVISIONAL_LIQUIDATOR_APPLICATION", "COMPANY_PROVISIONAL_LIQUIDATOR_AFFIDAVIT"].includes(clause.documentIntent) &&
    isTruthyValue(matter.voluntaryWindingUpOnly)
  ) {
    blocks.push("Voluntary winding-up-only facts block provisional liquidator clauses.");
  }
  if (
    ["FAMILY_SERVICE_ACKNOWLEDGMENT", "FAMILY_SERVICE_AFFIRMATION", "FAMILY_SERVICE_INSTRUCTIONS"].includes(clause.documentIntent) &&
    isTruthyValue(matter.postTrialStage)
  ) {
    blocks.push("Post-trial facts block family service clauses.");
  }
  for (const req of clause.factRequirements || []) {
    if (matter[req] === false || matter[req] === undefined || matter[req] === null || matter[req] === "") {
      blocks.push(`Missing required fact: ${req}`);
    }
  }
  return Array.from(new Set(blocks));
}

function routeForms({ store = loadFormStore(), matter = {}, query = "", documentIntent = "", workflowStage = "" }) {
  const enrichedMatter = { ...inferMatterFromQuery(query), ...matter };
  const hasStructuredFormContext = !!(
    documentIntent ||
    workflowStage ||
    enrichedMatter.documentIntent ||
    enrichedMatter.workflowStage ||
    enrichedMatter.practiceArea ||
    enrichedMatter.matterType
  );
  if (query && !isFormsIntentQuery(query) && !hasStructuredFormContext) {
    return {
      recommendedForms: [],
      blockedForms: [],
      alternativeForms: [],
      missingFacts: [],
      requiredEvidence: [],
      applicableClauses: [],
      blockedClauses: [],
      notebooklmUsageNotes: [],
      provenance: [],
      retrievalPolicy: {
        structuredFiltersFirst: true,
        keywordAfterStructuredFilters: false,
        vectorOnlyAllowed: false,
        abstainedBecauseNoFormsIntent: true,
      },
    };
  }
  if (workflowStage) enrichedMatter.workflowStage = workflowStage;
  const intent = documentIntent || enrichedMatter.documentIntent || "";
  const q = query || [intent, enrichedMatter.workflowStage, enrichedMatter.matterType].filter(Boolean).join(" ");
  const structuredCandidates = (store.templates || []).filter(t => templateEligibleByStructuredFilters(t, enrichedMatter, intent));
  const ranked = structuredCandidates
    .map(template => ({ template, keywordScore: scoreRecord(q, { text: [template.title, template.documentIntent, template.proceduralStage, ...(template.recommendedWhen || [])].join(" ") }) }))
    .sort((a, b) => b.keywordScore - a.keywordScore);
  const recommendedForms = [];
  const blockedForms = [];
  const alternativeForms = [];
  const missingFacts = new Set();
  const requiredEvidence = new Set();
  for (const { template, keywordScore } of ranked) {
    const blocks = proceduralBlocksForTemplate(template, enrichedMatter);
    const severeBlock = blocks.find(b => b.severity === "block");
    if (severeBlock) {
      blockedForms.push({ template, blockedBy: blocks, keywordScore });
      for (const alt of severeBlock.alternatives || []) alternativeForms.push({ documentIntent: alt, reason: severeBlock.reason });
      continue;
    }
  for (const block of blocks) {
    if (block.severity === "block_finalisation") missingFacts.add("opponentIdentified");
    if (block.severity === "placeholder_only" && !block.missingFact) requiredEvidence.add("medicalEvidenceReceived");
    if (block.missingFact) missingFacts.add(block.missingFact);
    if (block.severity === "placeholder_only" && block.missingFact) requiredEvidence.add(block.missingFact);
    for (const alt of block.alternatives || []) alternativeForms.push({ documentIntent: alt, reason: block.reason });
  }
    recommendedForms.push({
      template,
      caveats: blocks,
      keywordScore,
      retrievalTrace: {
        structuredFilterApplied: true,
        keywordScoringAfterStructuredFilter: true,
        vectorOnly: false,
      },
    });
  }
  const candidateTemplateIds = new Set(recommendedForms.map(item => item.template.id));
  const applicableClauses = [];
  const blockedClauses = [];
  for (const clause of store.clauses || []) {
    if (!candidateTemplateIds.has(clause.templateId)) continue;
    const reasons = clauseBlockedReasons(clause, enrichedMatter);
    if (reasons.length) {
      blockedClauses.push({ clause, reasons });
      for (const req of clause.factRequirements || []) missingFacts.add(req);
      if (/evidence|medical|damages/i.test(reasons.join(" "))) {
        for (const req of clause.factRequirements || []) requiredEvidence.add(req);
        if (!(clause.factRequirements || []).length) requiredEvidence.add(clause.clauseType);
      }
    } else {
      applicableClauses.push(clause);
    }
  }
  return {
    recommendedForms,
    blockedForms,
    alternativeForms: dedupeBy(alternativeForms, x => `${x.documentIntent}:${x.reason}`),
    missingFacts: Array.from(missingFacts),
    requiredEvidence: Array.from(requiredEvidence),
    applicableClauses,
    blockedClauses,
    notebooklmUsageNotes: store.notebooklmUsageNotes || [],
    provenance: [
      PROVENANCE.TEMPLATE_BASED,
      PROVENANCE.INTERNAL_USAGE_NOTE,
      PROVENANCE.FIRM_SOP,
      PROVENANCE.AI_SUGGESTED,
    ],
    retrievalPolicy: {
      structuredFiltersFirst: true,
      keywordAfterStructuredFilters: true,
      vectorOnlyAllowed: false,
    },
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function searchForms({ store = loadFormStore(), query = "", filters = {} }) {
  const matter = { ...inferMatterFromQuery(query), ...filters };
  const result = routeForms({ store, matter, query, documentIntent: filters.documentIntent || matter.documentIntent || "", workflowStage: filters.workflowStage || matter.workflowStage || "" });
  return {
    query,
    filters: matter,
    results: result.recommendedForms.map(item => item.template),
    blocked: result.blockedForms,
    retrievalPolicy: result.retrievalPolicy,
  };
}

function recommendClauses({ store = loadFormStore(), matter = {}, query = "", documentIntent = "" }) {
  const result = routeForms({ store, matter, query, documentIntent });
  return {
    applicableClauses: result.applicableClauses,
    blockedClauses: result.blockedClauses,
    missingFacts: result.missingFacts,
    requiredEvidence: result.requiredEvidence,
    provenance: result.provenance,
  };
}

function matterValueForField(matter, fieldKey) {
  if (Object.prototype.hasOwnProperty.call(matter, fieldKey)) return matter[fieldKey];
  const aliases = {
    client_name: "clientName",
    accident_date: "accidentDate",
    accident_location: "accidentLocation",
    medical_report_summary: "medicalReportSummary",
    special_damages_items: "specialDamagesItems",
    response_deadline_days: "responseDeadlineDays",
    defendant_name: "defendantName",
  };
  return matter[aliases[fieldKey]] ?? getPath(matter, fieldKey);
}

function applyFormTemplate({ store = loadFormStore(), templateId, matter = {}, selectedClauseIds = null }) {
  const template = (store.templates || []).find(t => t.id === templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  const allClauses = (store.clauses || []).filter(c => c.templateId === templateId);
  const selected = selectedClauseIds ? allClauses.filter(c => selectedClauseIds.includes(c.id)) : allClauses;
  const fieldCompletionReport = [];
  const fieldProvenance = [];
  const factToFieldTrace = [];
  const placeholderAudit = [];
  const missingFactBlockers = [];
  const recommendedEvidenceTasks = [];
  const lawyerOnlyFields = [];
  const lawyerOnlyFieldBlocks = [];
  const fieldValues = {};
  for (const field of template.fieldSchema || []) {
    const value = matterValueForField(matter, field.fieldKey);
    if (value === undefined || value === null || value === "") {
      fieldValues[field.fieldKey] = `[[${field.fieldKey}]]`;
      const placeholder = `[[${field.fieldKey}]]`;
      fieldCompletionReport.push({ fieldKey: field.fieldKey, status: "missing", placeholder, provenanceLabel: PROVENANCE.AI_SUGGESTED });
      fieldProvenance.push({ fieldKey: field.fieldKey, source: "missing", provenanceLabel: PROVENANCE.AI_SUGGESTED, valuePreview: placeholder });
      placeholderAudit.push({ fieldKey: field.fieldKey, placeholder, status: "unresolved" });
      missingFactBlockers.push(field.fieldKey);
      if (field.evidenceRequired) recommendedEvidenceTasks.push(`Provide evidence for ${field.label}`);
    } else {
      fieldValues[field.fieldKey] = value;
      fieldCompletionReport.push({ fieldKey: field.fieldKey, status: "completed_from_matter_fact", provenanceLabel: PROVENANCE.AI_SUGGESTED });
      fieldProvenance.push({ fieldKey: field.fieldKey, source: "matter", matterPath: field.fieldKey, provenanceLabel: PROVENANCE.AI_SUGGESTED, valuePreview: String(value).slice(0, 80) });
      factToFieldTrace.push({ matterPath: field.fieldKey, fieldKey: field.fieldKey, status: "mapped" });
    }
    if (field.lawyerOnly) {
      lawyerOnlyFields.push(field.fieldKey);
      const approved = Array.isArray(matter.lawyerApprovedFields) && matter.lawyerApprovedFields.includes(field.fieldKey);
      if (!approved) lawyerOnlyFieldBlocks.push({ fieldKey: field.fieldKey, reason: "lawyer_only_field_not_approved" });
    }
  }
  const blockedClausesReport = [];
  const renderedSections = [];
  for (const clause of selected) {
    const reasons = clauseBlockedReasons(clause, matter);
    let text = clause.text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => String(fieldValues[key] ?? `[[${key}]]`));
    if (reasons.length) {
      blockedClausesReport.push({ clauseId: clause.id, heading: clause.heading, reasons });
      text = `[PLACEHOLDER ONLY - ${reasons.join("; ")}]\n${text}`;
    }
    renderedSections.push({
      clauseId: clause.id,
      heading: clause.heading,
      text,
      provenanceLabel: clause.provenanceLabel,
      blocked: reasons.length > 0,
    });
  }
  return {
    templateId,
    templateTitle: template.title,
    draftDocument: {
      title: template.title,
      documentIntent: template.documentIntent,
      proceduralStage: template.proceduralStage,
      sections: renderedSections,
      provenanceLabel: PROVENANCE.TEMPLATE_BASED,
    },
    fieldCompletionReport,
    fieldProvenance,
    factToFieldTrace,
    placeholderAudit,
    missingFactBlockers: Array.from(new Set(missingFactBlockers)),
    assumptions: [],
    recommendedEvidenceTasks: Array.from(new Set(recommendedEvidenceTasks)),
    lawyerOnlyFields: Array.from(new Set(lawyerOnlyFields)),
    lawyerOnlyFieldBlocks,
    blockedClausesReport,
    finalApprovalBlocked: missingFactBlockers.length > 0 || blockedClausesReport.length > 0 || lawyerOnlyFieldBlocks.length > 0,
    finalApprovalGate: {
      status: missingFactBlockers.length > 0 || blockedClausesReport.length > 0 || lawyerOnlyFieldBlocks.length > 0 ? "blocked" : "ready_for_lawyer_review",
      requiredFieldsResolvedOrWaived: missingFactBlockers.length === 0,
      placeholdersResolved: placeholderAudit.length === 0,
      lawyerOnlyFieldsApproved: lawyerOnlyFieldBlocks.length === 0,
    },
  };
}

function draftFromForm(args) {
  return applyFormTemplate(args);
}

function buildAnswerForFormsQuestion({ store = loadFormStore(), query, matter = {} }) {
  const route = routeForms({ store, query, matter });
  const workflowTimeline = buildFormWorkflowTimeline({ route, matter, query });
  return {
    currentWorkflowStage: matter.workflowStage || inferMatterFromQuery(query).workflowStage || "INTAKE",
    recommendedNextActions: [
      ...route.requiredEvidence.map(item => `Collect evidence: ${item}`),
      ...route.missingFacts.map(item => `Ask for missing fact: ${item}`),
    ],
    recommendedForms: route.recommendedForms.map(item => ({
      id: item.template.id,
      title: item.template.title,
      documentIntent: item.template.documentIntent,
      caveats: item.caveats,
      provenanceLabel: item.template.provenanceLabel,
    })),
    formsNotRecommended: route.blockedForms.map(item => ({
      id: item.template.id,
      title: item.template.title,
      reasons: item.blockedBy,
    })),
    missingFactsEvidenceBlockers: {
      missingFacts: route.missingFacts,
      requiredEvidence: route.requiredEvidence,
    },
    draftableDocumentSections: route.applicableClauses.map(clause => ({
      clauseId: clause.id,
      heading: clause.heading,
      provenanceLabel: clause.provenanceLabel,
    })),
    sourceProvenanceNotes: route.provenance,
    lawyerApprovalRequired: true,
    workflowTimeline,
    crmWorkflowExport: crmExportRowsFromTimeline(workflowTimeline),
  };
}

module.exports = {
  PROVENANCE,
  REVIEW,
  buildAnswerForFormsQuestion,
  buildFormWorkflowTimeline,
  buildPrivateFormIndex,
  classifyFormTemplate,
  crmExportRowsFromTimeline,
  defaultFormRoutingRules,
  draftFromForm,
  extractClauseSnippets,
  extractFormDocuments,
  extractTemplateFields,
  inferClauseUsageRules,
  inferMatterFromQuery,
  isFormsIntentQuery,
  ingestPrivateFormPack,
  inventoryFormPack,
  linkNotebooklmUsageNotes,
  loadFormStore,
  parseNotebooklmNotes,
  recommendClauses,
  routeForms,
  searchForms,
  stableId,
  writeJson,
  writePrivateFormStore,
  applyFormTemplate,
};
