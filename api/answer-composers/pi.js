function classifyPiMatter(query, routes) {
  const q = String(query || "").toLowerCase();
  const owner = /\b(owner|restaurant owner|my restaurant|our restaurant|occupier|defendant|insurer)\b/.test(q);
  const asksLetter = /\b(lawyer|solicitor|letter|claim letter|wait|ignore|respond)\b/.test(q);
  const asksQuantum = /\b(how much|compensation|damages|quantum|settlement|pay)\b/.test(q);
  let scenario = "personal_injury_general";
  if (routes.has("premises") && /\b(restaurant|wet floor|water|mop|mopped|slip|slipped)\b/.test(q)) scenario = "premises_wet_floor_slip";
  else if (routes.has("premises")) scenario = "premises_slip_trip";
  else if (routes.has("workplace")) scenario = "workplace_injury";
  else if (routes.has("traffic")) scenario = "road_traffic_injury";
  return {
    matter_type: "personal_injury",
    scenario,
    user_perspective: owner ? "defendant_occupier" : "claimant_or_unspecified",
    procedural_posture: asksLetter ? "pre_action_or_letter_expected" : "early_triage",
    included_groups: [
      "occupiers_liability",
      "wet_floor_warning_inspection_cleaning_system",
      "causation_and_injury_proof",
      "contributory_negligence_or_warning_defence",
      "quantum_evidence",
      "evidence_preservation",
      "insurer_and_pre_action_response",
    ].filter(group => routes.has("premises") || !group.includes("wet_floor")),
    excluded_groups: [
      !routes.has("traffic") && "road_traffic",
      !routes.has("workplace") && "workplace_employers_liability",
      !/\b(fatal|death|deceased)\b/i.test(q) && "fatal_accident",
      !/\b(psychiatric|shock|ptsd|secondary victim)\b/i.test(q) && "psychiatric_injury",
      !routes.has("court_band") && "court_forum_first_line",
    ].filter(Boolean),
    asks_quantum: asksQuantum,
    asks_lawyer_letter: asksLetter,
  };
}

function genericPiTriage() {
  return {
    title: "Applied PI Triage",
    short_answer: "This is a source-gated PI workflow triage. Treat the result as research-only and use it to identify issues, evidence gaps, next steps and forms for lawyer review.",
    sections: [
      { heading: "Immediate Actions", items: ["Preserve accident evidence now.", "Identify missing facts before taking a liability or quantum position.", "Escalate limitation, insurance and procedural issues for lawyer review."] },
      { heading: "Liability / Principles", items: ["Use the retrieved principle nodes only as issue spotting until source cards are verified.", "Do not turn precedent or form metadata into legal authority."] },
      { heading: "Procedure / Forms", items: ["Use retrieved forms as metadata-only candidates.", "No final form or pleading should be generated until the correct template/source is loaded and reviewed."] },
    ],
  };
}

function restaurantWetFloorDefendantTriage() {
  return {
    title: "Applied Triage - Restaurant Wet-Floor Slip",
    short_answer: "Do not simply wait passively for a solicitor's letter. Preserve evidence immediately, notify your insurer, avoid informal admissions of liability, and be ready to respond through insurer/solicitor channels if a claim letter arrives.",
    sections: [
      {
        heading: "Liability Risk Analysis",
        items: [
          "This is primarily a premises / occupiers' liability scenario because the restaurant operator may be treated as the person in control of the floor area.",
          "The fact that staff mopped the floor does not by itself answer liability. The key question is whether reasonable precautions were taken after mopping: drying, warning sign, cone/barrier, monitoring, timing and visibility.",
          "If the floor was left wet without adequate warning and that caused the slip and injury, liability risk increases.",
          "If there was a clear warning, prompt cleaning, reasonable inspection, or the customer ignored an obvious risk, liability may be disputed or reduced.",
          "The customer still needs to prove causation and actual injury/loss; a slip incident alone is not enough to value compensation.",
        ],
      },
      {
        heading: "Evidence To Preserve Now",
        items: [
          "Save CCTV before, during and after the incident, including the period when the floor was mopped and when the customer slipped.",
          "Keep cleaning/mopping logs, inspection records, incident report, staff roster and witness details.",
          "Preserve photos or records showing warning signs, cones, barriers, drying steps and the layout of the area.",
          "Record who mopped, when they mopped, whether the area was dried, and who checked it afterwards.",
          "Notify the insurer according to policy requirements, but avoid admitting liability in casual messages or to the customer.",
        ],
      },
      {
        heading: "Compensation / Quantum",
        items: [
          "No sensible compensation estimate can be given from the current facts.",
          "Quantum depends on medical report, diagnosis, treatment, prognosis, sick leave, income loss, expenses, receipts and whether there is any long-term effect.",
          "If no injury or loss is proved, quantum may be minimal or may not progress.",
          "If there is fracture, surgery, long sick leave, persistent symptoms or future loss, valuation can change materially.",
        ],
      },
      {
        heading: "If A Solicitor's Letter Arrives",
        items: [
          "Do not ignore it.",
          "Send it promptly to your insurer and/or solicitor.",
          "Acknowledge receipt without admission if a response is needed.",
          "Request medical evidence, particulars of injury/loss and the claimant's account of how the accident happened.",
          "Preserve rights and avoid informal settlement figures until liability evidence and medical/quantum evidence are reviewed.",
        ],
      },
      {
        heading: "Relevant Internal Templates",
        items: [
          "Incident/evidence checklist.",
          "CCTV preservation note.",
          "Insurer notification record.",
          "Pre-action response letter.",
          "Occupiers' liability defence / liability-response template.",
          "Quantum evidence request and counter-schedule of damages template if figures are claimed.",
        ],
      },
    ],
  };
}

function buildAppliedTriage(query, routes, classification) {
  const premisesOwner = classification.scenario === "premises_wet_floor_slip" && classification.user_perspective === "defendant_occupier";
  return premisesOwner ? restaurantWetFloorDefendantTriage(query, routes, classification) : genericPiTriage(query, routes, classification);
}

function composePiAnswer({ query, routes }) {
  const classification = classifyPiMatter(query, routes);
  const appliedAnswer = buildAppliedTriage(query, routes, classification);
  return {
    applied_answer: appliedAnswer,
    classification,
    source_audit: {
      display: "collapsed",
      note: "Raw retrieved source chunks should remain in the audit trail, not the main lawyer-facing answer.",
    },
  };
}

module.exports = {
  buildAppliedTriage,
  classifyPiMatter,
  composePiAnswer,
};
