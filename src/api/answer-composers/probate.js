const fs = require("fs");
const path = require("path");

const PROBATE_DIR = path.join(process.cwd(), "data", "legal_domain_packs", "demo_maps", "probate_law_hk");

function loadProbateJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROBATE_DIR, file), "utf8"));
  } catch (error) {
    return fallback;
  }
}

function detectsNoWillIntestacy(query) {
  const q = String(query || "").toLowerCase();
  return /\b(intestate|no valid will|no will|without (?:a )?will|did not (?:make|leave|have) (?:a )?will|does(?: not|n't) (?:have|leave) (?:a )?will|not have (?:a )?will|has no will|left no will|died (?:without|with no) (?:a )?will|letters of administration|next of kin|administrator)\b/.test(q);
}

function detectsFamilyDistributionIssue(query) {
  const q = String(query || "").toLowerCase();
  return /\b(distribut(?:e|ion)|inherit|inheritance|share|entitled|entitlement|who gets|what happens|left|leaves|surviv(?:e|ed|ing)|son|daughter|child|children|issue|grandchild|grandchildren|granddaughter|granddaughters|grandaughter|grandaughters|spouse|wife|husband|widow|widower|minor|under 18|18|eighteen|predeceased|parent)\b/.test(q);
}

function detectsIntestacyDistributionIssue(query) {
  return detectsNoWillIntestacy(query) && detectsFamilyDistributionIssue(query);
}

function detectIntestacyDistributionFacts(query) {
  const q = String(query || "").toLowerCase();
  return {
    no_will_or_intestacy: detectsNoWillIntestacy(q),
    asks_distribution_or_entitlement: detectsFamilyDistributionIssue(q),
    foreign_connection: /\b(us|usa|united states|america|foreign|outside hong kong|overseas|domicil|domicile)\b/.test(q),
    mentions_hong_kong: /\b(hk|hong kong)\b/.test(q),
    spouse_mentioned: /\b(spouse|wife|husband|widow|widower)\b/.test(q),
    no_spouse_stated: /\b(no spouse|no surviving spouse|no wife|no husband|widow(?:er)? not|single|unmarried)\b/.test(q),
    children_mentioned: /\b(son|daughter|child|children|issue)\b/.test(q),
    grandchildren_mentioned: /\b(grandchild|grandchildren|granddaughter|granddaughters|grandaughter|grandaughters|grandson|grandsons)\b/.test(q),
    minor_or_age_mentioned: /\b(minor|under 18|under eighteen|not 18|not eighteen|18|eighteen)\b/.test(q),
    predeceased_parent_mentioned: /\b(predeceased|died before|parent died|father died before|mother died before)\b/.test(q),
  };
}

function classifyProbate(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "probate_general";
  let subscenario = null;
  const detectedFacts = detectIntestacyDistributionFacts(q);

  if (/\b(caveat|warning|appearance|citation|contentious|solemn form|challenge will|validity dispute)\b/.test(q)) {
    scenario = "caveat_warning_contentious_gateway";
  } else if (/\b(reseal|resealing|foreign grant|foreign probate)\b/.test(q)) {
    scenario = "foreign_grant_resealing";
  } else if (detectsNoWillIntestacy(q)) {
    scenario = "intestate_administration";
    if (detectsIntestacyDistributionIssue(q)) {
      subscenario = "intestacy_distribution_issue_statutory_trusts";
    }
  } else if (/\b(lost will|copy will|reconstruct|reconstructed will|nuncupative|privileged will|rectification|swear death|leave to swear death)\b/.test(q)) {
    scenario = "special_probate_application";
  } else if (/\b(inventory|account|accounts|distribution|debts|creditor|executor'?s year|beneficiar|devastavit|self-dealing|sell property|immovable)\b/.test(q)) {
    scenario = "post_grant_administration";
  } else if (/\b(outside hong kong|domicil|domicile)\b/.test(q)) {
    scenario = "foreign_grant_resealing";
  } else if (/\b(will|executor|probate|grant)\b/.test(q)) {
    scenario = "common_form_probate_grant";
  }

  return {
    matter_type: "probate",
    scenario,
    user_perspective: /\b(i|we|my client|our client|executor|administrator|beneficiary|caveator|applicant)\b/.test(q)
      ? "applicant_representative_beneficiary_or_adviser"
      : "unspecified",
    procedural_posture: scenario.includes("post_grant") ? "post_grant" : (scenario.includes("contentious") ? "contentious_gateway" : "pre_grant"),
    subscenario,
    detected_facts: detectedFacts,
    query,
  };
}

function normaliseFormNumber(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").replace(/^FORMNO\.?/, "");
}

function formsByNumber(forms, numbers, role, conditionNote) {
  const wanted = new Set(numbers.map(normaliseFormNumber));
  return (forms || [])
    .filter(form => wanted.has(normaliseFormNumber(form.form_number)))
    .map(form => ({
      form_id: form.form_id,
      title: form.title,
      form_number: form.form_number,
      form_family: form.form_family,
      document_type: form.document_type,
      procedural_stage: form.procedural_stage,
      trigger_conditions: form.trigger_conditions || [],
      required_facts: form.required_facts || [],
      review_status: form.review_status,
      output_mode: form.output_mode,
      recommendation_role: role,
      condition_note: conditionNote,
    }));
}

function selectForms(forms, scenario) {
  if (scenario === "common_form_probate_grant") {
    return [
      ...formsByNumber(forms, ["W1.1A", "W1.1B"], "primary_candidate", "Ordinary application by named executor/executrix. Choose the correct suffix/form according to the current official specified form, death-date/estate-duty context and Registry requirements."),
      ...formsByNumber(forms, ["N2.1", "N4.1"], "primary_candidate", "Assets and liabilities material for an ordinary grant: affidavit/affirmation verifying the schedule plus the schedule itself."),
      ...formsByNumber(forms, ["W2.1", "W2.2"], "conditional_candidate", "Use only if an executor renounces or a renunciation issue arises."),
      ...formsByNumber(forms, ["W1.2A", "W1.2B"], "conditional_candidate", "Use only where an attorney of the sole executor applies for administration with the will annexed."),
      ...formsByNumber(forms, ["W1.3A", "W1.3B"], "conditional_candidate", "Use only where the sole executor has died or renounced and an administrator with will annexed applies."),
      ...formsByNumber(forms, ["W1.4A", "W1.4B"], "conditional_candidate", "Use only where the will appoints no executor and an administrator with will annexed applies."),
      ...formsByNumber(forms, ["W3.1", "W3.2", "W3.3", "W3.4"], "conditional_evidence_candidate", "Use only if the Registry requires evidence on due execution, handwriting, plight/condition or alterations."),
      ...formsByNumber(forms, ["N2.2", "N2.3", "N4.2"], "conditional_correction_candidate", "Use only for corrective or additional assets/liabilities schedules before or after grant."),
    ];
  }
  if (scenario === "intestate_administration") {
    return [
      ...formsByNumber(forms, ["L1.1A", "L1.1B", "L1.2A", "L1.2B", "L1.3A", "L1.3B", "L1.4A", "L1.4B", "L1.5A", "L1.5B", "L1.6A", "L1.6B"], "route_candidate", "Letters of administration form family. Select the correct L1 variant by relationship/priority and estate context."),
      ...formsByNumber(forms, ["N2.1", "N4.1"], "primary_candidate", "Assets and liabilities schedule material for grant."),
      ...formsByNumber(forms, ["L2.1"], "conditional_candidate", "Use where a person entitled to administration renounces."),
      ...formsByNumber(forms, ["L3.1", "L3.2", "L3.3"], "conditional_candidate", "Use where nomination, power of attorney or guardian/co-administrator route is relevant."),
      ...formsByNumber(forms, ["N2.2", "N2.3", "N4.2"], "conditional_correction_candidate", "Use only for corrective or additional assets/liabilities schedules."),
    ];
  }
  if (scenario === "foreign_grant_resealing") {
    return [
      ...formsByNumber(forms, ["N3.1", "N4.1"], "primary_candidate", "Assets/liabilities affidavit and schedule for sealing/resealing of foreign grant."),
      ...formsByNumber(forms, ["N3.2", "N3.3", "N4.2"], "conditional_correction_candidate", "Use only where a corrective/additional schedule is needed before or after sealing."),
      ...formsByNumber(forms, ["1"], "conditional_candidate", "General summons only if leave/order/direction is needed, e.g. limited grant or unusual resealing issue."),
    ];
  }
  if (scenario === "special_probate_application") {
    return [
      ...formsByNumber(forms, ["S1.1A", "S1.1B", "S1.2A", "S1.2B", "S2.1A", "S2.1B", "S2.2A", "S3.1A", "S3.1B", "S3.2A", "S3.2B"], "special_grant_candidate", "Special/limited grant family. Select only after identifying the exact special route."),
      ...formsByNumber(forms, ["M1.1", "M2.1", "M4.1", "M4.2"], "special_evidence_candidate", "Use for identity/death/special evidence only where triggered."),
      ...formsByNumber(forms, ["1"], "summons_candidate", "General summons for order/leave where required."),
    ];
  }
  if (scenario === "post_grant_administration") {
    return [
      ...formsByNumber(forms, ["N2.3", "N4.2"], "post_grant_correction_candidate", "Corrective/additional schedule after grant where assets/liabilities were inaccurate or omitted."),
      ...formsByNumber(forms, ["1"], "summons_candidate", "General summons if court directions, inventory/account, revocation/amendment or administration relief is required."),
    ];
  }
  if (scenario === "caveat_warning_contentious_gateway") {
    return [
      ...formsByNumber(forms, ["1"], "summons_candidate", "General summons/order route where Registry or court direction is needed."),
    ];
  }
  return [
    ...formsByNumber(forms, ["W1.1A", "W1.1B", "L1.1A", "L1.1B", "N2.1", "N4.1"], "triage_candidate", "Initial triage only. Classify testate/intestate and applicant entitlement before selecting final form."),
  ];
}

function formGuidanceItems(scenario, formCandidates) {
  const nums = new Set((formCandidates || []).map(form => normaliseFormNumber(form.form_number)));
  const has = n => nums.has(normaliseFormNumber(n));
  if (scenario === "common_form_probate_grant") {
    return [
      "Do not file every W1 variant. First choose the grant route. If a named executor/executrix is applying in an ordinary will case, the relevant executor affidavit/affirmation family is W1.1a/W1.1b; choose the exact suffix against the current official specified form and Registry requirements.",
      "If the applicant is not the named executor, move away from W1.1: W1.2 is for attorney of sole executor, W1.3 for sole executor died/renounced, and W1.4 for no executor appointed. These are conditional variants, not simultaneous forms.",
      "For the assets/liabilities stage of an ordinary grant, use the grant schedule route: N2.1 affidavit/affirmation verifying the Schedule of Assets and Liabilities, together with N4.1 Schedule of Assets and Liabilities. N1.1 is for summary administration, not the ordinary executor grant route.",
      "Use N2.2/N2.3 and N4.2 only if a corrective or additional assets/liabilities schedule is needed before or after the grant.",
      "Use W2.1/W2.2 only if executor renunciation is involved; use W3 evidence forms only if the Registrar requires due execution, handwriting, plight/condition or alteration evidence.",
      `Current metadata candidates found: ${["W1.1A", "W1.1B", "N2.1", "N4.1"].filter(has).join(", ") || "none verified in metadata"}.`,
    ];
  }
  if (scenario === "intestate_administration") {
    return [
      "For no-will/intestacy matters, do not use W1 probate-to-executor forms. Select the correct L1 letters-of-administration variant by entitlement/relationship/priority.",
      "Assets/liabilities material should use the grant schedule route: N2.1 and N4.1, with N2.2/N2.3/N4.2 only for correction/addition.",
      "Use L2 only for renunciation, and L3 forms only for nomination/power/guardian/co-administrator issues.",
    ];
  }
  if (scenario === "foreign_grant_resealing") {
    return [
      "For resealing, start with the foreign grant route and Hong Kong assets. Do not use a local original grant W1/L1 route unless resealing is unavailable or inappropriate.",
      "Use N3.1 and N4.1 for the sealing/resealing assets/liabilities schedule route. N3.2/N3.3/N4.2 are corrective/additional schedule forms only.",
      "A general summons is only a conditional candidate if leave, unusual directions or a limited-grant issue arises.",
    ];
  }
  if (scenario === "special_probate_application") {
    return [
      "Classify the special application first: lost/copy will, nuncupative/privileged will, leave to swear death, rectification, ad colligenda bona, grant pending suit, de bonis non or other limited grant.",
      "Use S/M/general summons forms only after identifying the exact special route and evidence gap. These are not routine common-form grant forms.",
      "The output remains metadata-only until official source cards and private-vault template review are complete.",
    ];
  }
  if (scenario === "post_grant_administration") {
    return [
      "For post-grant administration, the key documents are accounts, inventory, correspondence, asset/liability updates and any application for directions/amendment/revocation. Do not start with grant application forms unless a fresh grant issue arises.",
      "Use N2.3/N4.2 where a grant has issued and assets/liabilities need correction or addition. Use general summons only where court directions or relief are required.",
    ];
  }
  return formCandidates.length
    ? formCandidates.map(form => `${form.title} — ${form.condition_note || "metadata-only candidate; verify current form and route."}`)
    : ["No exact Probate form candidate is answer-safe yet; use metadata-only registry and lawyer review."];
}

function intestacyDistributionSupport(classification) {
  const facts = classification.detected_facts || {};
  const foreignNote = facts.foreign_connection
    ? "The place of death being the US is not enough by itself. First identify domicile and asset situs: Hong Kong succession analysis is strongest for Hong Kong-situated assets and/or a Hong Kong domicile question; US domicile or US assets may require the relevant US state law."
    : "First identify domicile and asset situs. Hong Kong succession analysis depends on the estate/property connection, not only on family relationship labels.";

  return {
    title: "Applied Probate Analysis - Intestacy Distribution And Minor Beneficiaries",
    short_answer: "Do not answer this as a will/executor form question. It is an intestacy distribution question first: identify the governing law, whether a surviving spouse exists, and whether the granddaughters' parent predeceased the deceased. If Hong Kong intestacy applies and there is no surviving spouse, the estate is held on statutory trusts for issue; living children take at the child level, and grandchildren take only through a deceased parent's branch. Any minor beneficiary's share must be administered through the relevant trust/guardian route until full age or another statutory vesting condition is met.",
    sections: [
      ["Governing Law / Assumptions", [
        foreignNote,
        "This analysis assumes there is no valid will and no surviving spouse. If there is a spouse, spouse-entitlement rules must be analysed before the children/grandchildren split.",
        "The granddaughters' entitlement turns on a missing fact: whether their parent was a child of the deceased and died before the deceased. Grandchildren normally take by branch only if the parent through whom they claim is not alive to take.",
      ]],
      ["Source Anchors / Verification Cards", [
        "Cap. 73 Intestates' Estates Ordinance section 4 is the statutory distribution anchor for an intestate estate. Official card required before final advice: https://www.elegislation.gov.hk/hk/cap73/s4",
        "Cap. 73 section 3 is the statutory trusts / issue machinery anchor, including branch distribution logic. Official card required before final advice: https://www.elegislation.gov.hk/hk/cap73/s3",
        "Cap. 410 section 2 is the full-age anchor for 18. Official card required before final advice: https://www.elegislation.gov.hk/hk/cap410/s2",
        "No case authority is answer-safe for this probate scenario yet. Do not cite cases unless HKLII paragraph-level cards have been attached.",
      ]],
      ["Applied Distribution Analysis", [
        "If there is no surviving spouse, the son and daughter are alive, and the granddaughters' parent is also alive, the granddaughters usually do not take directly at this level. The living children are the operative issue for distribution; a minor child's share is held/administered rather than paid outright.",
        "If there is no surviving spouse, the son and daughter are alive, and a third child of the deceased predeceased leaving two granddaughters, the estate is analysed by branches: son one branch, daughter one branch, and the deceased child's branch one branch. On that assumed fact pattern, the son would take 1/3, the daughter 1/3, and the two granddaughters would share their parent's 1/3 branch equally at 1/6 each, subject to any minor-beneficiary trust consequences.",
        "If a surviving spouse exists, or if any child was adopted, illegitimate, predeceased, disclaimed, or died before vesting, the distribution table must be recalculated from the statute and source cards.",
      ]],
      ["Minor Beneficiaries / Trust Consequences", [
        "A beneficiary under 18 should not be treated as simply receiving cash outright. The administrator must identify the trust, guardian/co-administrator, investment, maintenance/advancement and court/Registry requirements before distribution.",
        "For presentation to a client, separate the arithmetic entitlement from the payment mechanics: an adult share may be distributable after administration; a minor share may need to be held until full age or another statutory vesting condition is satisfied.",
        "If a minor dies before vesting, do not improvise the answer. That requires a fresh statutory-trust and survivorship analysis against the verified source cards.",
      ]],
      ["Administration / Forms Layer", [
        "The procedural route is letters of administration, not probate to an executor and not W1 will-probate forms.",
        "First identify the person entitled to apply as administrator, relationship evidence, consents/renunciations and whether a guardian or co-administrator route is needed because of minors.",
        "The L1 letters-of-administration family and N2.1/N4.1 assets-liabilities schedule are only the filing layer after entitlement and distribution analysis.",
      ]],
    ],
    source_backed_rules: [
      {
        id: "hk_probate_intestacy_distribution_cap73_s4",
        proposition: "Where Hong Kong intestacy law applies, distribution of the residuary estate is governed by Cap. 73 section 4.",
        source: "Intestates' Estates Ordinance (Cap. 73) s.4",
        official_url: "https://www.elegislation.gov.hk/hk/cap73/s4",
        verification_status: "source_verification_required",
      },
      {
        id: "hk_probate_statutory_trusts_issue_cap73_s3",
        proposition: "The statutory trusts mechanism determines how issue take by branch and whether issue take only through a deceased parent.",
        source: "Intestates' Estates Ordinance (Cap. 73) s.3",
        official_url: "https://www.elegislation.gov.hk/hk/cap73/s3",
        verification_status: "source_verification_required",
      },
      {
        id: "hk_probate_full_age_cap410_s2",
        proposition: "For Hong Kong statutory references to full age, full age is 18 unless the context requires otherwise.",
        source: "Age of Majority (Related Provisions) Ordinance (Cap. 410) s.2",
        official_url: "https://www.elegislation.gov.hk/hk/cap410/s2",
        verification_status: "source_verification_required",
      },
    ],
    missing_facts: [
      "Deceased's domicile at death and whether the relevant assets are in Hong Kong, the US or another place.",
      "Whether there is any valid will, codicil, foreign grant or US estate proceeding.",
      "Whether there is a surviving spouse, former spouse, or matrimonial/property issue affecting distribution.",
      "Whether the two granddaughters' parent was a child of the deceased and whether that parent predeceased the deceased.",
      "Exact ages/capacity of the son, daughter and granddaughters, including which beneficiaries are under 18.",
      "Whether adoption, legitimacy, disclaimer, survivorship period, debts, funeral expenses, tax, or creditor issues alter the distributable estate.",
    ],
    unsupported_claims: [
      "No HKLII paragraph-level probate case authority is attached for this scenario yet; cases must remain candidate-only until paragraph URLs are verified.",
      "No final US-law conclusion can be given without the US state, domicile and asset-situs facts.",
    ],
  };
}

function supportForScenario(scenario) {
  if (scenario === "caveat_warning_contentious_gateway") {
    return {
      title: "Applied Probate Triage - Caveat / Warning / Contentious Gateway",
      short_answer: "Do not treat this as an ordinary grant application if there is a caveat, warning, appearance, citation or will-validity dispute. First identify the interest asserted, the status of any grant/caveat, and whether the matter must move from common-form Probate Registry handling into contentious or court-directed steps.",
      sections: [
        ["Applied Analysis", [
          "Separate common-form registry work from contentious or solemn-form probate.",
          "Identify who has an interest, what testamentary script or grant is disputed, and whether a warning/appearance/citation has already been served.",
          "Preserve the original will, codicils, copies, correspondence and any evidence about execution, capacity, knowledge/approval, undue influence or later wills.",
        ]],
        ["Practical Steps", [
          "Check caveat/grant status at the Probate Registry.",
          "Map the parties with an interest and the relief sought.",
          "Prepare a chronology of warning, appearance, citation and any registry directions.",
          "Escalate to solicitor/lawyer review before issuing or responding to contentious documents.",
        ]],
      ],
    };
  }
  if (scenario === "foreign_grant_resealing") {
    return {
      title: "Applied Probate Triage - Foreign Grant / Resealing",
      short_answer: "For a foreign grant, do not start with a local original-grant form. First check the issuing place, the foreign grant, Hong Kong assets, domicile/evidence requirements and whether the route is resealing or a fresh/local application.",
      sections: [
        ["Applied Analysis", [
          "Identify the foreign grant and issuing jurisdiction/place.",
          "Confirm whether there are Hong Kong assets requiring local authority.",
          "Check whether corrections, translations, certifications or additional evidence are needed before registry filing.",
        ]],
        ["Practical Steps", [
          "Collect the sealed/certified foreign grant and death evidence.",
          "List Hong Kong assets and institutions requiring local authority.",
          "Prepare resealing checklist and keep the output source-verification-required until current rules are checked.",
        ]],
      ],
    };
  }
  if (scenario === "special_probate_application") {
    return {
      title: "Applied Probate Triage - Special Probate Application",
      short_answer: "Lost wills, leave to swear death, rectification, nuncupative/privileged wills and limited/special grants should not be handled as routine common-form applications. Identify the special route, evidence gap, order sought and affected persons first.",
      sections: [
        ["Applied Analysis", [
          "Classify whether the issue is evidential, grant-related, or a will-validity/rectification issue.",
          "For lost/copy wills, focus on custody, searches, copy/reconstruction, due execution and consents.",
          "For leave to swear death, focus on the circumstances, corroboration and any foreign-order evidence.",
        ]],
        ["Practical Steps", [
          "Prepare affidavit evidence and supporting exhibits as metadata-only candidates.",
          "Identify who should be served or asked for consent.",
          "Keep any draft order or summons lawyer-review-required.",
        ]],
      ],
    };
  }
  if (scenario === "post_grant_administration") {
    return {
      title: "Applied Probate Triage - Post-Grant Administration",
      short_answer: "Post-grant questions are about the representative's powers, duties, debts, accounts, distribution timing and possible liability. Verify the grant and estate position before advising on sale, distribution, inventory/account or beneficiary disputes.",
      sections: [
        ["Applied Analysis", [
          "Confirm the grant, representative capacity and whether the act is within the representative's power.",
          "Separate asset realisation, payment of debts, accounts, distribution and fiduciary/conflict issues.",
          "If beneficiaries or creditors dispute the administration, preserve accounts and communications for review.",
        ]],
        ["Practical Steps", [
          "Prepare estate asset/liability and account chronology.",
          "Identify creditors, claims, beneficiaries and any proposed distribution.",
          "Hold distribution if there is a live claim, caveat, court direction issue or unresolved liability risk.",
        ]],
      ],
    };
  }
  const intestate = scenario === "intestate_administration";
  return {
    title: intestate
      ? "Applied Probate Triage - Intestate Administration"
      : "Applied Probate Triage - Common Form Grant",
    short_answer: intestate
      ? "If there is no valid will, the first question is who is entitled to letters of administration. Do not use executor-probate forms unless a valid will and executor route is confirmed."
      : "For a death with a will, the ordinary route is not simply 'all W1 forms'. First confirm whether a named executor is applying. If yes, use the ordinary executor probate route; if not, choose the correct administration-with-will-annexed variant.",
    sections: [
      ["Applied Analysis", intestate ? [
        "Classify the matter as intestacy/no-valid-will before choosing any form.",
        "Identify the person entitled in priority, relationship evidence, any renunciation/nomination and whether a co-administrator or guardian route is needed.",
        "Treat form recommendations as metadata-only until official/source-card verification and lawyer review.",
      ] : [
        "Classify whether the route is probate to a named executor, administration with will annexed, or a non-routine/special route.",
        "For a straightforward will where the named executor applies, W1.1 is the relevant form family; W1.2/W1.3/W1.4 are conditional alternatives, not additional ordinary filings.",
        "Screen for caveat, warning, competing entitlement, lost will, foreign grant, renunciation, no executor, death of executor, minor/life interest and registry requisition issues.",
      ]],
      ["Step-by-Step Process", intestate ? [
        "1. Confirm there is no valid will and identify the person entitled to apply.",
        "2. Collect death, domicile/identity, relationship and entitlement evidence.",
        "3. Prepare the correct L1 administration form route and assets/liabilities schedule.",
        "4. File with Probate Registry and answer requisitions with evidence.",
        "5. Extract the grant, collect assets, pay liabilities and administer/distribute subject to review gates.",
      ] : [
        "1. Confirm death, domicile/identity and locate the original will/codicils.",
        "2. Confirm executor entitlement: named executor alive, willing and able to act; note any power reserved, renunciation or death of executor.",
        "3. Choose the correct grant route: ordinary executor probate, attorney of executor, executor died/renounced, no executor, or special application.",
        "4. Prepare the assets/liabilities schedule for grant and supporting affidavit/affirmation material.",
        "5. File the selected grant application with the Probate Registry and respond to requisitions with source evidence.",
        "6. After grant, collect estate assets, pay debts/expenses, keep accounts and distribute only when safe to do so.",
      ]],
      ["Practical Steps", [
        "Collect death certificate, domicile/identity evidence, original will/codicils if any, and relationship/entitlement evidence.",
        "Prepare Hong Kong assets and liabilities schedule information and keep supporting documents.",
        "Respond to any Probate Registry requisition with evidence, not model memory.",
      ]],
    ],
  };
}

function composeProbateAnswer({ query }) {
  const classification = classifyProbate(query);
  const registry = loadProbateJson("probate_form_registry.json", { forms: [] });
  const contracts = loadProbateJson("probate_answer_contracts.json", { answer_contracts: [] });
  const scenarioSupport = classification.subscenario === "intestacy_distribution_issue_statutory_trusts"
    ? intestacyDistributionSupport(classification)
    : supportForScenario(classification.scenario);
  const formCandidates = selectForms(registry.forms, classification.scenario);
  const formGuidance = formGuidanceItems(classification.scenario, formCandidates);
  const missingFacts = scenarioSupport.missing_facts || [
    "Deceased identity, date of death and domicile.",
    "Will/codicil status and location of originals.",
    "Executor/administrator entitlement and any renunciations, consents, deaths of executor, attorney route, minority/life interest or no-executor issue.",
    "Hong Kong assets and liabilities, including whether the ordinary grant schedule, corrective schedule or resealing schedule route is needed.",
    "Whether caveat, citation, warning, requisition, foreign grant or dispute exists.",
  ];
  const sections = [
    ...scenarioSupport.sections.map(([heading, items]) => ({ heading, items })),
    {
      heading: "Documents / Forms",
      items: formGuidance,
    },
    {
      heading: "Missing Facts",
      items: missingFacts,
    },
    {
      heading: "Review Gate",
      items: [
        "This Probate answer is a metadata/practice-seed triage, not legal advice.",
        "No Probate proposition is answer-safe until official ordinance/rules/case source cards are attached and reviewed.",
        "Butterworths text and private form bodies remain private-vault-only and are not reproduced here.",
      ],
    },
  ];

  return {
    applied_answer: {
      title: scenarioSupport.title,
      mode: "probate_metadata_source_gated",
      short_answer: scenarioSupport.short_answer,
      sections,
    },
    classification,
    answer_contract: {
      domain: "probate_law_hk",
      scenario_family: classification.scenario,
      subscenario: classification.subscenario,
      answer_sections: sections.map(section => section.heading),
      verification_rule: "No official source card means source-verification-required. Forms are metadata-only candidates.",
      source_audit_policy: "collapsed_by_default",
      review_status: "research_only",
    },
    form_candidates: formCandidates,
    source_backed_rules: scenarioSupport.source_backed_rules || [],
    unsupported_claims: scenarioSupport.unsupported_claims || [],
    source_audit: {
      display: "collapsed",
      probate_contracts: contracts.answer_contracts || [],
      form_registry_count: (registry.forms || []).length,
      source_backed_rule_count: (scenarioSupport.source_backed_rules || []).length,
      unsupported_claims: scenarioSupport.unsupported_claims || [],
      note: "Probate pack is metadata-only. Use official source cards and private-vault templates before drafting.",
    },
  };
}

module.exports = {
  classifyProbate,
  composeProbateAnswer,
};
