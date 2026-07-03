/**
 * Deterministic research-memo composer for AI Inquiry.
 *
 * Produces a structured, fact-sensitive research memo from paragraph-linked
 * evidence + structured case notes:
 *   short_answer, issues, authorities, paragraph_quotes, legal_principles,
 *   application_to_facts, missing_facts, distinguished_authorities,
 *   limitations, next_research_steps, abstain.
 *
 * Everything cited is drawn from verified paragraph proof; fact-sensitivity
 * comes from issue playbooks that bind fragments of the user's stated facts
 * to sub-issues and to the retrieved authorities.
 */
const { searchParagraphLinkedCases, isUnsupportedCivilRentQuery } = require("./case_authority_eval");
const { diversifyEvidence, groupEvidenceByCaseForAnswer } = require("./retrieval_diversity");

const ISSUE_PLAYBOOKS = [
  {
    id: "theft_elements",
    detect: /\b(theft|steal|stole|shoplift|forgot to pay|picked up goods|deprive|appropriat|belonging to another|dishonest)\b/i,
    issue: "Theft — elements under s.2 Theft Ordinance (Cap 210): dishonest appropriation of property belonging to another with intention permanently to deprive.",
    sub_issues: [
      { tag: "dishonesty", detect: /\b(forgot|honest|dishonest|mistake|belie(?:f|ved))\b/i, note: "Dishonesty is judged against the state of mind at the time of appropriation; a genuine lapse (forgetting to pay) can negate dishonesty." },
      { tag: "appropriation", detect: /\b(picked up|took|take|left the shop|carried)\b/i, note: "Appropriation is any assumption of the rights of the owner." },
      { tag: "intention_permanently_deprive", detect: /\b(return|give back|borrow|permanently|deprive)\b/i, note: "Intention permanently to deprive is a distinct element; an intention to return the item is directly relevant." },
      { tag: "belonging_to_another", detect: /\b(someone else|another person|possession|thought it was mine|owner)\b/i, note: "Property 'belonging to another' includes property in another's possession or control; a claimed belief of ownership raises both this element and dishonesty." },
    ],
    missing_facts: [
      "exact sequence of events at the point of leaving without paying",
      "what the person believed at the time (honest mistake vs awareness)",
      "value and nature of the goods",
      "any CCTV, receipts, or witness evidence of state of mind",
      "what happened after realising non-payment (return, offer to pay)",
    ],
    next_steps: [
      "Check s.2-s.7 Theft Ordinance (Cap 210) definitions against each element",
      "Search for HK appellate authority on the specific contested element",
      "Review magistrates'/District Court sentencing outcomes for comparable shop cases",
    ],
  },
  {
    id: "bail",
    detect: /\b(bail|remand|surrender|custody pending)\b/i,
    issue: "Bail — right to bail, statutory bail factors, and (where national security offences are charged) the stricter NSL Art.42(2) threshold.",
    sub_issues: [
      { tag: "bail_factors", detect: /\b(factors?|risks?|fail to surrender|reoffend(?:ing)?|interfere)\b/i, note: "Core factors: risk of failing to surrender, committing offences on bail, and interfering with witnesses/obstructing justice, with conditions to mitigate." },
      { tag: "right_to_bail", detect: /\b(right|presumption|refuse)\b/i, note: "Ordinary Cap 221 bail starts from a presumption in favour of bail." },
      { tag: "nsl_threshold", detect: /\b(nsl|national security)\b/i, note: "NSL Art.42(2) imposes a no-bail-unless threshold before ordinary bail discretion applies." },
    ],
    missing_facts: [
      "the charge(s) and whether any national security element is alleged",
      "criminal record and previous bail compliance",
      "community ties, residence, employment, travel documents",
      "proposed bail conditions (surety, reporting, travel ban)",
    ],
    next_steps: [
      "Confirm the charging provision and court venue",
      "Prepare evidence on ties and proposed conditions",
      "Check recent bail review decisions for comparable charges",
    ],
  },
  {
    id: "interview_caution_confession",
    detect: /\b(interview|caution|confession|admission|rights|remained silent|without explaining)\b/i,
    issue: "Admissibility of confessions/admissions — voluntariness, the residual fairness discretion, and the effect of interviewing without proper caution.",
    sub_issues: [
      { tag: "voluntariness", detect: /\b(voluntar|pressure|force|threat|inducement)\b/i, note: "The prosecution must establish the confession was voluntary; otherwise it is inadmissible." },
      { tag: "residual_discretion", detect: /\b(fair|discretion|exclude)\b/i, note: "Even a voluntary confession may be excluded under the court's residual discretion to secure a fair trial." },
      { tag: "caution_rights", detect: /\b(caution|rights|explain|inform)\b/i, note: "Failure to caution or to explain rights is a significant factor in exercising the exclusionary discretion." },
    ],
    missing_facts: [
      "whether and when a caution was administered",
      "what was said in the interview and whether it was recorded",
      "whether legal advice was requested or denied",
      "the person's condition during detention (duration, access to necessities)",
    ],
    next_steps: [
      "Obtain the interview record and custody log",
      "Check the Secretary for Security's Rules and Directions for questioning",
      "Assess a voir dire strategy on voluntariness and fairness",
    ],
  },
  {
    id: "assembly_proportionality",
    detect: /\b(protest|assembly|procession|demonstration|police restricted|route|public order)\b/i,
    issue: "Public assembly — the constitutional right of peaceful assembly and the two-stage test for restrictions: prescribed by law and proportionate (necessary in a democratic society).",
    sub_issues: [
      { tag: "peaceful_assembly", detect: /\b(peaceful|joined|march|procession)\b/i, note: "Peaceful assembly is constitutionally protected under the Basic Law and BORO." },
      { tag: "proportionality", detect: /\b(restrict|route|condition|limit)\b/i, note: "Police restrictions (e.g. on the route) must be prescribed by law and satisfy the proportionality/necessity requirement." },
      { tag: "unlawful_assembly_exposure", detect: /\b(riot|unlawful|charge|arrest)\b/i, note: "Where charges follow, unlawful assembly/riot elements and joint enterprise principles become relevant." },
    ],
    missing_facts: [
      "whether the assembly was notified and whether police imposed formal conditions",
      "the precise restriction imposed and its stated justification",
      "whether the gathering remained peaceful throughout",
      "any arrest, charge, or police direction given to the individual",
    ],
    next_steps: [
      "Review the Public Order Ordinance (Cap 245) notification/condition provisions",
      "Check the leading CFA authority on proportionality of assembly restrictions",
      "Assess any charge against the unlawful-assembly elements and defences",
    ],
  },
];

