function classifyPiMatter(query, routes) {
  const q = String(query || "").toLowerCase();
  const owner = /\b(owner|restaurant owner|my restaurant|our restaurant|occupier|defendant|insurer)\b/.test(q);
  const asksLetter = /\b(lawyer|solicitor|letter|claim letter|wait|ignore|respond)\b/.test(q);
  const asksQuantum = /\b(how much|compensation|damages|quantum|settlement|pay)\b/.test(q);
  const claimant = /\b(i was|i am injured|my client|claimant|plaintiff|customer|passenger|worker|employee)\b/.test(q);
  let scenario = "personal_injury_general";
  if (/\b(fatal|death|deceased|dependency|estate)\b/.test(q)) scenario = "fatal_accident_dependency";
  else if (routes.has("traffic") && /\b(passenger|taxi|bus|vehicle|car|driver|collision|road traffic|rta)\b/.test(q)) scenario = "road_traffic_passenger_or_road_user";
  else if (routes.has("workplace") && /\b(scaffold|height|site|worker|employee|workplace|fall|fell|industrial)\b/.test(q)) scenario = "workplace_fall_or_site_injury";
  else if (routes.has("premises") && /\b(restaurant|wet floor|water|mop|mopped|slip|slipped)\b/.test(q)) scenario = "premises_wet_floor_slip";
  else if (routes.has("premises")) scenario = "premises_slip_trip";
  else if (routes.has("workplace")) scenario = "workplace_injury";
  else if (routes.has("traffic")) scenario = "road_traffic_injury";
  return {
    matter_type: "personal_injury",
    scenario,
    user_perspective: owner ? "defendant_occupier" : (claimant ? "claimant_or_injured_party" : "claimant_or_unspecified"),
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

function premisesSlipClaimantTriage() {
  return {
    title: "Applied Triage - Premises Slip / Fall",
    short_answer: "Treat this first as an evidence-preservation and medical-proof problem. The legal route may involve occupiers' liability or negligence, but the practical question is whether the occupier had control of the area and whether the hazard, warning and inspection system can be proved.",
    sections: [
      {
        heading: "Applied Liability Analysis",
        items: [
          "Identify who controlled the premises or the specific common area where the fall happened.",
          "Record the hazard precisely: water, grease, uneven surface, staircase defect, lack of warning or poor lighting.",
          "The key factual issues are notice, warning, inspection, cleaning system, timing and whether the hazard caused the fall.",
          "Expect possible arguments about contributory negligence, visibility of the hazard, footwear, rushing or ignoring warnings.",
        ],
      },
      {
        heading: "Immediate Steps",
        items: [
          "Seek medical assessment and keep all reports, receipts and sick-leave records.",
          "Ask for CCTV preservation quickly before routine deletion.",
          "Keep photos of the location, hazard, warning signs and injury.",
          "Record witness names and staff details if available.",
        ],
      },
      {
        heading: "Documents / Forms",
        items: [
          "Incident evidence checklist.",
          "CCTV / document preservation request.",
          "Letter before action candidate.",
          "Particulars of claim / schedule of damages candidates only after facts and medical evidence are assembled.",
        ],
      },
      {
        heading: "Missing Facts",
        items: [
          "Accident date and exact location.",
          "Who controlled or operated the area.",
          "What warnings were visible.",
          "Medical diagnosis, prognosis, income loss and expenses.",
        ],
      },
    ],
  };
}

function workplaceInjuryTriage() {
  return {
    title: "Applied Triage - Workplace / Site Injury",
    short_answer: "Do not treat this as a simple accident report only. Preserve worksite evidence, identify the employer/contractor structure, and keep the employees' compensation route separate from any common-law personal injury claim.",
    sections: [
      {
        heading: "Applied Liability Analysis",
        items: [
          "The first issues are employer/control, safe system of work, training, supervision, equipment, site condition and whether a contractor or occupier also had control.",
          "For a fall from height or scaffold incident, preserve records about access, platform condition, guardrails, harnesses, method statements and supervision.",
          "The claimant still needs medical causation and loss evidence; the defendant may dispute causation, breach, contributory negligence or quantum.",
        ],
      },
      {
        heading: "Immediate Steps",
        items: [
          "Preserve accident report, Labour Department or internal reports, site photos, CCTV, permits, toolbox records and risk assessments.",
          "Collect employment records, wage records, sick leave, medical reports and witness details.",
          "Flag limitation and employees' compensation deadlines for urgent lawyer review.",
        ],
      },
      {
        heading: "Documents / Forms",
        items: [
          "Workplace injury intake checklist.",
          "Employees' compensation overlay / notification form candidates.",
          "Employer liability particulars or defence candidates.",
          "Medical evidence and loss-of-earnings schedule candidates.",
        ],
      },
    ],
  };
}

function roadTrafficTriage() {
  return {
    title: "Applied Triage - Road Traffic Injury",
    short_answer: "Start with liability evidence, police/traffic records, insurance information and medical proof. A passenger or pedestrian claim often turns on driver conduct, causation, injury proof and contributory negligence if alleged.",
    sections: [
      {
        heading: "Applied Liability Analysis",
        items: [
          "Identify the claimant role: passenger, pedestrian, driver, motorcyclist or cyclist.",
          "Identify all possible defendants: driver, owner, employer, insurer or any other vehicle involved.",
          "Preserve police report details, scene photos, vehicle damage, dashcam/CCTV and witness information.",
          "Expect possible disputes over speed, lookout, traffic signals, seatbelt, alcohol, sudden emergency and causation.",
        ],
      },
      {
        heading: "Immediate Steps",
        items: [
          "Obtain medical report and treatment records.",
          "Keep repair/scene evidence and police reference details.",
          "Notify insurer where relevant and avoid informal admissions.",
          "Build a schedule of damages only after medical and income evidence are collected.",
        ],
      },
      {
        heading: "Documents / Forms",
        items: [
          "Road traffic letter before action / indorsement candidate.",
          "Road traffic particulars candidate.",
          "Medical evidence checklist.",
          "Schedule of damages / counter-schedule candidate depending on party perspective.",
        ],
      },
    ],
  };
}

function fatalAccidentTriage() {
  return {
    title: "Applied Triage - Fatal Accident / Dependency",
    short_answer: "This requires a separate fatal-accident workflow. Do not treat it as an ordinary injury-only claim: confirm estate/dependant status, authority to act, dependency evidence, medical/death evidence and any settlement-approval needs.",
    sections: [
      {
        heading: "Applied Analysis",
        items: [
          "Identify who has authority to act and who the dependants or estate beneficiaries may be.",
          "Separate liability evidence from dependency, bereavement/estate and funeral/expense evidence.",
          "Check limitation, minor/protected-party issues and any settlement approval requirements urgently.",
        ],
      },
      {
        heading: "Immediate Steps",
        items: [
          "Preserve accident evidence, death/medical records and police or official reports.",
          "Collect relationship, dependency, income and support evidence.",
          "Avoid final settlement without lawyer review, especially where minors or protected parties are involved.",
        ],
      },
      {
        heading: "Documents / Forms",
        items: [
          "Fatal accident intake checklist.",
          "Dependency schedule candidate.",
          "Estate/dependant particulars candidate.",
          "Minor/protected-party settlement approval candidate where triggered.",
        ],
      },
    ],
  };
}

function buildAppliedTriage(query, routes, classification) {
  const premisesOwner = classification.scenario === "premises_wet_floor_slip" && classification.user_perspective === "defendant_occupier";
  if (premisesOwner) return restaurantWetFloorDefendantTriage(query, routes, classification);
  if (classification.scenario === "premises_wet_floor_slip" || classification.scenario === "premises_slip_trip") return premisesSlipClaimantTriage(query, routes, classification);
  if (classification.scenario === "workplace_fall_or_site_injury" || classification.scenario === "workplace_injury") return workplaceInjuryTriage(query, routes, classification);
  if (classification.scenario === "road_traffic_passenger_or_road_user" || classification.scenario === "road_traffic_injury") return roadTrafficTriage(query, routes, classification);
  if (classification.scenario === "fatal_accident_dependency") return fatalAccidentTriage(query, routes, classification);
  return genericPiTriage(query, routes, classification);
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
