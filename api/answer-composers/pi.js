function classifyPiMatter(query, routes) {
  const q = String(query || "").toLowerCase();
  const owner = /\b(owner|restaurant owner|my restaurant|our restaurant|occupier|defendant|insurer)\b/.test(q);
  const asksLetter = /\b(lawyer|solicitor|letter|claim letter|wait|ignore|respond)\b/.test(q);
  const asksQuantum = /\b(how much|compensation|damages|quantum|settlement|pay)\b/.test(q);
  const pedestrian = /\b(pedestrian|walking|walked|crossing|zebra|traffic light|red light|green light|no white lines|no zebra|hit by car|knocked down|crashed by a car)\b/.test(q);
  const claimant = /\b(i was|i am|i got|got hit|got crashed|i am injured|my client|claimant|plaintiff|customer|passenger|worker|employee|pedestrian)\b/.test(q);
  const stepByStep = /\b(what should i do|consecutively|next steps|step by step|after accident)\b/.test(q);
  let scenario = "personal_injury_general";
  if (/\b(fatal|death|deceased|dependency|estate)\b/.test(q)) scenario = "fatal_accident_dependency";
  else if (routes.has("traffic") && pedestrian) scenario = "pedestrian_road_traffic_collision_uncontrolled_crossing";
  else if (routes.has("traffic") && /\b(passenger|taxi|bus|vehicle|car|driver|collision|road traffic|rta)\b/.test(q)) scenario = "road_traffic_passenger_or_road_user";
  else if (routes.has("workplace") && /\b(scaffold|height|site|worker|employee|workplace|fall|fell|industrial)\b/.test(q)) scenario = "workplace_fall_or_site_injury";
  else if (routes.has("premises") && /\b(restaurant|wet floor|water|mop|mopped|slip|slipped)\b/.test(q)) scenario = "premises_wet_floor_slip";
  else if (routes.has("premises")) scenario = "premises_slip_trip";
  else if (routes.has("workplace")) scenario = "workplace_injury";
  else if (routes.has("traffic")) scenario = "road_traffic_injury";
  return {
    matter_type: "personal_injury",
    scenario,
    user_perspective: owner ? "defendant_occupier" : (pedestrian ? "claimant_pedestrian" : (claimant ? "claimant_or_injured_party" : "claimant_or_unspecified")),
    procedural_posture: asksLetter ? "pre_action_or_letter_expected" : (stepByStep ? "post_accident_early_triage" : "early_triage"),
    included_groups: [
      "occupiers_liability",
      "wet_floor_warning_inspection_cleaning_system",
      routes.has("traffic") && "driver_duty",
      routes.has("traffic") && "pedestrian_contributory_negligence",
      "causation_and_injury_proof",
      "contributory_negligence_or_warning_defence",
      routes.has("traffic") && "police_report",
      routes.has("traffic") && "insurance_or_mib",
      "quantum_evidence",
      "evidence_preservation",
      "insurer_and_pre_action_response",
    ].filter(Boolean).filter(group => routes.has("premises") || !group.includes("wet_floor")),
    excluded_groups: [
      !routes.has("traffic") && "road_traffic",
      !routes.has("workplace") && "workplace_employers_liability",
      !routes.has("premises") && "restaurant_premises",
      !/\b(fatal|death|deceased)\b/i.test(q) && "fatal_accident",
      !/\b(psychiatric|shock|ptsd|secondary victim)\b/i.test(q) && "psychiatric_injury",
      !routes.has("court_band") && "court_forum_first_line",
    ].filter(Boolean),
    asks_quantum: asksQuantum,
    asks_lawyer_letter: asksLetter,
  };
}

