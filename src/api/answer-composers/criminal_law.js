const { buildAppliedAnalysis } = require("../../legal_answer/applied_analysis/applied_legal_analyzer");

const THEFT_SHOPLIFTING_RE = /\b(theft|steal|stealing|stole|stolen|shoplift|shoplifting|dishonesty|dishonest|appropriation|permanently deprive|forgot to pay|forget to pay|forgotten to pay|without paying|did not pay|didn't pay)\b/;

function detectTheftShopliftingFacts(query) {
  const q = String(query || "").toLowerCase();
  return {
    theft_signal: THEFT_SHOPLIFTING_RE.test(q),
    shop_context: /\b(shop|store|supermarket|convenience store|convenient store|retail|cashier|checkout|security|cctv)\b/.test(q),
    forgot_to_pay_claim: /\b(forgot to pay|forget to pay|forgotten to pay|forgot|forget|mistake|accident|accidental|absent[- ]minded)\b/.test(q),
    concealment_mentioned: /\b(conceal|concealed|hide|hid|hidden|bag|pocket|clothing|jacket)\b/.test(q),
    stopped_or_caught: /\b(stopped|caught|security|police|arrested|charged|cautioned|interview)\b/.test(q),
    return_or_pay_mentioned: /\b(return|returned|pay|paid|offer(?:ed)? to pay|go back)\b/.test(q),
  };
}

function classifyCriminalLaw(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "criminal_law_general";
  let subscenario = null;
  const theftFacts = detectTheftShopliftingFacts(q);

  if (/\b(unlawful assembly|riot|public order|protest|protestor|protester|harcourt road|black|conceal(?:ed|ment)?|hand(?:ed|ing)? water|water to protest|2019)\b/.test(q)) {
    scenario = "public_order_unlawful_assembly_riot";
  } else if (/\b(sedition|seditious|publication|speech|chant|slogan|incitement)\b/.test(q)) {
    scenario = "sedition_public_expression";
  } else if (theftFacts.theft_signal) {
    scenario = "theft_property_dishonesty";
    if (theftFacts.shop_context || theftFacts.forgot_to_pay_claim) {
      subscenario = "shoplifting_forgot_to_pay_mr_defence";
    }
  }

  let userPerspective = "unspecified";
  if (/\b(i|me|my|my client|accused|defendant|suspect|caught|arrested|charged)\b/.test(q)) {
    userPerspective = "suspect_accused_or_defence";
  }

  return {
    matter_type: "criminal_law",
    scenario,
    subscenario,
    user_perspective: userPerspective,
    detected_facts: {
      theft_shoplifting: theftFacts,
    },
    procedural_posture: /\b(alleged|caught|stopped|arrested|charged|prosecuted|convicted|cautioned|interview)\b/.test(q)
      ? "post_incident_criminal_risk_triage"
      : "research_triage",
    query,
  };
}

function publicOrderAnswer() {
  return {
    title: "Applied Triage - Public Order / Unlawful Assembly / Riot",
    short_answer: "This should be treated as a criminal public-order risk question, not a personal-injury or premises case. The answer turns on participation, common purpose, violence or threat of breach of the peace, knowledge/intention, and whether the facts support principal, accessory or joint-enterprise liability. The current source-linked case fruits are candidate-only and require lawyer review before final advice.",
    sections: [
      {
        heading: "Short Answer",
        items: [
          "Do not answer this as a slip/fall or road-traffic injury problem merely because the words road or water appear.",
          "Unlawful assembly and riot require analysis of the group situation, common purpose, conduct, violence or breach-of-peace risk, and the accused's participation or assistance.",
          "Handing water may be argued as innocent or humanitarian on one view, but the prosecution may argue assistance or encouragement depending on knowledge, context, timing, concealment and proximity to disorder.",
          "A reliable view needs the charge particulars, police evidence, video/CCTV, location/time, crowd conduct, and what the person knew or intended.",
        ],
      },
      {
        heading: "Likely Legal Issues",
        items: [
          "Whether the surrounding gathering satisfies unlawful assembly or riot elements under the public-order branch.",
          "Whether the person was physically present, part of a common purpose, or merely passing by.",
          "Whether handing water is treated as neutral assistance, encouragement, aiding/abetting, or joint-enterprise participation.",
          "Whether concealment or black clothing is evidence of knowledge/intention, or has an innocent explanation.",
          "Whether riot rather than unlawful assembly is realistically supported by violence/escalation evidence.",
        ],
      },
      {
        heading: "Evidence Factors",
        items: [
          "Exact time and place on Harcourt Road; what else was happening at that time.",
          "Video/CCTV showing the crowd, the person, the water handover, clothing, concealment and movement.",
          "Whether police warnings had been given and whether the person heard or saw them.",
          "Whether the recipient was engaged in violent/disorderly conduct or merely present.",
          "Messages, social-media posts, transport route, items carried and explanation for being there.",
        ],
      },
      {
        heading: "Possible Defence / Mitigation Lines",
        items: [
          "Lack of knowledge of disorder/common purpose.",
          "Innocent purpose for handing water and no intention to assist violence or disorder.",
          "No participation in violence, threats, obstruction or common purpose.",
          "Identification and continuity issues if the person was allegedly concealed.",
          "Overcharging concern if facts support, at most, a lesser public-order allegation rather than riot.",
        ],
      },
      {
        heading: "Source / Review Gate",
        items: [
          "Use the public-order/riot case fruits and paragraph proof for source-linked research.",
          "Do not treat candidate propositions as final advice until a lawyer reviews the paragraph, authority role and factual fit.",
          "If charged or arrested, obtain urgent criminal-law advice; limitation, bail and interview strategy may be immediate procedural issues.",
        ],
      },
    ],
  };
}

function seditionAnswer() {
  return {
    title: "Applied Triage - Sedition / Public Expression",
    short_answer: "This is a criminal-law public-expression issue, not probate or personal injury. Ordinary criticism of government performance is not automatically sedition; the risk turns on the exact words, intention, context, audience, medium, surrounding conduct, and whether source-backed sedition/public-expression elements are actually engaged. Treat the current case fruits as candidate research until reviewed.",
    sections: [
      {
        heading: "Short Answer",
        items: [
          "Do not route this to probate, PI, or tort merely because the query mentions government failure, fire hazard, or criticism.",
          "The first question is what exactly was said or published, to whom, in what setting, and with what apparent purpose.",
          "A complaint that government failed to deal with a fire hazard may be lawful criticism on one view, but the system must check statutory elements and case context before saying more.",
        ],
      },
      {
        heading: "Likely Legal Issues",
        items: [
          "Whether the words or publication are merely criticism, complaint, public-interest warning, satire, or allegation of misconduct.",
          "Whether the prosecution could point to seditious intention / incitement-type features from wording, context, audience reaction, repetition, medium, or surrounding events.",
          "Whether any statutory exception, constitutional/free-expression argument, or public-interest context is relevant.",
          "Whether the question is about substantive liability, arrest/interview risk, charge screening, or trial defence.",
        ],
      },
      {
        heading: "Facts Needed",
        items: [
          "Exact words, image/video/post and language used.",
          "Where and when it was said; audience size; platform; whether it was public or private.",
          "Whether it called for action, hatred, contempt, disaffection, violence, obstruction, or unlawful conduct.",
          "Whether there were surrounding protests, disorder, national-security allegations, or prior warnings.",
          "Whether the person has been contacted by police, arrested, charged, or asked for interview.",
        ],
      },
      {
        heading: "Source / Review Gate",
        items: [
          "Use the sedition/public-expression case fruits and statute nodes as source-linked research.",
          "Do not treat candidate propositions as answer-safe until a reviewer checks the paragraph, authority role and factual fit.",
          "If the user is facing police contact or a charge, escalate to criminal-law procedure and bail/interview advice immediately.",
        ],
      },
    ],
  };
}

function theftShopliftingForgotToPayAnswer(classification) {
  const facts = classification.detected_facts?.theft_shoplifting || {};
  const immediateFrame = facts.forgot_to_pay_claim
    ? "A genuine forgotten-payment explanation is legally relevant because theft is not just taking an item: the prosecution must prove the required mental elements. The system should analyse actus reus, mens rea, credibility of the explanation, and later conduct."
    : "A shoplifting/theft allegation must be analysed through the statutory theft elements and the evidence of dishonesty and intention, not through a generic criminal-law triage.";

  return {
    title: "Applied Criminal Analysis - Theft / Shoplifting / Forgotten Payment",
    short_answer: `${immediateFrame} If the person genuinely forgot and did not act dishonestly or intend permanently to deprive the shop, that is a potentially complete answer to theft. But the court will test that claim against CCTV, concealment, route through checkout, value, conduct after leaving, and what was said when stopped.`,
    sections: [
      {
        heading: "Offence Framework",
        items: [
          "Start with Theft Ordinance (Cap. 210) section 2: theft requires dishonest appropriation of property belonging to another with intention permanently to deprive.",
          "For an ordinary convenience-store/shoplifting allegation, the likely physical element is appropriation of shop property by taking or carrying it away. The live fight is often mens rea: dishonesty and intention permanently to deprive.",
          "Do not jump straight to penalty, caution or mitigation until AR/MR and proof are mapped.",
        ],
      },
      {
        heading: "AR / MR Matrix",
        items: [
          "Actus reus: identify the item, ownership, possession/control, movement out of the store or past the checkout, and whether any rights of the owner were assumed.",
          "Mens rea - dishonesty: ask what the person actually believed and intended at the time, then test whether the prosecution can prove dishonesty under the verified Hong Kong dishonesty authorities.",
          "Mens rea - intention permanently to deprive: ask whether the person meant to keep/treat the item as their own, or whether the unpaid taking was genuinely accidental and immediately corrected once noticed.",
          "Burden: the accused does not have to prove innocence. Once the issue is live, the prosecution must prove the theft elements beyond reasonable doubt.",
        ],
      },
      {
        heading: "Forgot-To-Pay Defence",
        items: [
          "If the person truly forgot to pay, that can negate dishonesty and/or intention permanently to deprive. The system should say this directly, then qualify it by evidence.",
          "Strong facts for the defence include item in plain sight, low value, distraction, ordinary shopping behaviour, no bypassing behaviour, and voluntary return/payment before being confronted.",
          "Bad facts include concealment in a bag/pocket/clothing, looking around, avoiding checkout, leaving quickly, high-value goods, removing tags, inconsistent explanations, prior similar incidents, or only saying 'I forgot' after security intervened.",
          "If the person later realizes the item was unpaid and decides to keep it, the analysis changes. Later dishonest retention can become important even if the original taking was accidental.",
        ],
      },
      {
        heading: "Evidence To Collect",
        items: [
          "CCTV from entry, item selection, movement around store, checkout area, exit, and security stop.",
          "Receipt history, payment attempt, wallet/Octopus/card state, shopping list, phone call/distraction, child/medical/stress context, and immediate messages after the incident.",
          "Security/staff notes, police notebook/interview record, caution statement, body-worn video, item value, packaging/tag condition and where the item was carried.",
          "Any previous incidents must be handled carefully; similar-fact/bad-character use is a separate evidence issue and should not be casually assumed admissible.",
        ],
      },
      {
        heading: "Practical Criminal Procedure",
        items: [
          "If police are involved, treat interview strategy as urgent. Do not give an improvised explanation without understanding the caution, disclosure position and right to legal advice.",
          "If the explanation is true, preserve evidence quickly: CCTV may be overwritten, staff memory fades, and payment/phone/location records may become harder to retrieve.",
          "A caution or diversion route may require an admission, which may conflict with a genuine 'I forgot' defence. Do not describe it as automatically available.",
          "Penalty and mitigation depend on charge, value, record, plea, restitution, mental health/distraction evidence and prosecution facts; keep sentencing advice separate from liability analysis.",
        ],
      },
      {
        heading: "Source / Review Gate",
        items: [
          "Use Cap. 210 sections 2, 4, 5, 6, 7 and 9 as official statutory anchors before final advice.",
          "For dishonesty, do not state that Ivey has been adopted in Hong Kong unless a verified HK authority card supports that proposition. The local public candidate card for HKSAR v Chan Kam Ching [2022] HKCFA 7 records Ghosh as the Hong Kong position at that point, but it is still machine-candidate until reviewed for this theft scenario.",
          "Do not cite shoplifting cases unless HKLII/LegalRef paragraph cards are attached and mapped to the precise issue: dishonesty, intention permanently to deprive, continuing appropriation, similar fact, or sentencing.",
        ],
      },
    ],
  };
}

function genericCriminalLawAnswer() {
  return {
    title: "Criminal Law Triage",
    short_answer: "This is a source-gated criminal-law question. The system should classify the offence family, identify elements and mental-state issues, retrieve source-linked authority, and keep unsupported propositions at research-only status.",
    sections: [
      {
        heading: "Current Gate",
        items: [
          "Classify the offence family before retrieving forms or unrelated civil-law nodes.",
          "Use source-linked case fruits, statute nodes and paragraph proof before stating a final legal position.",
        ],
      },
    ],
  };
}

function appliedCriminalLawAnswer(classification) {
  if (classification.scenario === "public_order_unlawful_assembly_riot") return publicOrderAnswer();
  if (classification.scenario === "sedition_public_expression") return seditionAnswer();
  if (classification.subscenario === "shoplifting_forgot_to_pay_mr_defence") return theftShopliftingForgotToPayAnswer(classification);
  return genericCriminalLawAnswer();
}

function answerSectionsForScenario(classification) {
  if (classification.subscenario === "shoplifting_forgot_to_pay_mr_defence") {
    return [
      "Offence Framework",
      "AR / MR Matrix",
      "Forgot-To-Pay Defence",
      "Evidence To Collect",
      "Practical Criminal Procedure",
      "Source / Review Gate",
    ];
  }
  if (classification.scenario === "sedition_public_expression") {
    return ["Short Answer", "Likely Legal Issues", "Facts Needed", "Source / Review Gate"];
  }
  return ["Short Answer", "Likely Legal Issues", "Evidence Factors", "Possible Defence / Mitigation Lines", "Source / Review Gate"];
}

function requiredSourceFamiliesForScenario(classification) {
  if (classification.subscenario === "shoplifting_forgot_to_pay_mr_defence") {
    return [
      "criminal_law_hk.theft",
      "criminal_law_hk.theft.appropriation",
      "criminal_law_hk.theft.dishonesty",
      "criminal_law_hk.theft.intent.deprive",
    ];
  }
  if (classification.scenario === "public_order_unlawful_assembly_riot") {
    return ["criminal_law_hk.public_order", "criminal_law_hk.joint.enterprise"];
  }
  return ["criminal_law_hk"];
}

function sourceBackedRulesForScenario(classification) {
  if (classification.subscenario !== "shoplifting_forgot_to_pay_mr_defence") return [];
  return [
    {
      id: "hk_theft_cap210_s2_definition",
      proposition: "Theft requires dishonest appropriation of property belonging to another with intention permanently to deprive.",
      source: "Theft Ordinance (Cap. 210) s.2",
      official_url: "https://www.elegislation.gov.hk/hk/cap210/s2",
      verification_status: "source_verification_required",
    },
    {
      id: "hk_theft_cap210_s4_appropriation",
      proposition: "Appropriation covers assumption of an owner's rights and is the physical element usually engaged by taking store goods.",
      source: "Theft Ordinance (Cap. 210) s.4",
      official_url: "https://www.elegislation.gov.hk/hk/cap210/s4",
      verification_status: "source_verification_required",
    },
    {
      id: "hk_theft_cap210_s7_intent_permanently_deprive",
      proposition: "Intention permanently to deprive is a separate theft element and must be analysed apart from mere non-payment.",
      source: "Theft Ordinance (Cap. 210) s.7",
      official_url: "https://www.elegislation.gov.hk/hk/cap210/s7",
      verification_status: "source_verification_required",
    },
    {
      id: "hk_theft_chan_kam_ching_dishonesty_candidate",
      proposition: "Dishonesty is a state-of-mind issue; the current HK dishonesty test must be verified against HK authority before final advice.",
      source: "HKSAR v Chan Kam Ching [2022] HKCFA 7, paras. 148-149",
      official_url: "https://legalref.judiciary.hk/lrs/common/search/search_result_detail_frame.jsp?DIS=143540&QS=%2B&TP=JU&ILAN=en",
      verification_status: "machine_candidate_human_review_required",
    },
  ];
}

function unsupportedClaimsForScenario(classification) {
  if (classification.subscenario !== "shoplifting_forgot_to_pay_mr_defence") return [];
  return [
    "No final statement about Ivey replacing Ghosh in Hong Kong should be made without a verified HK authority card.",
    "No shoplifting-specific HK case comparison is answer-safe until HKLII/LegalRef paragraph cards are attached.",
    "No final advice on caution, charge outcome or sentence can be given without police/prosecution facts and lawyer review.",
  ];
}

function composeCriminalLawAnswer({ query, matched }) {
  const classification = classifyCriminalLaw(query);
  const matchedNodeIds = (matched || []).map(item => item.doctrine_node_id).filter(Boolean);
  const structuredAnalysis = buildAppliedAnalysis({
    domain: "criminal_law",
    scenario: classification.scenario,
    subscenario: classification.subscenario,
    query,
    facts: classification.detected_facts,
  });
  const sourceBackedRules = structuredAnalysis.matched ? structuredAnalysis.source_backed_rules : sourceBackedRulesForScenario(classification);
  const unsupportedClaims = structuredAnalysis.matched ? structuredAnalysis.unsupported_claims : unsupportedClaimsForScenario(classification);
  return {
    applied_answer: structuredAnalysis.matched
      ? structuredAnalysis.applied_answer
      : {
        ...appliedCriminalLawAnswer(classification),
        answer_generation_mode: "deterministic_fallback_template",
      },
    classification,
    answer_contract: {
      ...(structuredAnalysis.matched ? structuredAnalysis.answer_contract : {}),
      domain: "criminal_law",
      scenario_family: classification.scenario,
      subscenario: classification.subscenario,
      answer_sections: structuredAnalysis.matched ? structuredAnalysis.answer_contract.answer_sections : answerSectionsForScenario(classification),
      required_source_families: structuredAnalysis.matched ? structuredAnalysis.answer_contract.required_source_families : requiredSourceFamiliesForScenario(classification),
      excluded_issue_families: structuredAnalysis.matched ? structuredAnalysis.answer_contract.excluded_issue_families : ["personal_injury", "premises_slip_fall", "road_traffic_compensation", "workplace_injury", "civil_procedure", "probate"],
      verification_rule: structuredAnalysis.matched ? structuredAnalysis.answer_contract.verification_rule : "Candidate case fruits are source-linked research only until human review promotes them.",
      answer_generation_mode: structuredAnalysis.matched ? structuredAnalysis.answer_generation_mode : "deterministic_fallback_template",
      verifier_status: structuredAnalysis.verification?.status || "not_run_fallback_template",
    },
    source_backed_rules: sourceBackedRules,
    unsupported_claims: unsupportedClaims,
    source_audit: {
      display: "collapsed",
      note: "Use matched criminal-law nodes and case-fruit paragraph proof. Do not use PI workflow for this question.",
      matched_doctrine_node_ids: matchedNodeIds,
      source_backed_rule_count: sourceBackedRules.length,
      unsupported_claims: unsupportedClaims,
      applied_analysis: structuredAnalysis.matched ? {
        rule_deck_id: structuredAnalysis.rule_deck_id,
        answer_generation_mode: structuredAnalysis.answer_generation_mode,
        llm_status: structuredAnalysis.llm_status,
        verifier: structuredAnalysis.verification,
      } : {
        answer_generation_mode: "deterministic_fallback_template",
        reason: structuredAnalysis.reason,
      },
    },
  };
}

module.exports = {
  classifyCriminalLaw,
  composeCriminalLawAnswer,
};
