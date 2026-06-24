function classifyCriminalLaw(query) {
  const q = String(query || "").toLowerCase();
  let scenario = "criminal_law_general";
  if (/\b(unlawful assembly|riot|public order|protest|protestor|protester|harcourt road|black|conceal(?:ed|ment)?|hand(?:ed|ing)? water|water to protest|2019)\b/.test(q)) {
    scenario = "public_order_unlawful_assembly_riot";
  } else if (/\b(sedition|seditious|publication|speech|chant|slogan|incitement)\b/.test(q)) {
    scenario = "sedition_public_expression";
  }

  let userPerspective = "unspecified";
  if (/\b(i|me|my|my client|accused|defendant|suspect|caught|arrested|charged)\b/.test(q)) {
    userPerspective = "suspect_accused_or_defence";
  }

  return {
    matter_type: "criminal_law",
    scenario,
    user_perspective: userPerspective,
    procedural_posture: /\b(caught|arrested|charged|prosecuted|convicted)\b/.test(q)
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
  return genericCriminalLawAnswer();
}

function composeCriminalLawAnswer({ query, matched }) {
  const classification = classifyCriminalLaw(query);
  const matchedNodeIds = (matched || []).map(item => item.doctrine_node_id).filter(Boolean);
  return {
    applied_answer: appliedCriminalLawAnswer(classification),
    classification,
    answer_contract: {
      domain: "criminal_law",
      scenario_family: classification.scenario,
      answer_sections: classification.scenario === "sedition_public_expression"
        ? ["Short Answer", "Likely Legal Issues", "Facts Needed", "Source / Review Gate"]
        : ["Short Answer", "Likely Legal Issues", "Evidence Factors", "Possible Defence / Mitigation Lines", "Source / Review Gate"],
      required_source_families: classification.scenario === "public_order_unlawful_assembly_riot"
        ? ["criminal_law_hk.public_order", "criminal_law_hk.joint.enterprise"]
        : ["criminal_law_hk"],
      excluded_issue_families: ["personal_injury", "premises_slip_fall", "road_traffic_compensation", "workplace_injury"],
      verification_rule: "Candidate case fruits are source-linked research only until human review promotes them.",
    },
    source_audit: {
      display: "collapsed",
      note: "Use matched criminal-law nodes and case-fruit paragraph proof. Do not use PI workflow for this question.",
      matched_doctrine_node_ids: matchedNodeIds,
    },
  };
}

module.exports = {
  classifyCriminalLaw,
  composeCriminalLawAnswer,
};