const PLAYBOOK_ISSUE_TAGS = {
  theft_elements: ["theft", "dishonesty", "fraud", "deception", "appropriation", "property", "deprive"],
  bail: ["bail", "nsl", "national_security", "surrender", "reoffend"],
  interview_caution_confession: ["confession", "caution", "admissibility", "detention", "undercover", "fair_trial", "voluntar", "residual"],
  assembly_proportionality: ["assembly", "public_order", "proportionality", "procession", "riot", "unlawful", "peaceful"],
};

function activePlaybooks(query) {
  return ISSUE_PLAYBOOKS.filter(pb => pb.detect.test(query));
}

function groupMatchesPlaybooks(group, playbooks) {
  if (!playbooks.length) return true;
  const blob = [
    ...(group.sub_issue_tags || []),
    group.issue_tag || "",
    (group.case_note || {}).legal_issue || "",
    (group.case_note || {}).holding || "",
  ].join(" ").toLowerCase();
  return playbooks.some(playbook =>
    (PLAYBOOK_ISSUE_TAGS[playbook.id] || []).some(tag => blob.includes(tag)));
}

function factFragments(query) {
  return String(query || "")
    .split(/[,.?!;]+/)
    .map(fragment => fragment.trim())
    .filter(fragment => fragment.length > 8);
}

