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
    short_answer: "This is a criminal-law public-expression issue. The system should separate statutory elements, meaning/context, constitutionality arguments, procedure/consent issues and source-linked paragraph proof before giving any final view.",
    sections: [
      {
        heading: "Issues",
        items: [
          "Identify the exact words, publication, audience and context.",
          "Separate seditious intention, publication/uttering conduct, constitutional/free-expression arguments and procedure/jurisdiction.",
          "Treat case fruits as source-linked research until reviewed.",
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
      answer_sections: ["Short Answer", "Likely Legal Issues", "Evidence Factors", "Possible Defence / Mitigation Lines", "Source / Review Gate"],
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
