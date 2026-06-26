function detectProbateIntestacyFacts(query) {
  const q = String(query || "").toLowerCase();
  return {
    no_will_or_intestacy: /\b(intestate|no valid will|no will|without (?:a )?will|did not (?:make|leave|have) (?:a )?will|does(?: not|n't) (?:have|leave) (?:a )?will|not have (?:a )?will|has no will|left no will|died (?:without|with no) (?:a )?will|letters of administration|next of kin|administrator)\b/.test(q),
    asks_distribution_or_entitlement: /\b(distribut(?:e|ion)|inherit|inheritance|share|entitled|entitlement|who gets|what happens|left|leaves|surviv(?:e|ed|ing)|son|daughter|child|children|issue|grandchild|grandchildren|granddaughter|granddaughters|grandaughter|grandaughters|spouse|wife|husband|widow|widower|minor|under 18|18|eighteen|predeceased|parent)\b/.test(q),
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

function detectTheftShopliftingFacts(query) {
  const q = String(query || "").toLowerCase();
  return {
    theft_signal: /\b(theft|steal|stealing|stole|stolen|shoplift|shoplifting|dishonesty|dishonest|appropriation|permanently deprive|forgot to pay|forget to pay|forgotten to pay|without paying|did not pay|didn't pay)\b/.test(q),
    shop_context: /\b(shop|store|supermarket|convenience store|convenient store|retail|cashier|checkout|security|cctv)\b/.test(q),
    forgot_to_pay_claim: /\b(forgot to pay|forget to pay|forgotten to pay|forgot|forget|mistake|accident|accidental|absent[- ]minded)\b/.test(q),
    concealment_mentioned: /\b(conceal|concealed|hide|hid|hidden|bag|pocket|clothing|jacket)\b/.test(q),
    stopped_or_caught: /\b(stopped|caught|security|police|arrested|charged|cautioned|interview)\b/.test(q),
    return_or_pay_mentioned: /\b(return|returned|pay|paid|offer(?:ed)? to pay|go back)\b/.test(q),
  };
}

function extractFacts({ domain, scenario, subscenario, query }) {
  if (domain === "probate_law_hk" && subscenario === "intestacy_distribution_issue_statutory_trusts") {
    return detectProbateIntestacyFacts(query);
  }
  if (domain === "criminal_law" && subscenario === "shoplifting_forgot_to_pay_mr_defence") {
    return { theft_shoplifting: detectTheftShopliftingFacts(query) };
  }
  return {
    domain,
    scenario,
    subscenario,
    extraction_status: "no_structured_extractor_for_scenario",
  };
}

module.exports = {
  detectProbateIntestacyFacts,
  detectTheftShopliftingFacts,
  extractFacts,
};
