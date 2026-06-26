function flattenFacts(facts = {}, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(facts || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenFacts(value, fullKey));
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

function factValue(facts = {}, key) {
  if (Object.prototype.hasOwnProperty.call(facts, key)) return facts[key];
  return key.split(".").reduce((current, part) => (current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined), facts);
}

function conditionPasses(condition = {}, facts = {}) {
  const all = condition.all || [];
  const any = condition.any || [];
  const none = condition.none || [];
  if (all.length && !all.every(key => Boolean(factValue(facts, key)))) return false;
  if (any.length && !any.some(key => Boolean(factValue(facts, key)))) return false;
  if (none.length && none.some(key => Boolean(factValue(facts, key)))) return false;
  return true;
}

function answerText(appliedAnswer = {}) {
  return JSON.stringify(appliedAnswer || {}).toLowerCase();
}

function verifyAppliedAnalysis({ deck = {}, facts = {}, appliedAnswer = {} } = {}) {
  const errors = [];
  const warnings = [];
  const flatFacts = flattenFacts(facts);
  const text = answerText(appliedAnswer);

  for (const key of deck.verifier?.required_fact_flags || []) {
    if (!Boolean(factValue(facts, key)) && !Boolean(flatFacts[key])) {
      warnings.push(`fact_flag_not_detected:${key}`);
    }
  }

  for (const term of deck.verifier?.must_include_terms || []) {
    if (!text.includes(String(term).toLowerCase())) errors.push(`missing_required_term:${term}`);
  }

  for (const term of deck.verifier?.must_not_include_terms || []) {
    if (text.includes(String(term).toLowerCase())) errors.push(`forbidden_term_present:${term}`);
  }

  for (const rule of deck.source_backed_rules || []) {
    if (!rule.source || !rule.verification_status) errors.push(`source_rule_incomplete:${rule.id || "unknown"}`);
  }

  return {
    status: errors.length ? "failed" : "passed",
    errors,
    warnings,
    checked_rule_deck_id: deck.rule_deck_id || "",
  };
}

module.exports = {
  conditionPasses,
  factValue,
  flattenFacts,
  verifyAppliedAnalysis,
};