function buildPiAnswerContract(query, routes, classification, appliedAnswer) {
  const q = String(query || "").toLowerCase();
  const asksCourtOrFiling = /\b(court|forum|jurisdiction|cfi|district court|small claims|writ|issue proceedings|file|filing|claim amount|claim value|admission)\b/.test(q);
  const asksDefence = /\b(defence|defense|defend|deny|denying|liability response|respond|sued|claim letter|solicitor'?s letter)\b/.test(q);
  const asksClaimDraft = /\b(statement of claim|particulars of claim|pleading|draft claim|writ)\b/.test(q);
  let scenarioFamily = "personal_injury_general";
  if (classification.scenario.includes("road_traffic") || classification.scenario.includes("pedestrian")) scenarioFamily = "road_traffic";
  else if (classification.scenario.includes("workplace")) scenarioFamily = "workplace_injury";
  else if (classification.scenario.includes("fatal")) scenarioFamily = "fatal_accident";
  else if (classification.scenario.includes("premises") || classification.scenario.includes("wet_floor")) scenarioFamily = "premises_liability";

  const forbidden = [
    !routes.has("workplace") && "workplace_or_employer_family",
    !routes.has("premises") && "restaurant_or_premises_family",
    !routes.has("traffic") && "road_traffic_family",
    !/\b(fatal|death|deceased|dependency|estate)\b/.test(q) && "fatal_accident_family",
    !/\b(psychiatric|shock|ptsd|secondary victim)\b/.test(q) && "psychiatric_injury_family",
    !asksCourtOrFiling && "court_forum_or_admission_forms",
    classification.user_perspective.includes("claimant") && !asksDefence && "defence_first_forms",
    classification.user_perspective.includes("defendant") && !asksClaimDraft && "claimant_particulars_first_forms",
  ].filter(Boolean);

  const primaryIssuesByFamily = {
    premises_liability: ["occupier_control", "hazard_warning_inspection", "causation", "contributory_negligence", "medical_quantum"],
    workplace_injury: ["safe_system", "safe_place", "training_supervision", "employees_compensation_overlap", "medical_quantum"],
    road_traffic: ["driver_duty", "pedestrian_or_passenger_conduct", "police_report", "insurance_or_mib", "medical_quantum"],
    fatal_accident: ["authority_to_act", "dependency", "estate_or_dependant_loss", "minor_or_protected_party_review", "liability_evidence"],
    personal_injury_general: ["liability_route", "causation", "medical_quantum", "evidence_preservation", "review_gate"],
  };

  return {
    domain: "personal_injury",
    scenario_family: scenarioFamily,
    scenario_subtype: classification.scenario,
    user_perspective: classification.user_perspective,
    procedural_posture: classification.procedural_posture,
    primary_issues: primaryIssuesByFamily[scenarioFamily] || primaryIssuesByFamily.personal_injury_general,
    excluded_issues: classification.excluded_groups || [],
    answer_sections: (appliedAnswer?.sections || []).map(section => section.heading),
    forbidden_terms_or_families: forbidden,
    required_next_steps: [
      "preserve_evidence",
      "collect_medical_and_loss_material",
      "identify_parties_and_insurance",
      "lawyer_review_before_final_position",
    ],
    required_missing_facts: [
      "accident date/time/location",
      "injury diagnosis and prognosis",
      "causation evidence",
      "income loss and receipts",
      "insurance / opposing party details",
    ],
  };
}

function chunkText(chunk) {
  const meta = chunk.metadata || {};
  return [
    chunk.chunk_id,
    chunk.layer,
    chunk.title,
    chunk.source_file,
    chunk.citation,
    chunk.pinpoint,
    chunk.quote,
    ...(meta.trigger_conditions || []),
    ...(meta.linked_procedure_nodes || []),
    ...(meta.linked_principle_nodes || []),
    ...(meta.required_facts || []),
  ].join(" ").toLowerCase();
}

function isForbiddenByContract(chunk, contract) {
  const blob = chunkText(chunk);
  const title = String(chunk.title || "").toLowerCase();
  const forbidden = new Set(contract?.forbidden_terms_or_families || []);
  if (forbidden.has("workplace_or_employer_family") && /safe plant|workplace|work injury|employer|employee|employees' compensation|eco_form|occupational|industrial|scaffold|machinery|lifting appliance|dangerous substances|dermatitis|deafness|electrocution|unguarded/.test(blob)) return true;
  if (forbidden.has("restaurant_or_premises_family") && /restaurant|wet floor|mop|mopped|spillage|cleaning|inspection|occupier|occupiers|premises|common area|mall|warning sign/.test(blob)) return true;
  if (forbidden.has("road_traffic_family") && /road traffic|rta|driver duty|pedestrian|passenger|vehicle|seatbelt|taxi|collision|traffic light|zebra/.test(blob)) return true;
  if (forbidden.has("fatal_accident_family") && /fatal|death|deceased|dependency|estate claim|dependant/.test(blob)) return true;
  if (forbidden.has("psychiatric_injury_family") && /psychiatric|secondary victim|nervous shock|ptsd/.test(blob)) return true;
  if (forbidden.has("court_forum_or_admission_forms") && /forum \/ jurisdiction|forum_jurisdiction|mode of commencement|court limits|small claims|court of first instance admission|district court admission|form 16c|admission - unliquidated|unliquidated amount|cfi_admission|dc_admission/.test(blob)) return true;
  if (forbidden.has("defence_first_forms") && (/^defen[cs]e\b/.test(title) || /\bdefen[cs]e\b/.test(blob))) return true;
  if (forbidden.has("claimant_particulars_first_forms") && /particulars of claim|statement of claim|claimant particulars|plaintiff particulars/.test(blob)) return true;
  return false;
}

function filterPiChunksByContract(chunks, contract) {
  if (!contract) return chunks || [];
  const filtered = (chunks || []).filter(chunk => !isForbiddenByContract(chunk, contract));
  return filtered.length ? filtered : [];
}

function publicPiAnswerContract(contract) {
  const labelFor = {
    workplace_or_employer_family: "non-matching injury pathway",
    restaurant_or_premises_family: "non-matching premises pathway",
    road_traffic_family: "non-matching traffic pathway",
    fatal_accident_family: "non-matching dependency pathway",
    psychiatric_injury_family: "non-matching mental harm pathway",
    court_forum_or_admission_forms: "court / filing route not first-line",
    defence_first_forms: "defence route not first-line",
    claimant_particulars_first_forms: "claimant pleading route not first-line",
  };
  return {
    ...contract,
    excluded_issues: (contract?.forbidden_terms_or_families || []).map(item => labelFor[item] || "non-matching issue family"),
    forbidden_terms_or_families: (contract?.forbidden_terms_or_families || []).map(item => labelFor[item] || "non-matching issue family"),
  };
}

function defaultWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve accident evidence, photos, contemporaneous notes, witness details and any available CCTV or document trail.",
      "Collect medical records, diagnosis, treatment notes, sick leave and receipts.",
      "Identify all potentially responsible parties and any insurer or claims handler.",
      "Keep the workflow draft-only until source verification and lawyer review are complete.",
    ],
    quantum_and_consequences: [
      "No compensation range should be given without injury, causation and loss evidence.",
      "Quantum depends on medical diagnosis, prognosis, expenses, income loss, future loss, care and rehabilitation evidence.",
      "Any settlement or offer should remain lawyer-review-required until liability and quantum evidence are reviewed.",
    ],
    next_procedure_steps: [
      "intake and limitation screen",
      "evidence preservation",
      "medical and loss evidence collection",
      "party / insurance identification",
      "pre-action review",
      "lawyer review before pleadings or settlement",
    ],
    missing_information: [
      "accident date, time and exact location",
      "injury diagnosis and prognosis",
      "causation evidence",
      "income loss, expenses and receipts",
      "opposing party / insurer details",
    ],
  };
}

function restaurantWetFloorWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve CCTV before, during and after the incident, including the period when the floor was mopped and when the customer slipped.",
      "Keep cleaning/mopping logs, inspection records, incident report, staff roster and witness details.",
      "Preserve photos or records showing warning signs, cones, barriers, drying steps and the layout of the area.",
      "Record who mopped, when they mopped, whether the area was dried, and who checked it afterwards.",
      "Notify the insurer according to policy requirements while avoiding informal admissions of liability.",
    ],
    quantum_and_consequences: [
      "No sensible compensation estimate can be given from the current facts.",
      "Quantum depends on medical report, diagnosis, treatment, prognosis, sick leave, income loss, expenses, receipts and any long-term effect.",
      "If no injury or loss is proved, quantum may be minimal or may not progress.",
      "Settlement/offers should wait for liability evidence, medical evidence and quantum documents, and remain lawyer-review-required.",
    ],
    next_procedure_steps: [
      "incident intake and limitation screen",
      "CCTV / cleaning-log preservation",
      "insurer notification without admission",
      "medical/injury proof request",
      "pre-action response / letter handling",
      "liability and quantum review",
      "settlement or pleadings only after evidence review",
    ],
    missing_information: [
      "whether the customer was injured",
      "medical report / diagnosis",
      "incident report",
      "CCTV preservation and timestamp",
      "when the floor was mopped",
      "whether warning signs or barriers were used",
      "cleaning / inspection log",
      "staff and customer witness details",
      "insurance notification / policy details",
      "losses claimed by the customer",
    ],
  };
}

function premisesClaimantWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve photos of the premises, hazard, lighting, warning signs and injury.",
      "Request CCTV and incident records quickly before routine deletion.",
      "Record witness details and staff/management company contacts.",
      "Keep medical records, sick leave, receipts and income-loss documents.",
    ],
    quantum_and_consequences: [
      "No compensation estimate should be given without diagnosis, prognosis and loss documents.",
      "Quantum turns on injury severity, treatment, recovery, earnings loss, expenses, future symptoms and care needs.",
      "Contributory negligence and causation may affect liability and settlement value.",
    ],
    next_procedure_steps: [
      "intake and limitation screen",
      "premises control / occupier identification",
      "CCTV and incident-record preservation request",
      "medical and loss evidence collection",
      "pre-action letter candidate review",
      "particulars / schedule only after source and template review",
    ],
    missing_information: [
      "accident date and exact location",
      "who controlled or operated the area",
      "hazard description",
      "warning signs / inspection system",
      "medical diagnosis and prognosis",
      "income loss and expenses",
    ],
  };
}

function workplaceWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve accident report, Labour Department or internal report, site photos, CCTV and witness details.",
      "Preserve work platform/access evidence, stacking or storage method, permits and site layout records.",
      "Collect risk assessments, method statements, toolbox talks, training records, supervision records and inspection records.",
      "Preserve PPE, harness, guardrail, scaffold, machinery or equipment records where relevant.",
      "Identify employer, main contractor, subcontractor, occupier/site controller and any insurer.",
      "Collect medical reports, wage records, sick leave and expenses for the common-law and Employees' Compensation routes.",
    ],
    quantum_and_consequences: [
      "No compensation estimate should be given without medical, wage-loss and prognosis evidence.",
      "Quantum depends on injury severity, recovery, past and future earnings loss, medical expenses, care, rehabilitation and any long-term impairment.",
      "Employees' Compensation and common-law personal injury routes should be tracked separately and lawyer-reviewed.",
    ],
    next_procedure_steps: [
      "intake and limitation / EC deadline screen",
      "worksite evidence preservation",
      "employer / contractor / site-controller identification",
      "Labour Department / internal report collection",
      "medical and wage-loss evidence collection",
      "Employees' Compensation overlay review",
      "pre-action or pleading review after liability evidence",
    ],
    missing_information: [
      "employment status and employer identity",
      "work task and accident mechanism",
      "platform/access/stacking/storage method",
      "training, supervision and safety system records",
      "PPE / harness / guardrail / equipment records where relevant",
      "main contractor, subcontractor and site-controller identities",
      "medical diagnosis, prognosis and wage-loss evidence",
      "Employees' Compensation status",
    ],
  };
}

function pedestrianRtaWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve police report/reference number and traffic accident investigation material.",
      "Collect driver, vehicle, registration and insurance details.",
      "Preserve CCTV/dashcam from nearby shops, buses, taxis, buildings or road cameras where available.",
      "Record road layout, visibility, lighting, traffic direction, crossing point and impact location.",
      "Keep medical report, treatment records, sick leave, receipts and income-loss material.",
    ],
    quantum_and_consequences: [
      "No sensible compensation estimate can be given without injury evidence.",
      "Quantum depends on diagnosis, treatment, prognosis, sick leave, income loss, expenses, future symptoms and care/transport evidence.",
      "Pedestrian conduct and driver conduct may affect liability and any reduction for contributory negligence.",
    ],
    next_procedure_steps: [
      "medical treatment and police/traffic report confirmation",
      "driver / vehicle / insurer identification",
      "CCTV / dashcam preservation",
      "road layout and witness evidence collection",
      "medical and income-loss evidence collection",
      "pre-action / insurer correspondence review",
      "settlement or pleadings only after evidence review",
    ],
    missing_information: [
      "accident date/time and exact road location",
      "driver, vehicle and insurer details",
      "police report/reference number",
      "road layout, lighting and visibility",
      "where the pedestrian crossed and impact point",
      "CCTV/dashcam/witness availability",
      "medical diagnosis, prognosis and income loss",
    ],
  };
}

function roadTrafficWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve police report/reference number, vehicle details, insurer details, photos and witness contacts.",
      "Collect dashcam/CCTV, scene photos, vehicle damage records and any repair/traffic investigation material.",
      "Keep medical reports, treatment records, sick leave, receipts and income-loss documents.",
      "Record claimant role: passenger, pedestrian, driver, motorcyclist or cyclist.",
    ],
    quantum_and_consequences: [
      "No compensation estimate should be given without medical and loss evidence.",
      "Quantum depends on injury severity, treatment, recovery, earnings loss, expenses, future loss and care needs.",
      "Seatbelt, speed, lookout, traffic signals, causation and contributory negligence may affect liability/value.",
    ],
    next_procedure_steps: [
      "intake and limitation screen",
      "police / traffic evidence collection",
      "driver / owner / insurer identification",
      "medical and loss evidence collection",
      "pre-action letter candidate review",
      "particulars / schedule only after source and template review",
    ],
    missing_information: [
      "accident date/time/location",
      "claimant role",
      "driver, owner and insurer details",
      "police reference and scene evidence",
      "medical diagnosis and prognosis",
      "income loss and expenses",
    ],
  };
}

function fatalWorkflowSupport() {
  return {
    evidence_plan: [
      "Preserve accident evidence, police/official reports, death/medical records and witness details.",
      "Collect authority-to-act, estate, dependant and relationship documents.",
      "Collect dependency, income, support, funeral/expense and household evidence.",
      "Identify any minors or protected parties and flag settlement approval requirements.",
    ],
    quantum_and_consequences: [
      "No valuation should be given without dependency, estate, income and expense evidence.",
      "Dependency, estate, funeral/expense and minor/protected-party issues must be separated and lawyer-reviewed.",
      "Settlement should remain draft-only/lawyer-review-required, especially where minors or protected parties are involved.",
    ],
    next_procedure_steps: [
      "authority-to-act and limitation screen",
      "accident / liability evidence preservation",
      "death and medical evidence collection",
      "dependant / estate evidence collection",
      "minor or protected-party review",
      "pre-action or pleading review after evidence",
    ],
    missing_information: [
      "date and cause of death",
      "authority to act",
      "dependants and relationship evidence",
      "income/support/dependency evidence",
      "estate and funeral/expense evidence",
      "minor or protected-party status",
    ],
  };
}

