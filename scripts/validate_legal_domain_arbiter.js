#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { arbitrateLegalQuery } = require(path.join(ROOT, "src", "routing", "legal_domain_arbiter.js"));

const CASES = [
  {
    id: "sedition_government_criticism",
    query: "If someone just criticizes government not doing job in the fire hazard, will it be sedition in HK?",
    selected_domain: "criminal_law",
    scenario: "sedition_public_expression",
    allowed: ["criminal_law_hk"],
    blocked: ["probate_law_hk", "tort_law_hk"],
    forbidden_selected: ["probate", "personal_injury"],
  },
  {
    id: "harcourt_road_public_order",
    query: "In 2019 I went to Harcourt Road in black and handed water to protestors; is it unlawful assembly or riot?",
    selected_domain: "criminal_law",
    scenario: "public_order_unlawful_assembly_riot",
    allowed: ["criminal_law_hk"],
    blocked: ["probate_law_hk", "tort_law_hk"],
  },
  {
    id: "bail_procedure",
    query: "My client was arrested and asks about bail. What should we prepare?",
    selected_domain: "criminal_procedure",
    allowed: ["criminal_procedure_hk", "criminal_law_hk"],
    blocked: ["probate_law_hk", "tort_law_hk"],
  },
  {
    id: "restaurant_wet_floor_pi",
    query: "A customer slipped on water in my restaurant after mopping and claims compensation for injury.",
    selected_domain: "personal_injury",
    allowed: ["tort_law_hk"],
    blocked: ["probate_law_hk"],
  },
  {
    id: "ordinary_executor_probate",
    query: "The deceased died with an original will and the named executor applies for probate. Which W1 form family is relevant?",
    selected_domain: "probate",
    allowed: ["probate_law_hk"],
    blocked: ["criminal_law_hk", "tort_law_hk"],
  },
  {
    id: "listed_company_filing",
    query: "For a listed company winding-up petition and Companies Registry filing, what documents are needed?",
    selected_domain: "company_forms",
    allowed: ["hk_listing_and_listed_company_regulation"],
  },
  {
    id: "personal_data_dpp1",
    query: "Under the PDPO, when is collecting personal data unfair or excessive under DPP1?",
    selected_domain: "data_privacy",
    allowed: ["data_privacy_hk"],
    blocked: ["probate_law_hk", "tort_law_hk", "criminal_law_hk"],
    forbidden_selected: ["probate", "personal_injury", "criminal_law"],
  },
  {
    id: "employee_medical_records_privacy",
    query: "Can an employer demand employee medical records and threaten discipline if consent is refused?",
    selected_domain: "data_privacy",
    allowed: ["data_privacy_hk"],
    blocked: ["probate_law_hk", "tort_law_hk", "criminal_law_hk"],
    forbidden_selected: ["probate", "personal_injury", "criminal_law"],
  },
  {
    id: "inconsistent_pleadings_civil_procedure",
    query: "What is the consequence for inconsistent factual pleadings across two proceedings: abuse of process, estoppel or collateral attack?",
    selected_domain: "civil_procedure",
    allowed: ["civil_procedure_hk"],
    blocked: ["probate_law_hk", "tort_law_hk", "criminal_law_hk"],
    forbidden_selected: ["probate", "personal_injury", "criminal_law"],
  },
];

function includesAll(haystack, needles) {
  return (needles || []).filter(item => !(haystack || []).includes(item));
}

function main() {
  const errors = [];
  for (const testCase of CASES) {
    const result = arbitrateLegalQuery(testCase.query);
    if (result.selected_domain !== testCase.selected_domain) {
      errors.push(`${testCase.id}: selected_domain expected ${testCase.selected_domain}, got ${result.selected_domain}`);
    }
    if (testCase.scenario && result.scenario !== testCase.scenario) {
      errors.push(`${testCase.id}: scenario expected ${testCase.scenario}, got ${result.scenario}`);
    }
    for (const forbidden of testCase.forbidden_selected || []) {
      if (result.selected_domain === forbidden) {
        errors.push(`${testCase.id}: selected_domain must not be ${forbidden}`);
      }
    }
    const missingAllowed = includesAll(result.allowed_static_domains, testCase.allowed);
    if (missingAllowed.length) {
      errors.push(`${testCase.id}: missing allowed domains ${missingAllowed.join(", ")}`);
    }
    const missingBlocked = includesAll(result.blocked_static_domains, testCase.blocked);
    if (missingBlocked.length) {
      errors.push(`${testCase.id}: missing blocked domains ${missingBlocked.join(", ")}`);
    }
  }

  if (errors.length) {
    console.error(JSON.stringify({ validator: "legal_domain_arbiter_v1", status: "failed", errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ validator: "legal_domain_arbiter_v1", status: "passed", cases: CASES.length }, null, 2));
}

main();
