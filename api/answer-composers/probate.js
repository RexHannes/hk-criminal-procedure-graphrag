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

function classifyProbate(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "probate_general";
  if (/\b(caveat|warning|appearance|citation|contentious|solemn form|challenge will|validity dispute)\b/.test(q)) {
    scenario = "caveat_warning_contentious_gateway";
  } else if (/\b(reseal|resealing|foreign grant|foreign probate|outside hong kong|domicil|domicile)\b/.test(q)) {
    scenario = "foreign_grant_resealing";
  } else if (/\b(lost will|copy will|reconstruct|reconstructed will|nuncupative|privileged will|rectification|swear death|leave to swear death)\b/.test(q)) {
    scenario = "special_probate_application";
  } else if (/\b(inventory|account|accounts|distribution|debts|creditor|executor'?s year|beneficiar|devastavit|self-dealing|sell property|immovable)\b/.test(q)) {
    scenario = "post_grant_administration";
  } else if (/\b(intestate|no will|letters of administration|next of kin|administrator)\b/.test(q)) {
    scenario = "intestate_administration";
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
    query,
  };
}

function selectForms(forms, scenario) {
  const needles = {
    common_form_probate_grant: ["grant_probate_testate", "assets_liabilities_schedule", "will_identity_execution_evidence"],
    intestate_administration: ["letters_administration_intestate", "renunciation", "additional_administrator", "assets_liabilities_schedule"],
    caveat_warning_contentious_gateway: ["caveat_warning", "citation", "probate_action", "bring_in_testamentary_document", "general_summons"],
    foreign_grant_resealing: ["foreign_resealing", "assets_liabilities_schedule"],
    special_probate_application: ["special_grant", "lost_will", "leave_swear_death", "nuncupative_privileged_will", "rectification_will"],
    post_grant_administration: ["post_grant_administration", "inventory_account", "amend_revocation_grant", "grant_extraction"],
    probate_general: ["intake", "grant_probate_testate", "letters_administration_intestate", "general_summons"],
  }[scenario] || [];
  return (forms || [])
    .filter(form => needles.includes(form.form_family))
    .slice(0, 10)
    .map(form => ({
      form_id: form.form_id,
      title: form.title,
      form_family: form.form_family,
      document_type: form.document_type,
      procedural_stage: form.procedural_stage,
      trigger_conditions: form.trigger_conditions || [],
      required_facts: form.required_facts || [],
      review_status: form.review_status,
      output_mode: form.output_mode,
    }));
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
  return {
    title: scenario === "intestate_administration"
      ? "Applied Probate Triage - Intestate Administration"
      : "Applied Probate Triage - Common Form Grant",
    short_answer: scenario === "intestate_administration"
      ? "If there is no valid will, the key first step is entitlement/priority for letters of administration, not executor probate. Collect death, domicile, family relationship, consents/renunciations and asset/liability information."
      : "For an ordinary will/executor case, first classify the grant, confirm the executor's entitlement and collect death, will, execution, assets/liabilities and registry evidence before choosing forms.",
    sections: [
      ["Applied Analysis", [
        "Classify whether the route is probate to executor, administration with will annexed, or intestate letters of administration.",
        "Check whether any caveat, warning, competing entitlement, lost will, foreign element or special grant issue makes the case non-routine.",
        "Treat all form recommendations as metadata-only until official/source-card verification and lawyer review.",
      ]],
      ["Practical Steps", [
        "Collect death certificate, domicile/identity evidence, original will/codicils if any, and relationship/entitlement evidence.",
        "Prepare assets and liabilities schedule information.",
        "Respond to any Probate Registry requisition with evidence, not model memory.",
      ]],
    ],
  };
}

function composeProbateAnswer({ query }) {
  const classification = classifyProbate(query);
  const registry = loadProbateJson("probate_form_registry.json", { forms: [] });
  const contracts = loadProbateJson("probate_answer_contracts.json", { answer_contracts: [] });
  const scenarioSupport = supportForScenario(classification.scenario);
  const formCandidates = selectForms(registry.forms, classification.scenario);
  const sections = [
    ...scenarioSupport.sections.map(([heading, items]) => ({ heading, items })),
    {
      heading: "Documents / Forms",
      items: formCandidates.length
        ? formCandidates.map(form => `${form.title} — required facts: ${(form.required_facts || []).slice(0, 4).join(", ")}.`)
        : ["No exact Probate form candidate is answer-safe yet; use metadata-only registry and lawyer review."],
    },
    {
      heading: "Missing Facts",
      items: [
        "Deceased identity, date of death and domicile.",
        "Will/codicil status and location of originals.",
        "Executor/administrator entitlement and any renunciations or consents.",
        "Hong Kong assets and liabilities.",
        "Whether caveat, citation, warning, requisition, foreign grant or dispute exists.",
      ],
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
      answer_sections: sections.map(section => section.heading),
      verification_rule: "No official source card means source-verification-required. Forms are metadata-only candidates.",
      source_audit_policy: "collapsed_by_default",
      review_status: "research_only",
    },
    form_candidates: formCandidates,
    source_audit: {
      display: "collapsed",
      probate_contracts: contracts.answer_contracts || [],
      form_registry_count: (registry.forms || []).length,
      note: "Probate pack is metadata-only. Use official source cards and private-vault templates before drafting.",
    },
  };
}

module.exports = {
  classifyProbate,
  composeProbateAnswer,
};