function workflowSupportForPi(classification) {
  switch (classification.scenario) {
    case "premises_wet_floor_slip":
      return classification.user_perspective === "defendant_occupier"
        ? restaurantWetFloorWorkflowSupport()
        : premisesClaimantWorkflowSupport();
    case "premises_slip_trip":
      return premisesClaimantWorkflowSupport();
    case "workplace_fall_or_site_injury":
    case "workplace_injury":
      return workplaceWorkflowSupport();
    case "pedestrian_road_traffic_collision_uncontrolled_crossing":
      return pedestrianRtaWorkflowSupport();
    case "road_traffic_passenger_or_road_user":
    case "road_traffic_injury":
      return roadTrafficWorkflowSupport();
    case "fatal_accident_dependency":
      return fatalWorkflowSupport();
    default:
      return defaultWorkflowSupport();
  }
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

function pedestrianRoadTrafficTriage() {
  return {
    title: "Applied Triage - Pedestrian Road Traffic Accident",
    short_answer: "Get medical help and preserve evidence first. The absence of zebra lines or traffic lights does not automatically defeat a claim, but it makes the exact crossing facts important because the driver’s conduct and the pedestrian’s own care may both be disputed.",
    sections: [
      {
        heading: "Immediate Steps",
        items: [
          "Seek medical treatment first and keep the diagnosis, treatment records, sick leave and receipts.",
          "Report or confirm the police/traffic accident record if this has not already been done.",
          "Preserve the driver and vehicle details, insurance information, registration number, photos, CCTV, dashcam footage and witness contacts.",
          "Write down the sequence while fresh: where you crossed, lighting, visibility, traffic direction, vehicle speed as perceived, and where the impact occurred.",
          "Do not settle quickly or sign a release before medical prognosis and loss evidence are reviewed.",
        ],
      },
      {
        heading: "Liability / Driver Duty",
        items: [
          "This is a road traffic personal injury scenario.",
          "Relevant driver issues include lookout, speed, control, reaction time, road conditions and whether the driver should have seen the pedestrian.",
          "The fact that there was no zebra crossing or traffic light is important, but it does not by itself answer liability.",
          "Causation still matters: the evidence must link the collision to the injury and claimed losses.",
        ],
      },
      {
        heading: "Pedestrian Conduct / Contributory Negligence",
        items: [
          "Expect questions about where you crossed, whether a safer crossing was nearby, whether you looked both ways, lighting, obstruction, traffic speed and visibility.",
          "If the pedestrian failed to take reasonable care, the claim may still exist but damages may be reduced.",
          "If the driver was speeding, distracted, failed to keep proper lookout or had time to react, that may support liability despite the uncontrolled crossing.",
        ],
      },
      {
        heading: "Evidence To Preserve",
        items: [
          "Police report/reference number and any traffic accident investigation material.",
          "CCTV/dashcam from nearby shops, buses, taxis, buildings or road cameras where available.",
          "Photos or sketch of the road, crossing point, lighting, traffic direction, sight lines and vehicle damage.",
          "Witness names, driver details, insurer details and any ambulance/A&E records.",
        ],
      },
      {
        heading: "Medical Evidence / Quantum",
        items: [
          "No sensible compensation estimate can be given without injury evidence.",
          "You need medical diagnosis, treatment, prognosis, sick leave, income loss, receipts, future symptoms and care/transport evidence.",
          "Compensation analysis should separate general damages, expenses, loss of earnings, future loss and any care or rehabilitation needs.",
        ],
      },
      {
        heading: "If Insurer or Solicitor Gets Involved",
        items: [
          "Do not ignore correspondence from an insurer or solicitor.",
          "Respond through solicitor/insurer channels where possible and keep copies of all communications.",
          "Ask for or provide documents in a controlled way; avoid informal admissions or early settlement figures before evidence is reviewed.",
        ],
      },
      {
        heading: "Relevant Internal Templates",
        items: [
          "RTA incident checklist.",
          "Police / traffic accident report request.",
          "CCTV and dashcam preservation request.",
          "Medical evidence checklist.",
          "Pre-action letter candidate.",
          "Particulars of claim - pedestrian crossing / uncontrolled road candidate.",
          "Schedule of damages candidate.",
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
  if (classification.scenario === "pedestrian_road_traffic_collision_uncontrolled_crossing") return pedestrianRoadTrafficTriage(query, routes, classification);
  if (classification.scenario === "road_traffic_passenger_or_road_user" || classification.scenario === "road_traffic_injury") return roadTrafficTriage(query, routes, classification);
  if (classification.scenario === "fatal_accident_dependency") return fatalAccidentTriage(query, routes, classification);
  return genericPiTriage(query, routes, classification);
}

function composePiAnswer({ query, routes }) {
  const classification = classifyPiMatter(query, routes);
  const appliedAnswer = buildAppliedTriage(query, routes, classification);
  const answerContract = buildPiAnswerContract(query, routes, classification, appliedAnswer);
  const publicContract = publicPiAnswerContract(answerContract);
  const workflowSupport = workflowSupportForPi(classification);
  return {
    applied_answer: appliedAnswer,
    answer_contract: publicContract,
    filter_contract: answerContract,
    classification: {
      ...classification,
      excluded_groups: publicContract.excluded_issues,
    },
    workflow_support: workflowSupport,
    source_audit: {
      display: "collapsed",
      note: "Raw retrieved source chunks should remain in the audit trail, not the main lawyer-facing answer.",
    },
  };
}

module.exports = {
  buildAppliedTriage,
  buildPiAnswerContract,
  classifyPiMatter,
  composePiAnswer,
  filterPiChunksByContract,
  publicPiAnswerContract,
  workflowSupportForPi,
};