function composeResearchMemo(query, { limit = 10 } = {}) {
  if (isUnsupportedCivilRentQuery(query)) {
    return {
      abstain: true,
      short_answer: "This looks like a civil landlord-and-tenant / rent issue. The current research corpus holds paragraph-linked criminal-law and procedure authorities only, so no supported case authority is attached and no criminal-law authority is borrowed for this question.",
      issues: ["civil tenancy / rent adjustment (outside the supported criminal corpus)"],
      authorities: [],
      paragraph_quotes: [],
      legal_principles: [],
      application_to_facts: "",
      missing_facts: ["the tenancy agreement terms on rent review", "notice given for the increase"],
      distinguished_authorities: [],
      limitations: [
        "No paragraph-linked civil tenancy authority is in the corpus; the system abstains rather than borrowing criminal-law authority.",
      ],
      next_research_steps: [
        "Consult the Landlord and Tenant (Consolidation) Ordinance (Cap 7) and civil practice resources",
      ],
      warnings: ["unsupported_civil_rent_query"],
    };
  }

  const playbooks = activePlaybooks(query);
  const search = searchParagraphLinkedCases(query, { limit });
  const doctrineEvidence = (search.doctrine_scores || [])
    .filter(item => item.evidence.length)
    .flatMap(item => item.evidence);
  const merged = [];
  const seen = new Set();
  for (const item of [...search.hits, ...doctrineEvidence]) {
    const key = `${item.case_id || item.case_name}:${item.paragraph_number}:${item.exact_quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  const diversified = diversifyEvidence(merged, { query });
  const allGroups = groupEvidenceByCaseForAnswer(diversified, { query });
  const onIssue = allGroups.filter(group => groupMatchesPlaybooks(group, playbooks));
  const offIssue = allGroups.filter(group => !onIssue.includes(group));
  const groups = (onIssue.length ? onIssue : allGroups).slice(0, limit);
  const distinguished = offIssue.slice(0, 6).map(group => ({
    case_name: group.case_name,
    citation: group.citation,
    reason: `Retrieved by keyword overlap but maps to a different issue area (${(group.sub_issue_tags || []).slice(0, 3).join(", ") || group.issue_tag || "other"}); not applied to these facts.`,
  }));
  const abstain = groups.length === 0;

  const fragments = factFragments(query);
  const subIssueHits = [];
  for (const playbook of playbooks) {
    for (const sub of playbook.sub_issues) {
      if (sub.detect.test(query)) subIssueHits.push({ playbook: playbook.id, ...sub });
    }
  }

  const principles = [];
  for (const group of groups) {
    const note = group.case_note || {};
    const principle = note.ratio_or_core_principle || note.holding;
    if (principle) {
      principles.push({
        principle,
        authority: `${group.case_name} ${group.citation}`.trim(),
        case_level: group.case_level,
      });
    }
  }

  const applicationParts = [];
  for (const sub of subIssueHits) {
    const matchingFragment = fragments.find(fragment => sub.detect.test(fragment)) || fragments[0] || "";
    const supporting = groups.find(group =>
      (group.sub_issue_tags || []).some(tag => String(tag).includes(sub.tag) || sub.tag.includes(String(tag)))
      || ((group.case_note && (group.case_note.legal_issue || "")).includes(sub.tag.replace(/_/g, " "))));
    applicationParts.push(
      `On ${sub.tag.replace(/_/g, " ")}: your stated facts ("${matchingFragment}") engage this sub-issue. ${sub.note}` +
      (supporting ? ` See ${supporting.case_name} ${supporting.citation}${supporting.paragraphs[0]?.para_no ? ` at para ${supporting.paragraphs[0].para_no}` : ""}.` : " No paragraph-linked authority in the current corpus squarely addresses this sub-issue; treat as a research gap."),
    );
  }
  if (!applicationParts.length && groups.length) {
    applicationParts.push(
      `The retrieved authorities bear on the issue as follows: ${groups.slice(0, 3).map(group => `${group.case_name} ${group.citation} — ${(group.case_note || {}).holding || group.paragraphs[0]?.proposition_text || ""}`).join("; ")}`,
    );
  }

  const quotes = groups.flatMap(group => group.paragraphs.slice(0, 2).map(paragraph => ({
    case_name: group.case_name,
    citation: group.citation,
    para_no: paragraph.para_no,
    exact_quote: paragraph.exact_quote,
    paragraph_text: paragraph.paragraph_text,
    source_url: paragraph.source_url,
  }))).slice(0, 8);

  const missingFacts = [...new Set(playbooks.flatMap(playbook => playbook.missing_facts))];
  const nextSteps = [...new Set(playbooks.flatMap(playbook => playbook.next_steps))];

  const issueLines = playbooks.map(playbook => playbook.issue);
  const shortAnswer = abstain
    ? "No paragraph-linked public judgment evidence was retrieved for this query; the system abstains rather than inventing authority."
    : `${issueLines[0] || "The retrieved paragraph-linked authorities frame the issue."} ${groups.length} source-linked authorit${groups.length === 1 ? "y" : "ies"} (${groups.slice(0, 3).map(group => group.case_name).join("; ")}) are applied to your facts below.`;

  return {
    abstain,
    short_answer: shortAnswer,
    issues: issueLines.length ? issueLines : (groups[0]?.case_note?.legal_issue ? [groups[0].case_note.legal_issue] : []),
    sub_issues: subIssueHits.map(sub => sub.tag),
    authorities: groups.map(group => ({
      case_name: group.case_name,
      citation: group.citation,
      case_level: group.case_level,
      authority_role: group.authority_role,
      leading_case_cluster: group.leading_case_cluster,
      diversity_rank: group.diversity_rank,
      paragraphs: group.paragraphs.map(paragraph => paragraph.para_no),
      holding: (group.case_note || {}).holding || "",
    })),
    paragraph_quotes: quotes,
    legal_principles: principles,
    application_to_facts: applicationParts.join("\n"),
    missing_facts: missingFacts,
    distinguished_authorities: distinguished,
    limitations: [
      "Research prototype output built only from paragraph-linked public judgments in the current corpus; coverage is incomplete.",
      "Later treatment of the cited cases is unchecked (current_treatment_status=unchecked).",
      "Not professional legal advice; lawyer review workflow is a later HITL layer.",
    ],
    next_research_steps: nextSteps.length ? nextSteps : ["Expand the verified corpus for this issue area."],
    warnings: abstain ? ["analysis_has_no_paragraph_evidence"] : [],
  };
}

module.exports = { composeResearchMemo, ISSUE_PLAYBOOKS, activePlaybooks };
