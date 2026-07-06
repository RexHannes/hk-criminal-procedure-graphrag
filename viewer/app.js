/* Legal Graph-SOP Workspace — application logic
   Loads the base legal graph (nodes/edges/flows) + the firm overlay,
   renders a three-pane workspace, and keeps every item traceable:
   source → doctrine → flow step → firm SOP → template → task output. */

(function () {
  'use strict';

  // ── State ──
  const S = {
    nodes: [], edges: [], flows: [],
    nodeMap: {}, edgesFrom: {}, edgesTo: {},
    domains: [],
    domainSummaries: {},
    selectedDomainId: null,
    domainInfo: null,
    firm: null,
    view: 'domains',
    selectedFlowId: null,
    selectedEntity: null,   // {kind, id}
    lastTrace: null,        // execution trace of last task run
    dataSource: 'live',
    openSections: new Set(),
    caseFruitCache: {},
    verifiedCaseSeedIds: new Set(),
    verifiedDoctrineEvidence: {},
    excludedCaseSeeds: [],
    viewerEvidenceLoaded: false,
    caseNotesByCaseId: {},
    caseNotesByNameCite: {},
    forms: {
      formPack: null,
      templates: [],
      clauses: [],
      usageRules: [],
      notebooklmUsageNotes: [],
      routingRules: [],
      privateFormIndex: null,
    },
  };

  const $ = (sel) => document.querySelector(sel);

  // ── Badge mapping: raw pipeline labels → professional badges ──
  const BADGE_MAP = {
    not_product_answer_layer: { text: 'Doctrine node', cls: 'badge-research' },
    case_recall_only: { text: 'Case recall', cls: 'badge-research' },
    machine_candidate: { text: 'Research prototype', cls: 'badge-research' },
    answer_safe: { text: 'Paragraph proof', cls: 'badge-verified' },
    paragraph_verified: { text: 'Paragraph proof', cls: 'badge-verified' },
    source_verified: { text: 'Source-linked', cls: 'badge-verified' },
    verified: { text: 'Public judgment', cls: 'badge-verified' },
    verified_case_linked: { text: 'Source-linked', cls: 'badge-verified' },
    excluded_case_seed: { text: 'Research prototype', cls: 'badge-research' },
    approved: { text: 'Approved', cls: 'badge-approved' },
    needs_review: { text: 'Research prototype', cls: 'badge-research' },
    draft: { text: 'Draft', cls: 'badge-draft' },
    verified_public_authority: { text: 'Public judgment', cls: 'badge-verified' },
  };

  const CASE_PROOF_BADGES = [
    '<span class="badge badge-verified">Source-linked</span>',
    '<span class="badge badge-verified">Public judgment</span>',
    '<span class="badge badge-verified">Paragraph proof</span>',
    '<span class="badge badge-research">Research prototype</span>',
  ].join('');

  const TYPE_LABEL = {
    legal_issue: 'Issue', statute: 'Statute', case_seed: 'Case seed',
    flow_step: 'Flow step', practice_direction: 'Practice direction',
    restricted_nsl: 'NSL', section_header: 'Section', gap: 'Gap',
    listing_rule_anchor: 'Listing rule', guidance_letter_seed: 'Guidance letter',
    listing_decision_seed: 'Listing decision', enforcement_seed: 'Enforcement seed',
    sfc_material_seed: 'SFC material', source_anchor: 'Source anchor',
  };

  const AUTHORITY_TYPES = new Set([
    'statute', 'case_seed', 'practice_direction', 'restricted_nsl',
    'listing_rule_anchor', 'guidance_letter_seed', 'listing_decision_seed',
    'enforcement_seed', 'sfc_material_seed', 'source_anchor',
  ]);

  function badge(key, extra) {
    const b = BADGE_MAP[key];
    if (!b) return '';
    return `<span class="badge ${b.cls}">${b.text}${extra ? ' · ' + esc(extra) : ''}</span>`;
  }
  function versionBadge(v) { return v ? `<span class="badge badge-version">v${esc(String(v))}</span>` : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isVerifiedCaseSeedNode(n) {
    if (!n || n.type !== 'case_seed') return false;
    const doctrineId = doctrineNodeId(n);
    return S.verifiedCaseSeedIds.has(doctrineId);
  }

  function isProductVisibleAuthority(n) {
    if (!n) return false;
    if (n.type === 'case_seed') return isVerifiedCaseSeedNode(n);
    return AUTHORITY_TYPES.has(n.type);
  }

  function verifiedEvidenceForNodeId(nodeId) {
    return S.verifiedDoctrineEvidence[nodeId] || [];
  }

  function loadViewerEvidenceIndex() {
    return loadJSON('../data/legal_ingest/case_corpus/viewer_evidence_index.json')
      .then(payload => {
        S.verifiedCaseSeedIds = new Set(payload.verified_case_seed_ids || []);
        S.verifiedDoctrineEvidence = payload.by_doctrine_node_id || {};
        S.viewerEvidenceLoaded = true;
        return payload;
      })
      .catch(() => loadJSON('../artifacts/excluded_unverified_case_seeds_report.json').then(ex => {
        S.excludedCaseSeeds = ex.records || [];
        S.verifiedCaseSeedIds = new Set();
        S.verifiedDoctrineEvidence = {};
        return null;
      }));
  }

  function loadStructuredCaseNotes() {
    return loadJSON('../data/legal_ingest/case_corpus/structured_case_notes.json')
      .then(payload => {
        for (const note of payload.notes || []) {
          S.caseNotesByCaseId[note.case_id] = note;
          S.caseNotesByNameCite[`${note.case_name}::${note.citation}`] = note;
          if (note.neutral_citation) S.caseNotesByNameCite[`${note.case_name}::${note.neutral_citation}`] = note;
        }
        return payload;
      })
      .catch(() => null);
  }

  function caseNoteFor(evidence) {
    if (!evidence) return null;
    if (evidence.case_id && S.caseNotesByCaseId[evidence.case_id]) return S.caseNotesByCaseId[evidence.case_id];
    const cite = evidence.neutral_citation || evidence.citation || '';
    return S.caseNotesByNameCite[`${evidence.case_name}::${cite}`] || null;
  }

  function verifiedAuthorityOptions() {
    const seen = new Set();
    const options = [];
    for (const items of Object.values(S.verifiedDoctrineEvidence)) {
      for (const item of items) {
        const key = `${item.case_name}::${item.paragraph_number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          case_name: item.case_name,
          citation: item.citation || item.neutral_citation || '',
          paragraph_number: item.paragraph_number || '',
          source_url: item.source_url || '',
        });
      }
    }
    return options.slice(0, 40);
  }
  function hkliiUrlFromCitation(citation) {
    const match = String(citation || '').match(/\[\s*(\d{4})\s*\]\s*HK([A-Z]{2,6})\s+(\d+)\s*/i);
    if (!match) return '';
    const slug = { HKCFA: 'hkcfa', HKCFI: 'hkcfi', HKCA: 'hkca', HKDC: 'hkdc' }[match[2].toUpperCase()];
    return slug ? `https://www.hklii.hk/en/cases/${slug}/${match[1]}/${match[3]}` : '';
  }

  function authoritySourceUrl(n) {
    if (!n) return '';
    const doctrineId = doctrineNodeId(n);
    const evidence = verifiedEvidenceForNodeId(doctrineId)[0];
    if (evidence?.source_url) return evidence.source_url;
    return n.source_url || n.hklii_url || hkliiUrlFromCitation(n.neutral_citation) || hkliiUrlFromCitation(n.law_report_citation) || '';
  }

  function nodeStatusBadges(n) {
    const out = [];
    if (n.type === 'case_seed') {
      if (isVerifiedCaseSeedNode(n)) out.push(CASE_PROOF_BADGES);
    } else if (verifiedEvidenceForNodeId(doctrineNodeId(n)).length) {
      out.push(CASE_PROOF_BADGES);
    }
    if (n.type === 'restricted_nsl') out.push('<span class="badge badge-nsl">NSL — restricted</span>');
    return out.join('');
  }

  // ── Data loading ──
  function loadJSON(path) {
    return fetch(path).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path); return r.json(); });
  }

  const DATA_INDEX = window.DATA_INDEX || '../data/index.json';
  const DATA_ROOT = window.DATA_ROOT || '../data/legal_domain_packs/demo_maps/';
  const DEFAULT_DOMAIN_ID = window.DEFAULT_DOMAIN_ID || 'criminal_procedure_hk';
  const CASE_FRUIT_ARTIFACTS = window.CASE_FRUIT_ARTIFACTS || [
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/bail_public_batch_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified'],
      fallbackCaseName: 'Public bail source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/sedition_public_expression_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'tree_gap_candidate'],
      fallbackCaseName: 'Sedition/public-expression source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/public_order_riot_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'tree_gap_candidate'],
      fallbackCaseName: 'Public-order source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/branch_pilots/investigation_arrest_search_detention_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'branch_landmark_pilot'],
      fallbackCaseName: 'Investigation/search branch pilot',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/branch_pilots/theft_dishonesty_fraud_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'branch_landmark_pilot'],
      fallbackCaseName: 'Theft/fraud branch pilot',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/tree_gap_pilots/data_privacy_dpp1_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'tree_gap_candidate', 'field_expansion_pilot'],
      fallbackCaseName: 'Data-privacy source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/tree_gap_pilots/civil_procedure_inconsistent_pleadings_v1',
      flags: ['public_source_verified', 'quote_verified', 'paragraph_verified', 'tree_gap_candidate'],
      fallbackCaseName: 'Civil procedure source candidate',
      fallbackCitation: '[Public source candidate]',
    },
  ];

  function domainBase(domainId) {
    return DATA_ROOT + domainId + '/';
  }

  function resetDomainData() {
    S.nodes = [];
    S.edges = [];
    S.flows = [];
    S.nodeMap = {};
    S.edgesFrom = {};
    S.edgesTo = {};
    S.selectedFlowId = null;
    S.selectedEntity = null;
    S.lastTrace = null;
    S.openSections = new Set();
  }

  function loadRegistry() {
    return loadJSON(DATA_INDEX).then(registry => {
      S.domains = registry.domains || [];
      if (!S.domains.some(d => d.domain_id === DEFAULT_DOMAIN_ID) && S.domains[0]) {
        S.selectedDomainId = S.domains[0].domain_id;
      } else {
        S.selectedDomainId = S.selectedDomainId || DEFAULT_DOMAIN_ID;
      }
      return Promise.all(S.domains.map(d => summarizeDomain(d).catch(() => null)));
    });
  }

  function domainSummaryDescription(info, manifest, domain) {
    if (info?.description) return info.description;
    const counts = manifest?.counts || {};
    const issues = counts.principle_nodes || counts.issue_nodes;
    if (issues) {
      return `${manifest.title || domain.title}: ${issues} principle nodes across ${(manifest.sections || []).length} section(s). Public case fruits attach separately and remain review-gated.`;
    }
    if (info?.intended_use) return info.intended_use;
    return 'Legal domain pack with doctrine map and source audit queue.';
  }

  function summarizeDomain(domain) {
    const base = domainBase(domain.domain_id);
    return Promise.all([
      loadJSON(base + 'consolidated.json'),
      loadJSON(base + 'flows.json').catch(() => ({ flows: [] })),
      loadJSON(DATA_ROOT + domain.path).catch(() => null),
    ]).then(([manifest, flowPack, info]) => {
      S.domainSummaries[domain.domain_id] = {
        id: domain.domain_id,
        title: info?.title || manifest.title || domain.title,
        description: domainSummaryDescription(info, manifest, domain),
        sectionCount: (manifest.sections || []).length,
        flowCount: (flowPack.flows || []).length,
        nodeCount: manifest?.counts?.principle_nodes || null,
        status: domain.status || info?.status || manifest.status || {},
      };
    });
  }

  function loadDomain(domainId) {
    const domain = S.domains.find(d => d.domain_id === domainId) || S.domains[0] || { domain_id: DEFAULT_DOMAIN_ID, title: 'Hong Kong Criminal Procedure', path: DEFAULT_DOMAIN_ID + '/domain.json' };
    const base = domainBase(domain.domain_id);
    resetDomainData();
    S.selectedDomainId = domain.domain_id;
    S.dataSource = 'live';
    return Promise.all([
      loadJSON(DATA_ROOT + domain.path).catch(() => null),
      loadJSON(base + 'consolidated.json'),
    ]).then(([domainInfo, manifest]) => {
      S.domainInfo = domainInfo || { domain_id: domain.domain_id, title: manifest.title || domain.title };
      const sectionP = manifest.sections.map(s =>
        Promise.all([
          loadJSON(base + s.node_file).then(d => d.nodes || []),
          loadJSON(base + s.edge_file).then(d => d.edges || []),
        ]).then(([nodes, edges]) => { S.nodes.push(...nodes); S.edges.push(...edges); })
      );
      const flowP = loadJSON(base + (manifest.flows_file || 'flows.json')).then(d => { S.flows = d.flows || []; });
      return Promise.all([...sectionP, flowP]);
    }).then(() => {
      indexData();
      renderDomainSelect();
      renderFirmCard();
      renderStatus();
    });
  }

  function loadFirm() {
    return loadJSON(window.FIRM_OVERLAY_PATH).then(d => { S.firm = d; });
  }

  function loadFormsDemoStore() {
    const root = window.FORMS_DEMO_STORE_ROOT || '../fixtures/forms/synthetic_store/';
    return Promise.all([
      loadJSON(root + 'form_pack_manifest.json').catch(() => null),
      loadJSON(root + 'form_templates.json').catch(() => []),
      loadJSON(root + 'clause_snippets.json').catch(() => []),
      loadJSON(root + 'clause_usage_rules.json').catch(() => []),
      loadJSON(root + 'notebooklm_usage_notes.json').catch(() => []),
      loadJSON(root + 'form_routing_rules.json').catch(() => []),
      loadJSON(root + 'private_form_index.json').catch(() => null),
    ]).then(([formPack, templates, clauses, usageRules, notebooklmUsageNotes, routingRules, privateFormIndex]) => {
      S.forms = { formPack, templates, clauses, usageRules, notebooklmUsageNotes, routingRules, privateFormIndex };
      return S.forms;
    });
  }

  // Fallback so the workspace never renders a dead, zero-node demo.
  function fallbackData() {
    S.dataSource = 'fallback';
    S.nodes = [
      { id: 'crim_proc_bail', type: 'section_header', label: 'Bail', section: '04', summary: 'Right to bail, exceptions, conditions, variation.' },
      { id: 'bail_right_to_bail', type: 'legal_issue', label: 'Right to Bail and Statutory Exceptions', section: '04', summary: 'Presumption of bail under Cap 221 s.9D(1); refusal grounds under s.9D(2); NSL Art.42 stricter threshold.', statute_refs: ['cap221_s9d'], verification_status: 'verified', answer_layer_status: 'paragraph_verified' },
      { id: 'cap221_s9d', type: 'statute', label: 'Criminal Procedure Ordinance (Cap 221) s.9D', section: '04', summary: 'Right to bail and statutory exceptions for refusal.', verification_status: 'needs_official_source_verification' },
      { id: 'bail_flow_start', type: 'flow_step', label: 'Bail Flow: Person Arrested or Charged', section: '04', summary: 'Establish posture: police bail, court bail, variation, revocation or appeal.' },
      { id: 'bail_flow_step3', type: 'flow_step', label: 'Bail Flow: Consider Right to Bail', section: '04', summary: 'Apply the s.9D presumption and exceptions.', statute_refs: ['cap221_s9d'] },
    ];
    S.edges = [
      { from: 'bail_right_to_bail', to: 'cap221_s9d', relationship: 'statutory_anchor' },
      { from: 'bail_flow_start', to: 'bail_flow_step3', relationship: 'flow_transition' },
    ];
    S.flows = [{ flow_id: 'crim_proc_bail_flow', title: 'Bail Application Flow', description: 'Demo fallback flow.', steps: ['bail_flow_start', 'bail_flow_step3'] }];
  }

  function fallbackFirm() {
    S.firm = {
      firm_profile: { name: 'Demo Litigation Firm', jurisdiction: 'Hong Kong SAR', practice_areas: ['Criminal Procedure'], review_policy: 'Partner review required before any external advice.', overlay_version: '0.0-demo' },
      sops: [], templates: [], demo_tasks: [],
    };
  }

  function indexData() {
    S.nodeMap = {};
    S.edgesFrom = {};
    S.edgesTo = {};
    S.nodes.forEach(n => { S.nodeMap[n.id] = n; });
    S.edges.forEach(e => {
      (S.edgesFrom[e.from] = S.edgesFrom[e.from] || []).push(e);
      (S.edgesTo[e.to] = S.edgesTo[e.to] || []).push(e);
    });
  }

  // ── Graph helpers ──
  function isAuthorityRelationship(rel = '') {
    return rel.includes('anchor') || rel.includes('seed') || rel.includes('authority') || rel.includes('source');
  }

  function authoritiesForNode(n) {
    const refFields = [
      'statute_refs', 'case_seeds', 'practice_direction_refs',
      'listing_rule_refs', 'guidance_refs', 'listing_decision_refs',
      'enforcement_refs', 'sfc_refs', 'authority_refs', 'source_refs',
    ];
    const ids = new Set();
    refFields.forEach(field => (n[field] || []).forEach(id => ids.add(id)));
    (S.edgesFrom[n.id] || []).forEach(e => {
      if (isAuthorityRelationship(e.relationship)) ids.add(e.to);
    });
    (S.edgesTo[n.id] || []).forEach(e => {
      if (isAuthorityRelationship(e.relationship)) ids.add(e.from);
    });
    return [...ids].map(id => S.nodeMap[id]).filter(x => isProductVisibleAuthority(x));
  }

  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'flow', 'step', 'whether', 'under', 'into', 'from', 'that', 'this', 'are', 'has', 'have', 'not', 'all', 'any']);
  function keywords(s) {
    return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w)));
  }

  function issuesLinkedToStep(stepId) {
    const ids = new Set();
    (S.edgesTo[stepId] || []).forEach(e => { ids.add(e.from); });
    (S.edgesFrom[stepId] || []).forEach(e => { ids.add(e.to); });
    let linked = [...ids].map(id => S.nodeMap[id]).filter(x => x && x.type === 'legal_issue');
    if (linked.length) return linked;
    // Fallback: keyword-match issues in the same section (data has only flow_transition edges on steps).
    const step = S.nodeMap[stepId];
    if (!step) return [];
    const kw = keywords(step.label + ' ' + (step.summary || ''));
    const scored = S.nodes
      .filter(n => n.type === 'legal_issue' && n.section === step.section)
      .map(n => {
        const ik = keywords(n.label + ' ' + (n.subtopic || ''));
        let score = 0; ik.forEach(w => { if (kw.has(w)) score++; });
        return { n, score };
      })
      .filter(x => x.score >= 1)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 2).map(x => x.n);
  }

  function authoritiesForStep(stepId) {
    const step = S.nodeMap[stepId];
    if (!step) return [];
    const direct = authoritiesForNode(step);
    if (direct.length) return direct;
    const seen = new Set(); const out = [];
    issuesLinkedToStep(stepId).forEach(iss => {
      authoritiesForNode(iss).forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); out.push(a); } });
    });
    return out.slice(0, 4);
  }

  function sopBlocksForStep(stepId) {
    const out = [];
    (S.firm.sops || []).forEach(sop => {
      (sop.blocks || []).forEach(b => {
        if ((b.applies_to_steps || []).includes(stepId)) out.push({ sop, block: b });
      });
    });
    return out;
  }

  function sopsForFlow(flowId) {
    return (S.firm.sops || []).filter(s => (s.linked_flows || []).includes(flowId));
  }

  function currentFlowIds() {
    return new Set(S.flows.map(f => f.flow_id));
  }

  function currentDomainSops() {
    const ids = currentFlowIds();
    return (S.firm.sops || []).filter(s => (s.linked_flows || []).some(fid => ids.has(fid)));
  }

  function currentDomainTasks() {
    const ids = currentFlowIds();
    return (S.firm.demo_tasks || []).filter(t => ids.has(t.flow_id));
  }

  function currentDomainTemplates() {
    const templateIds = new Set();
    currentDomainSops().forEach(s => (s.linked_templates || []).forEach(id => templateIds.add(id)));
    currentDomainTasks().forEach(t => { if (t.template_id) templateIds.add(t.template_id); });
    return (S.firm.templates || []).filter(t => templateIds.has(t.template_id));
  }

  function formById(id) {
    return (S.forms.templates || []).find(t => t.id === id);
  }

  function clauseById(id) {
    return (S.forms.clauses || []).find(c => c.id === id);
  }

  function noteById(id) {
    return (S.forms.notebooklmUsageNotes || []).find(n => n.id === id);
  }

  function clausesForTemplate(templateId) {
    return (S.forms.clauses || []).filter(c => c.templateId === templateId);
  }

  function notesForTemplate(templateId) {
    return (S.forms.notebooklmUsageNotes || []).filter(n => (n.relatedTemplateIds || []).includes(templateId));
  }

  function notesForClause(clauseId) {
    return (S.forms.notebooklmUsageNotes || []).filter(n => (n.relatedClauseIds || []).includes(clauseId));
  }

  // ── Selection / inspector ──
  function select(kind, id) {
    S.selectedEntity = { kind, id };
    renderInspector();
    $('#status-selected').textContent = 'Selected: ' + id;
    if (window.matchMedia('(max-width: 1100px)').matches) $('#inspector').classList.add('open');
    document.querySelectorAll('.card.selected, .doc-issue.selected').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`[data-sel="${kind}:${id}"]`);
    if (el) el.classList.add('selected');
  }

  function usedInLastTrace(id) {
    if (!S.lastTrace) return null;
    return S.lastTrace.usedIds.has(id);
  }

  function doctrineNodeId(n) {
    if (!n) return '';
    if (n.doctrine_node_id) return n.doctrine_node_id;
    if (String(n.id || '').startsWith((S.selectedDomainId || '') + '.')) return n.id;
    return `${S.selectedDomainId}.${n.id}`;
  }

  function caseFruitKey(nodeId) {
    return `case-fruits-${String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  function normalizeEvidencePayload(payload) {
    const evidence = payload?.evidence || payload?.candidate_evidence || [];
    return {
      coverage_status: payload?.coverage_status || (evidence.length ? 'paragraph_verified' : 'no_evidence'),
      evidence,
      candidate_evidence: payload?.candidate_evidence || evidence.filter(e => (e.answer_layer_status || '') !== 'answer_safe'),
      verified_evidence: payload?.verified_evidence || [],
      answer_safe_evidence: payload?.answer_safe_evidence || [],
      warnings: payload?.warnings || [],
    };
  }

  function loadCaseFruitsForNode(n) {
    const nodeId = doctrineNodeId(n);
    const target = document.getElementById(caseFruitKey(nodeId));
    if (!target) return;
    target.innerHTML = '<div class="fruit-loading">Loading HKLII paragraph proof…</div>';
    const cached = S.caseFruitCache[nodeId];
    const localVerified = () => {
      const fromIndex = (S.verifiedDoctrineEvidence[nodeId] || []).map(normalizeIndexEvidence);
      if (fromIndex.length) return Promise.resolve(normalizeEvidencePayload({ coverage_status: 'paragraph_verified', evidence: fromIndex, warnings: [] }));
      return loadJSON(`/api/doctrine-evidence?node_id=${encodeURIComponent(nodeId)}`)
        .then(normalizeEvidencePayload)
        .catch(() => normalizeEvidencePayload({ coverage_status: 'no_evidence', evidence: [], warnings: [] }));
    };
    const request = cached ? Promise.resolve(cached) : localVerified().then(payload => {
      S.caseFruitCache[nodeId] = payload;
      return payload;
    });
    request
      .then(payload => renderCaseFruits(target, nodeId, payload))
      .catch(err => {
        target.innerHTML = `<div class="fruit-empty">No verified paragraph proof for this node. <span>${esc(err.message || '')}</span></div>`;
      });
  }

  function normalizeIndexEvidence(e) {
    return {
      case_name: e.case_name,
      neutral_citation: e.neutral_citation || e.citation,
      law_report_citation: e.law_report_citation || '',
      para_no: e.paragraph_number,
      proposition_text: e.proposition_text || e.short_application_summary,
      supporting_quote: e.exact_quote,
      exact_quote: e.exact_quote,
      paragraph_text: e.paragraph_text,
      source_url: e.source_url,
      issue_tags: e.issue_tags || [],
      answer_layer_status: 'paragraph_verified',
      verification_status: 'verified',
      quote_verified: true,
    };
  }

  function loadLocalCaseFruitArtifacts(nodeId) {
    return Promise.all(CASE_FRUIT_ARTIFACTS.map(config => loadLocalCaseFruitArtifact(nodeId, config).catch(() => [])))
      .then(groups => {
        const evidence = groups.flat();
        return normalizeEvidencePayload({
          coverage_status: evidence.length ? 'paragraph_verified' : 'no_evidence',
          evidence,
          candidate_evidence: [],
          warnings: [],
        });
      });
  }

  function loadLocalCaseFruitArtifact(nodeId, config) {
    return Promise.all([
      loadJSON(config.base + '/proposition_node_links.json'),
      loadJSON(config.base + '/l4_case_applications.json'),
      loadJSON(config.base + '/l5_paragraph_proof.json'),
      loadJSON(config.base + '/paragraph_cards.json').catch(() => ({ cases: [], paragraph_cards: [] })),
    ]).then(([linksPayload, l4Payload, l5Payload, paragraphPayload]) => {
      const l4ByProp = new Map((l4Payload.l4_case_applications || []).map(item => [item.proposition_id, item]));
      const l5ByProp = new Map((l5Payload.l5_paragraph_proof || []).map(item => [item.proposition_id, item]));
      const caseById = new Map((paragraphPayload.cases || []).map(item => [item.case_id, item]));
      return (linksPayload.proposition_node_links || [])
        .filter(link => link.doctrine_node_id === nodeId)
        .map(link => {
          const l4 = l4ByProp.get(link.proposition_id) || {};
          const l5 = l5ByProp.get(link.proposition_id) || {};
          const caseRecord = caseById.get(l4.case_id || l5.case_id) || {};
          return {
            case_name: l4.case_name || l5.case_name || l4.case_id || config.fallbackCaseName,
            neutral_citation: l4.neutral_citation || l5.neutral_citation || config.fallbackCitation,
            law_report_citation: caseRecord.law_report_citation || '',
            court: caseRecord.court || '',
            court_level: caseRecord.court_level || '',
            date: caseRecord.date || '',
            case_id: l4.case_id || l5.case_id || '',
            paragraph_id: l5.paragraph_id || '',
            para_no: l5.para_no || '',
            proposition_id: link.proposition_id,
            proposition_text: l4.application_summary || '',
            supporting_quote: l5.exact_quote || '',
            paragraph_text: l5.paragraph_text || '',
            source_url: l5.source_url || caseRecord.source_url || caseRecord.source_url_or_path || hkliiUrlFromCitation(l4.neutral_citation || l5.neutral_citation || caseRecord.neutral_citation) || 'https://www.hklii.hk/',
            link_type: link.link_type || 'application',
            authority_role: link.authority_role || 'application',
            significance_label: link.significance_label || '',
            verification_status: 'verified',
            answer_layer_status: 'paragraph_verified',
            quote_verified: true,
            human_review_status: 'unreviewed',
            validator_flags: [],
            lineage_note: l4.lineage_note || link.notes || '',
          };
        });
    });
  }

  function highlightQuote(paragraphText, quote) {
    const text = String(paragraphText || '');
    const q = String(quote || '').trim();
    if (!text || !q) return esc(text || q || '—');
    const idx = text.indexOf(q);
    if (idx < 0) return esc(text);
    return `${esc(text.slice(0, idx))}<mark>${esc(q)}</mark>${esc(text.slice(idx + q.length))}`;
  }

  // De-looping rule: one case appears once as a top-level card; its paragraphs
  // nest inside. A case holding >40% of a node's paragraphs is labelled as a
  // leading-case cluster instead of repeating as separate cards.
  function groupEvidenceByCase(evidence) {
    const groups = new Map();
    for (const e of evidence) {
      const key = e.case_id || `${e.case_name}::${e.neutral_citation || e.citation || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { key, case_name: e.case_name, case_id: e.case_id || '', citation: e.neutral_citation || e.citation || '', law_report_citation: e.law_report_citation || '', paragraphs: [] });
      }
      const group = groups.get(key);
      const paraKey = `${e.para_no || e.paragraph_number || ''}::${e.supporting_quote || e.exact_quote || ''}`;
      if (!group.paragraphs.some(p => `${p.para_no || p.paragraph_number || ''}::${p.supporting_quote || p.exact_quote || ''}` === paraKey)) {
        group.paragraphs.push(e);
      }
    }
    return [...groups.values()].sort((a, b) => b.paragraphs.length - a.paragraphs.length || String(a.case_name).localeCompare(String(b.case_name)));
  }

  function renderCaseFruits(target, nodeId, payload) {
    const normalized = normalizeEvidencePayload(payload);
    const evidence = normalized.evidence || [];
    if (!evidence.length) {
      target.innerHTML = '<div class="fruit-empty">No linked case paragraphs for this node yet.</div>';
      return;
    }
    const groups = groupEvidenceByCase(evidence);
    const totalParas = evidence.length;
    target.innerHTML = `
      <div class="fruit-summary">
        ${CASE_PROOF_BADGES}
        <span>${groups.length} case authorit${groups.length === 1 ? 'y' : 'ies'} · ${totalParas} paragraph proof${totalParas === 1 ? '' : 's'} on <code>${esc(nodeId)}</code>.</span>
      </div>
      ${(normalized.warnings || []).length ? `<div class="fruit-warning">${normalized.warnings.map(esc).join(' ')}</div>` : ''}
      <div class="fruit-list">
        ${groups.map(group => renderCaseNoteCard(group, totalParas)).join('')}
      </div>
    `;
  }

  function renderCaseNoteCard(group, totalParas) {
    const first = group.paragraphs[0] || {};
    const note = caseNoteFor({ case_id: group.case_id, case_name: group.case_name, citation: group.citation, neutral_citation: group.citation }) || {};
    const share = totalParas ? group.paragraphs.length / totalParas : 0;
    const isCluster = group.paragraphs.length > 1 && share > 0.4;
    const unknown = (v) => !v || v === 'unknown_or_unextracted';
    const courtDate = [note.court, note.judgment_date].filter(v => !unknown(v)).join(' · ');
    const roleBadge = !unknown(note.authority_role)
      ? `<span class="badge badge-research">${esc(String(note.authority_role).replace(/_/g, ' '))}</span>` : '';
    const levelBadge = !unknown(note.case_level) ? `<span class="badge badge-verified">${esc(note.case_level)}</span>` : '';
    const issueBadges = (note.sub_issue_tags || []).slice(0, 5)
      .map(tag => `<span class="badge badge-draft">${esc(String(tag).replace(/_/g, ' '))}</span>`).join('');
    const holding = note.holding || first.proposition_text || first.short_application_summary || '';
    const principle = note.ratio_or_core_principle && note.ratio_or_core_principle !== holding ? note.ratio_or_core_principle : '';
    const application = note.application_summary && note.application_summary !== holding ? note.application_summary : '';
    const relevance = note.legal_issue ? `Mapped issue: ${note.legal_issue}` : '';
    const related = (note.related_authorities || []).slice(0, 4);
    return `
      <article class="fruit-card case-note-card">
        <div class="fruit-card-top">
          <strong>${esc(group.case_name || 'Untitled case')}</strong>
          <span>${esc([group.citation, group.law_report_citation].filter(Boolean).join(' · '))}</span>
        </div>
        ${courtDate ? `<div class="fruit-meta">${esc(courtDate)}</div>` : ''}
        <div class="fruit-badges">${levelBadge}${roleBadge}${issueBadges}
          ${isCluster ? '<span class="badge badge-review">Leading case cluster</span>' : ''}
        </div>
        ${isCluster ? `<div class="fruit-cluster-note">This case anchors ${group.paragraphs.length} of ${totalParas} paragraph proofs on this issue; its paragraphs are grouped under one card rather than repeated as separate authorities.</div>` : ''}
        ${holding ? `<p class="fruit-proposition"><span class="fruit-quote-label">Holding</span>${esc(holding)}</p>` : ''}
        ${principle ? `<p class="fruit-proposition"><span class="fruit-quote-label">Principle</span>${esc(principle)}</p>` : ''}
        ${relevance ? `<p class="fruit-proposition"><span class="fruit-quote-label">Why relevant here</span>${esc(relevance)}</p>` : ''}
        ${application ? `<p class="fruit-proposition"><span class="fruit-quote-label">Application note</span>${esc(application)}</p>` : ''}
        ${!unknown(note.material_facts) ? `<details class="fruit-proof"><summary>Material facts (from judgment)</summary><div class="fruit-paragraph">${esc(note.material_facts)}</div></details>` : ''}
        <details class="fruit-proof">
          <summary>Paragraph proof (${group.paragraphs.length})</summary>
          ${group.paragraphs.map(e => {
            const quote = e.supporting_quote || e.exact_quote || '';
            const paraNo = e.para_no || e.paragraph_number || '';
            return `
              <div class="fruit-para-proof">
                ${paraNo ? `<div class="fruit-meta"><span class="fruit-quote-label">Paragraph</span> ${esc(paraNo)}</div>` : ''}
                ${quote ? `<blockquote class="fruit-quote"><span class="fruit-quote-label">Exact quote</span>${esc(quote)}</blockquote>` : ''}
                <div class="fruit-paragraph">${highlightQuote(e.paragraph_text || quote, quote)}</div>
                <div class="fruit-meta">
                  <span>${esc(e.paragraph_id || e.proposition_id || '')}</span>
                  ${e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noreferrer">Open judgment (public source)</a>` : ''}
                </div>
              </div>`;
          }).join('')}
        </details>
        ${related.length || !unknown(note.obiter_or_limits) ? `
        <details class="fruit-proof">
          <summary>Related / limits</summary>
          ${related.length ? `<div class="fruit-paragraph">Related authorities: ${related.map(r => `${esc(r.case_name)} ${esc(r.citation || '')}`).join('; ')}</div>` : ''}
          ${!unknown(note.obiter_or_limits) ? `<div class="fruit-paragraph">Limits/obiter: ${esc(note.obiter_or_limits)}</div>` : ''}
          <div class="fruit-meta">Later treatment: ${esc(note.current_treatment_status || 'unchecked')} (${esc(note.later_treatment_placeholder || 'later_treatment_not_yet_checked')})</div>
        </details>` : `<div class="fruit-meta">Later treatment: ${esc(note.current_treatment_status || 'unchecked')}</div>`}
      </article>
    `;
  }

  function renderInspector() {
    const body = $('#inspector-body');
    const kindEl = $('#inspector-kind');
    const sel = S.selectedEntity;
    if (!sel) { body.innerHTML = '<p class="hint">Select a flow step, authority, SOP block, or template clause to inspect its source trail.</p>'; kindEl.textContent = ''; return; }

    if (sel.kind === 'node') {
      const n = S.nodeMap[sel.id];
      if (!n) return;
      kindEl.textContent = TYPE_LABEL[n.type] || n.type;
      const auths = n.type === 'flow_step' ? authoritiesForStep(n.id) : authoritiesForNode(n);
      const sopBlocks = n.type === 'flow_step' ? sopBlocksForStep(n.id) : [];
      const used = usedInLastTrace(n.id);
      const relatedFlows = S.flows.filter(f => (f.steps || []).includes(n.id));
      const doctrineId = doctrineNodeId(n);

      body.innerHTML = `
        <div class="insp-title">${esc(n.label)}</div>
        <div class="insp-badges">${nodeStatusBadges(n)}</div>
        ${used !== null ? `<div class="insp-section"><span class="used-flag ${used ? '' : 'not-used'}">${used ? '✓ Used in current task trace' : '— Not used in current task trace'}</span></div>` : ''}
        <div class="insp-section">
          <div class="insp-label">Extracted principle / summary</div>
          <div class="insp-quote">${esc(n.summary || n.principle_summary || '—')}</div>
          <div class="insp-anchor">${esc(n.id)}${n.subsection ? ' · §' + esc(n.subsection) : n.section ? ' · §' + esc(n.section) : ''}</div>
          ${authoritySourceUrl(n) ? `<div class="insp-text" style="margin-top:8px"><a href="${esc(authoritySourceUrl(n))}" target="_blank" rel="noreferrer">Open full judgment on HKLII</a>${n.neutral_citation ? ` · ${esc(n.neutral_citation)}` : ''}${n.law_report_citation ? ` · ${esc(n.law_report_citation)}` : ''}</div>` : ''}
        </div>
        ${auths.length ? `<div class="insp-section">
          <div class="insp-label">Linked authority</div>
          <ul class="insp-list">${auths.map(a => `<li><button data-go="node:${a.id}">${esc(a.label)}</button> ${badge(a.verification_status || a.authority_status || '')}</li>`).join('')}</ul>
        </div>` : ''}
        ${relatedFlows.length ? `<div class="insp-section">
          <div class="insp-label">Appears in flows</div>
          <ul class="insp-list">${relatedFlows.map(f => `<li><button data-goflow="${f.flow_id}">${esc(f.title)}</button></li>`).join('')}</ul>
        </div>` : ''}
        ${sopBlocks.length ? `<div class="insp-section">
          <div class="insp-label">Firm SOP at this step</div>
          ${sopBlocks.map(({ sop, block }) => `
            <div class="sop-note"><span class="sn-label">${esc(sop.title)} ${versionBadge(block.version)}</span>${esc(block.instruction)}</div>
          `).join('')}
        </div>` : ''}
        <div class="insp-section">
          <div class="insp-label">Case Fruits / Paragraph Proof</div>
          <div class="fruit-panel" id="${caseFruitKey(doctrineId)}" data-node-id="${esc(doctrineId)}">
            <div class="fruit-loading">Loading source-linked paragraph proof…</div>
          </div>
        </div>
        <div class="insp-section">
          <div class="insp-label">Audit</div>
          <div class="insp-text">Every use of this item in a task run is recorded in the execution trace with flow, SOP and template versions.</div>
        </div>`;
      wireInspectorLinks(body);
      loadCaseFruitsForNode(n);
      return;
    }

    if (sel.kind === 'sop') {
      const sop = (S.firm.sops || []).find(s => s.sop_id === sel.id);
      if (!sop) return;
      kindEl.textContent = 'Firm SOP';
      const sopProposals = window.SopEditor ? window.SopEditor.proposalsForSop(sop.sop_id) : [];
      const statusBadge = (status) => `<span class="badge badge-${status === 'approved' ? 'approved' : status === 'rejected' ? 'nsl' : 'draft'}">${esc(status)}</span>`;
      body.innerHTML = `
        <div class="insp-title">${esc(sop.title)}</div>
        <div class="insp-badges">${badge(sop.status)} ${versionBadge(sop.version)}</div>
        <div class="insp-section"><div class="insp-label">Purpose</div><div class="insp-text">${esc(sop.description)}</div></div>
        ${(sop.review_gates || []).length ? `<div class="insp-section"><div class="insp-label">Review gates</div>
          <ul class="insp-list">${sop.review_gates.map(g => `<li><span class="badge badge-review">Human review</span> ${esc(g.label)}</li>`).join('')}</ul></div>` : ''}
        <div class="insp-section"><div class="insp-label">SOP blocks (editable)</div>
          ${(sop.blocks || []).map(block => `
            <div class="sop-note sop-block-editable" data-block-id="${esc(block.block_id)}">
              <span class="sn-label">${esc(block.title)} ${versionBadge(block.version)}</span>${esc(block.instruction)}
              <div class="sop-block-actions">
                <button class="ghost-btn" data-sop-propose="${esc(block.block_id)}">Propose edit</button>
                <button class="ghost-btn" data-sop-compare="${esc(block.block_id)}">Compare versions</button>
              </div>
            </div>`).join('')}
        </div>
        <div class="insp-section"><div class="insp-label">Review queue (${sopProposals.length})</div>
          ${sopProposals.length ? `<ul class="insp-list sop-review-queue">${sopProposals.map(p => `
            <li>
              ${statusBadge(p.status)} <strong>${esc(p.block_title)}</strong> · ${esc(p.proposed_by)} · ${esc((p.created_at || '').slice(0, 10))}
              ${(p.linked_authorities || []).length ? `<br><span class="sop-queue-auth">Authority: ${p.linked_authorities.map(a => `${esc(a.case_name)} ${esc(a.citation)} para ${esc(a.paragraph_number)}`).join('; ')}</span>` : ''}
              ${p.status === 'proposed' ? `<div class="sop-block-actions">
                <button class="ghost-btn" data-sop-approve="${esc(p.proposal_id)}">Approve</button>
                <button class="ghost-btn" data-sop-reject="${esc(p.proposal_id)}">Reject</button>
              </div>` : `<br><span class="sop-queue-auth">Reviewed by ${esc(p.reviewer || '—')}</span>`}
            </li>`).join('')}</ul>` : '<div class="insp-text">No proposals yet. Use “Propose edit” on a block.</div>'}
          <div class="sop-block-actions"><button class="ghost-btn" data-sop-export>Export review queue</button></div>
        </div>
        <div class="insp-section"><div class="insp-label">Version history</div>
          <ul class="insp-list">${(sop.changelog || []).map(c => `<li><strong>v${esc(c.version)}</strong> · ${esc(c.date)} · ${esc(c.by)}<br><span style="color:var(--umber)">${esc(c.note)}</span></li>`).join('')}</ul></div>`;
      if (window.SopEditor) {
        body.querySelectorAll('[data-sop-propose]').forEach(btn => btn.addEventListener('click', () => {
          const block = (sop.blocks || []).find(b => b.block_id === btn.getAttribute('data-sop-propose'));
          if (block) window.SopEditor.openProposeModal(sop, block, verifiedAuthorityOptions(), () => renderInspector());
        }));
        body.querySelectorAll('[data-sop-compare]').forEach(btn => btn.addEventListener('click', () => {
          const block = (sop.blocks || []).find(b => b.block_id === btn.getAttribute('data-sop-compare'));
          if (block) window.SopEditor.openCompareModal(sop, block);
        }));
        body.querySelectorAll('[data-sop-approve]').forEach(btn => btn.addEventListener('click', () => {
          window.SopEditor.setStatus(btn.getAttribute('data-sop-approve'), 'approved', 'demo partner');
        }));
        body.querySelectorAll('[data-sop-reject]').forEach(btn => btn.addEventListener('click', () => {
          window.SopEditor.setStatus(btn.getAttribute('data-sop-reject'), 'rejected', 'demo partner');
        }));
        const exportBtn = body.querySelector('[data-sop-export]');
        if (exportBtn) exportBtn.addEventListener('click', () => window.SopEditor.exportQueue());
      }
      return;
    }

    if (sel.kind === 'template') {
      const t = (S.firm.templates || []).find(x => x.template_id === sel.id);
      if (!t) return;
      kindEl.textContent = 'Template';
      body.innerHTML = `
        <div class="insp-title">${esc(t.title)}</div>
        <div class="insp-badges">${badge(t.status)} ${versionBadge(t.version)}</div>
        <div class="insp-section"><div class="insp-label">Clauses</div>
          ${t.clauses.map(c => `<div class="insp-section"><div class="insp-label">${esc(c.title)}</div><div class="insp-quote">${esc(c.text)}</div></div>`).join('')}
        </div>`;
      return;
    }

    if (sel.kind === 'form') {
      const t = formById(sel.id);
      if (!t) return;
      const clauses = clausesForTemplate(t.id);
      const notes = notesForTemplate(t.id);
      kindEl.textContent = 'Private form';
      body.innerHTML = `
        <div class="insp-title">${esc(t.title)}</div>
        <div class="insp-badges">
          <span class="badge badge-research">Research prototype</span>
          <span class="badge badge-verified">${esc(t.provenanceLabel)}</span>
          ${t.demoFixture ? '<span class="badge badge-research">Synthetic demo</span>' : '<span class="badge badge-draft">Lawyer review required</span>'}
          <span class="badge badge-draft">${esc(t.classificationStatus || 'machine_candidate')}</span>
        </div>
        <div class="insp-section"><div class="insp-label">Routing position</div>
          <div class="insp-text">${esc(t.practiceArea)} · ${esc(t.documentIntent)} · ${esc(t.proceduralStage)}</div>
        </div>
        <div class="insp-section"><div class="insp-label">Classification review decision</div>
          <div class="insp-text">Status: ${esc(t.classificationStatus || 'machine_candidate')} · reviewer decision: ${esc(t.reviewerDecision?.status || 'pending')} · active in routing: ${t.activeInRouting || t.routingActiveInDemo ? 'yes' : 'no'}</div>
          <ul class="insp-list">
            <li>Proposed practice area: ${esc(t.proposedPracticeArea || t.practiceArea)}</li>
            <li>Proposed intent: ${esc(t.proposedDocumentIntent || t.documentIntent)}</li>
            <li>Proposed stage: ${esc(t.proposedProceduralStage || t.proceduralStage)}</li>
            <li>Trace: ${esc(t.classificationExtractionTrace?.method || 'machine extraction')}</li>
          </ul>
        </div>
        <div class="insp-section"><div class="insp-label">Use when</div>
          <ul class="insp-list">${(t.recommendedWhen || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>Structured filters match.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Do not use when</div>
          <ul class="insp-list">${(t.contraindications || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>No contraindication configured.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Prerequisites</div>
          <ul class="insp-list">${(t.prerequisites || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Field schema</div>
          <ul class="insp-list">${(t.fieldSchema || []).map(f => `<li>${esc(f.fieldKey)}${f.evidenceRequired ? ' · evidence required' : ''}${f.lawyerOnly ? ' · lawyer field' : ''}</li>`).join('') || '<li>No fields extracted.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Clause snippets</div>
          <ul class="insp-list">${clauses.map(c => `<li><button data-go="clause:${esc(c.id)}">${esc(c.heading)}</button> · ${esc(c.clauseType)}</li>`).join('') || '<li>No clauses extracted.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">NotebookLM usage references</div>
          <ul class="insp-list">${notes.map(n => `<li><button data-go="note:${esc(n.id)}">${esc(n.noteTitle)}</button></li>`).join('') || '<li>No linked notes.</li>'}</ul>
        </div>`;
      wireInspectorLinks(body);
      return;
    }

    if (sel.kind === 'clause') {
      const c = clauseById(sel.id);
      if (!c) return;
      const notes = notesForClause(c.id);
      kindEl.textContent = 'Clause snippet';
      body.innerHTML = `
        <div class="insp-title">${esc(c.heading)}</div>
        <div class="insp-badges">
          <span class="badge badge-verified">${esc(c.provenanceLabel)}</span>
          <span class="badge badge-research">${esc(c.clauseType)}</span>
          <span class="badge badge-draft">${esc(c.reviewStatus || 'lawyer_review_required')}</span>
        </div>
        <div class="insp-section"><div class="insp-label">Clause text</div><div class="insp-quote">${esc(c.text)}</div></div>
        <div class="insp-section"><div class="insp-label">Use conditions</div>
          <ul class="insp-list">${(c.useWhen || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>Use only when structured filters match.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Do-not-use conditions</div>
          <ul class="insp-list">${(c.doNotUseWhen || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>No blocker configured.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Required facts / missing fact blockers</div>
          <ul class="insp-list">${(c.factRequirements || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>No required facts configured.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">Alternatives and risk notes</div>
          <ul class="insp-list">${[...(c.alternatives || []), ...(c.risks || [])].map(x => `<li>${esc(x)}</li>`).join('') || '<li>No alternatives configured.</li>'}</ul>
        </div>
        <div class="insp-section"><div class="insp-label">NotebookLM usage references</div>
          <ul class="insp-list">${notes.map(n => `<li><button data-go="note:${esc(n.id)}">${esc(n.noteTitle)}</button> · candidate link</li>`).join('') || '<li>No linked notes.</li>'}</ul>
        </div>`;
      wireInspectorLinks(body);
      return;
    }

    if (sel.kind === 'note') {
      const n = noteById(sel.id);
      if (!n) return;
      kindEl.textContent = 'Internal usage note';
      body.innerHTML = `
        <div class="insp-title">${esc(n.noteTitle)}</div>
        <div class="insp-badges"><span class="badge badge-research">${esc(n.provenanceLabel)}</span><span class="badge badge-draft">${esc(n.status || 'candidate_usage_note')}</span><span class="badge badge-draft">candidate links</span></div>
        <div class="insp-section"><div class="insp-label">Use when</div><ul class="insp-list">${(n.suggestedUseWhen || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div class="insp-section"><div class="insp-label">Do not use when</div><ul class="insp-list">${(n.suggestedDoNotUseWhen || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div class="insp-section"><div class="insp-label">Authority boundary</div><div class="insp-text">Internal usage note only. It may guide form routing, but it is not public legal authority.</div></div>
        <div class="insp-section"><div class="insp-label">Linked candidates</div>
          <ul class="insp-list">
            ${(n.templateLinks || []).map(link => `<li>Template ${esc(link.templateId)} · ${esc(link.note_template_link_status || 'candidate')}</li>`).join('')}
            ${(n.clauseLinks || []).map(link => `<li>Clause ${esc(link.clauseId)} · ${esc(link.note_clause_link_status || 'candidate')}</li>`).join('')}
          </ul>
        </div>
      `;
      return;
    }
  }

  function wireInspectorLinks(scope) {
    scope.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const [kind, id] = b.dataset.go.split(':');
      select(kind, id);
    }));
    scope.querySelectorAll('[data-goflow]').forEach(b => b.addEventListener('click', () => {
      S.view = 'flows'; S.selectedFlowId = b.dataset.goflow; renderView(); setActiveNav();
    }));
  }

  // ── Views ──
  const root = () => $('#view-root');

  function renderView() {
    ({ domains: viewDomains, flows: viewFlows, doctrine: viewDoctrine, inquiry: viewInquiry, tasks: viewTasks, playbooks: viewPlaybooks, templates: viewTemplates, forms: viewForms, audit: viewAudit }[S.view] || viewFlows)();
  }

  function viewHeader(eyebrow, title, lede) {
    return `<div class="view-eyebrow">${eyebrow}</div><div class="view-title">${title}</div><p class="view-lede">${lede}</p>`;
  }

  // — Domains —
  function viewDomains() {
    root().innerHTML = `
      ${viewHeader('Domain registry', 'Legal domains', 'Choose a legal domain pack. Each pack has its own doctrine map, legal flows, source audit queue, and any firm overlay that applies to those flow IDs.')}
      <div class="domain-grid">
        ${S.domains.map(domain => {
          const summary = S.domainSummaries[domain.domain_id] || {};
          const active = domain.domain_id === S.selectedDomainId;
          return `<button class="domain-card ${active ? 'active' : ''}" data-domain-card="${esc(domain.domain_id)}">
            <div class="domain-card-top">
              <span class="domain-card-title">${esc(summary.title || domain.title)}</span>
              ${active ? '<span class="badge badge-approved">Active</span>' : ''}
            </div>
            <p>${esc(summary.description || 'Legal domain pack with doctrine map and flows.')}</p>
            <div class="domain-card-meta">
              <span>${summary.sectionCount || 0} sections</span>
              <span>${summary.flowCount || 0} flows</span>
              ${summary.nodeCount ? `<span>${summary.nodeCount} issues</span>` : ''}
              <span>${esc(domain.domain_id)}</span>
            </div>
          </button>`;
        }).join('')}
      </div>
    `;
    root().querySelectorAll('[data-domain-card]').forEach(card => {
      card.addEventListener('click', () => switchDomain(card.dataset.domainCard, 'flows'));
    });
  }

  // — Legal Flows —
  function viewFlows() {
    if (!S.flows.length) { root().innerHTML = emptyState('No flows loaded', 'The flow registry could not be read. The workspace is running on fallback demo data.'); return; }
    if (!S.selectedFlowId) S.selectedFlowId = S.flows[0].flow_id;
    const flow = S.flows.find(f => f.flow_id === S.selectedFlowId) || S.flows[0];
    const linkedSops = sopsForFlow(flow.flow_id);

    root().innerHTML = `
      ${viewHeader('Legal flows', S.domainInfo?.title || 'Procedural flows', 'Fixed, reusable procedural flows extracted from the selected doctrine graph. Each step shows its linked authority, verification status, and any firm SOP instruction layered on top.')}
      <div class="chip-row">${S.flows.map(f => `<button class="chip ${f.flow_id === flow.flow_id ? 'active' : ''}" data-flow="${f.flow_id}">${esc(f.title)}</button>`).join('')}</div>
      <div class="card" style="background:var(--parchment);border-style:dashed;">
        <div class="card-top"><span class="card-title">${esc(flow.title)}</span>${versionBadge('1.0')}
          ${linkedSops.map(s => `<span class="badge badge-research">Firm overlay: ${esc(s.title)} v${esc(s.version)}</span>`).join('')}
        </div>
        <div class="card-body">${esc(flow.description || '')}</div>
      </div>
      ${(flow.steps || []).map((sid, i) => renderStepCard(sid, i + 1)).join('')}
    `;
    root().querySelectorAll('[data-flow]').forEach(b => b.addEventListener('click', () => { S.selectedFlowId = b.dataset.flow; renderView(); }));
    wireCards();
  }

  function renderStepCard(stepId, num) {
    const n = S.nodeMap[stepId];
    if (!n) return '';
    const auths = authoritiesForStep(stepId);
    const issues = issuesLinkedToStep(stepId);
    const sopBlocks = sopBlocksForStep(stepId);
    const used = usedInLastTrace(stepId);
    return `
      <div class="card selectable" data-sel="node:${stepId}" data-card="node:${stepId}">
        <div class="card-top">
          <span class="card-num">${num}</span>
          <span class="card-title">${esc((n.label || n.id).replace(/^.*?Flow:\s*/, ''))}</span>
          <span class="card-badges">
            ${used ? '<span class="badge badge-verified">In current trace</span>' : ''}
            ${n.verification_status ? badge(n.verification_status) : ''}
          </span>
        </div>
        <div class="card-body">${esc(n.summary || '')}</div>
        ${(auths.length || issues.length) ? `<div class="card-links">
          ${issues.map(a => `<span class="link-pill" data-card="node:${a.id}"><span class="lp-kind">issue</span>${esc(a.label)}</span>`).join('')}
          ${auths.map(a => `<span class="link-pill" data-card="node:${a.id}"><span class="lp-kind">${esc(TYPE_LABEL[a.type] || a.type)}</span>${esc(a.label)}</span>`).join('')}
        </div>` : ''}
        ${sopBlocks.map(({ sop, block }) => `<div class="sop-note"><span class="sn-label">Firm SOP · ${esc(sop.title)} ${versionBadge(block.version)}</span>${esc(block.instruction)}</div>`).join('')}
      </div>`;
  }

  // — Doctrine map —
  function expandAllDoctrineSections() {
    S.nodes.filter(n => n.type === 'section_header').forEach(sec => {
      if (sec.section) S.openSections.add(sec.section);
    });
  }

  function viewDoctrine() {
    const sections = S.nodes.filter(n => n.type === 'section_header').sort((a, b) => (a.section || '').localeCompare(b.section || ''));
    if (!sections.length) {
      root().innerHTML = `${viewHeader('Doctrine map', S.domainInfo?.title || 'Doctrine by section', 'The base legal graph: issues, statutes, case seeds, and practice directions grouped by section.')}
        ${emptyState('No doctrine sections loaded', 'The domain pack did not return any section headers. Check that data files are reachable, or open the Visual Tree view.')}
        <p class="view-lede"><a href="index_legacy.html">Open visual tree map</a> for the hierarchical L0–L4 explorer.</p>`;
      return;
    }
    if (!S.openSections.size) expandAllDoctrineSections();
    const issueCount = S.nodes.filter(n => n.type === 'legal_issue').length;
    root().innerHTML = `
      ${viewHeader('Doctrine map', S.domainInfo?.title || 'Doctrine by section', 'The base legal graph: issues, statutes, case seeds, and practice directions grouped by section. Click any item to inspect its extracted principle and source trail.')}
      <div class="doc-toolbar">
        <span class="doc-toolbar-meta">${sections.length} sections · ${issueCount} issues · ${S.nodes.length} nodes</span>
        <button type="button" class="doc-toolbar-btn" id="doctrine-expand-all">Expand all</button>
        <button type="button" class="doc-toolbar-btn" id="doctrine-collapse-all">Collapse all</button>
        <a class="doc-toolbar-btn doc-toolbar-link" href="index_legacy.html">Visual tree</a>
      </div>
      ${sections.map(sec => {
        const issues = S.nodes.filter(n => n.type === 'legal_issue' && n.section === sec.section)
          .sort((a, b) => (a.subsection || '').localeCompare(b.subsection || ''));
        const open = S.openSections.has(sec.section);
        return `
          <div class="doc-section">
            <button class="doc-section-head" data-sec="${esc(sec.section)}">
              <span class="ds-num">§${esc(sec.section)}</span>
              <span class="ds-title">${esc(sec.label)}</span>
              <span class="ds-count">${issues.length} issues</span>
            </button>
            ${open ? `<div class="doc-issues">${issues.map(iss => {
              const refCount = authoritiesForNode(iss).length;
              return `<button class="doc-issue" data-sel="node:${iss.id}" data-card="node:${iss.id}">
                <span class="di-label">${esc(iss.label)}</span>
                <span class="di-refs">${refCount} sources</span>
              </button>`;
            }).join('')}</div>` : ''}
          </div>`;
      }).join('')}
    `;
    root().querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.sec;
      S.openSections.has(id) ? S.openSections.delete(id) : S.openSections.add(id);
      renderView();
    }));
    const expandAll = root().querySelector('#doctrine-expand-all');
    const collapseAll = root().querySelector('#doctrine-collapse-all');
    if (expandAll) expandAll.addEventListener('click', () => { expandAllDoctrineSections(); renderView(); });
    if (collapseAll) collapseAll.addEventListener('click', () => { S.openSections.clear(); renderView(); });
    wireCards();
  }

  // — Tasks —
  function viewTasks() {
    const tasks = currentDomainTasks();
    root().innerHTML = `
      ${viewHeader('Task runner', 'Matter tasks', 'Run an AI task only through an approved flow, firm SOP, and template. The execution trace records exactly which authority, SOP block, and clause each output relied on — and where human review is required.')}
      ${tasks.length ? tasks.map(t => {
        const flow = S.flows.find(f => f.flow_id === t.flow_id);
        const sop = (S.firm.sops || []).find(s => s.sop_id === t.sop_id);
        const tpl = (S.firm.templates || []).find(x => x.template_id === t.template_id);
        return `<div class="card">
          <div class="card-top"><span class="card-title">${esc(t.title)}</span>
            <span class="card-badges"><span class="badge badge-review">Human review gate</span></span></div>
          <div class="card-body">${esc(t.description)}</div>
          <div class="card-links">
            ${flow ? `<span class="link-pill"><span class="lp-kind">flow</span>${esc(flow.title)} v1.0</span>` : ''}
            ${sop ? `<span class="link-pill"><span class="lp-kind">sop</span>${esc(sop.title)} v${esc(sop.version)}</span>` : ''}
            ${tpl ? `<span class="link-pill"><span class="lp-kind">template</span>${esc(tpl.title)} v${esc(tpl.version)}</span>` : ''}
          </div>
          <div style="margin-top:12px"><button class="run-btn" data-run="${esc(t.task_id)}">Run task (demo)</button></div>
        </div>`;
      }).join('') : emptyState('No firm tasks configured for this domain', 'The restored public domain pack is available. Add a firm overlay to define matter tasks bound to its flows, SOPs, and templates.')}
      <div id="trace-root"></div>
    `;
    root().querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => runTask(b.dataset.run)));
    if (S.lastTrace) renderTrace();
  }

  function runTask(taskId) {
    const t = (S.firm.demo_tasks || []).find(x => x.task_id === taskId);
    if (!t) return;
    const flow = S.flows.find(f => f.flow_id === t.flow_id);
    const sop = (S.firm.sops || []).find(s => s.sop_id === t.sop_id);
    const tpl = (S.firm.templates || []).find(x => x.template_id === t.template_id);

    const usedIds = new Set();
    const rail = [];
    (flow ? (flow.steps || []) : []).forEach(sid => {
      const n = S.nodeMap[sid]; if (!n) return;
      usedIds.add(sid);
      const auths = authoritiesForStep(sid);
      auths.forEach(a => usedIds.add(a.id));
      rail.push({
        kind: 'Flow step', label: (n.label || n.id).replace(/^.*?Flow:\s*/, ''),
        detail: auths.length ? 'Authority: ' + auths.map(a => a.label).join('; ') : 'No direct authority at this step',
        id: sid,
      });
      sopBlocksForStep(sid).forEach(({ sop: s2, block }) => {
        rail.push({ kind: 'Firm SOP', label: block.title + ' (' + s2.title + ' v' + block.version + ')', detail: block.instruction, id: block.block_id });
      });
    });
    if (tpl) rail.push({ kind: 'Template', label: tpl.title + ' v' + tpl.version, detail: tpl.clauses.map(c => c.title).join(' · '), id: tpl.template_id });
    rail.push({ kind: 'Review gate', label: t.review_gate, detail: 'Output is marked preliminary until this gate is cleared.', gate: true });

    S.lastTrace = {
      task: t,
      flowLabel: flow ? flow.title + ' v1.0' : '—',
      sopLabel: sop ? sop.title + ' v' + sop.version : '—',
      tplLabel: tpl ? tpl.title + ' v' + tpl.version : '—',
      rail, usedIds, ranAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    renderTrace();
    renderInspector();
  }

  function renderTrace() {
    const tr = S.lastTrace;
    const el = $('#trace-root');
    if (!tr || !el) return;
    el.innerHTML = `
      <div class="card" style="border-color:var(--bronze-soft)">
        <div class="card-top"><span class="card-title">Execution trace — ${esc(tr.task.title)}</span>
          <span class="card-badges">${badge('verified_case_linked')}</span></div>
        <div class="card-body" style="font-family:var(--mono);font-size:11px;color:var(--faded)">
          flow: ${esc(tr.flowLabel)} · sop: ${esc(tr.sopLabel)} · template: ${esc(tr.tplLabel)} · run: ${esc(tr.ranAt)}
        </div>
        <div class="rail">
          ${tr.rail.map(r => `
            <div class="rail-step ${r.gate ? 'rail-gate' : ''}">
              <div class="rail-dot-col"><div class="rail-dot"></div><div class="rail-line"></div></div>
              <div class="rail-content">
                <div class="rail-kind">${esc(r.kind)}</div>
                <div class="rail-label">${esc(r.label)}</div>
                <div class="rail-detail">${esc(r.detail)}</div>
              </div>
            </div>`).join('')}
        </div>
        <div class="card-body" style="margin-top:4px">Every item above is now flagged “In current trace” throughout the workspace, so the draft can be audited line by line.</div>
      </div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // — Firm playbooks —
  function viewPlaybooks() {
    const sops = currentDomainSops();
    root().innerHTML = `
      ${viewHeader('Firm overlay', 'Firm playbooks', 'Your firm’s private layer on top of the public legal graph: versioned SOPs, preferred authorities, review gates. Editable and reviewable — AI tasks run only against approved versions.')}
      ${sops.length ? sops.map(s => `
        <div class="card selectable" data-sel="sop:${esc(s.sop_id)}" data-card="sop:${esc(s.sop_id)}">
          <div class="card-top">
            <span class="card-title">${esc(s.title)}</span>
            <span class="card-badges">${badge(s.status)} ${versionBadge(s.version)}</span>
          </div>
          <div class="card-body">${esc(s.description)} <span style="color:var(--faded)">· ${esc(s.practice_area)} · updated ${esc(s.last_updated)}${s.approved_by ? ' · approved by ' + esc(s.approved_by) : ''}</span></div>
          <div class="card-links">
            ${(s.linked_flows || []).map(fid => { const f = S.flows.find(x => x.flow_id === fid); return f ? `<span class="link-pill"><span class="lp-kind">flow</span>${esc(f.title)}</span>` : ''; }).join('')}
            ${(s.linked_templates || []).map(tid => { const t = (S.firm.templates || []).find(x => x.template_id === tid); return t ? `<span class="link-pill"><span class="lp-kind">template</span>${esc(t.title)}</span>` : ''; }).join('')}
            ${(s.review_gates || []).map(g => `<span class="link-pill"><span class="lp-kind">gate</span>${esc(g.label)}</span>`).join('')}
          </div>
        </div>`).join('') : emptyState('No firm SOPs configured for this domain', 'The public doctrine and flows are restored. Add domain-specific playbooks when the firm overlay for this practice area is ready.')}
    `;
    wireCards();
  }

  // — Templates —
  function viewTemplates() {
    const tpls = currentDomainTemplates();
    root().innerHTML = `
      ${viewHeader('Firm overlay', 'Templates', 'Firm-approved drafting blocks. AI drafts pull clauses from here instead of inventing structure, so every output already speaks in the firm’s voice.')}
      ${tpls.length ? tpls.map(t => `
        <div class="card selectable" data-sel="template:${esc(t.template_id)}" data-card="template:${esc(t.template_id)}">
          <div class="card-top"><span class="card-title">${esc(t.title)}</span>
            <span class="card-badges">${badge(t.status)} ${versionBadge(t.version)}</span></div>
          <div class="card-body" style="color:var(--faded)">updated ${esc(t.last_updated)} · ${t.clauses.length} clauses</div>
          <div class="card-links">${t.clauses.map(c => `<span class="link-pill"><span class="lp-kind">clause</span>${esc(c.title)}</span>`).join('')}</div>
        </div>`).join('') : emptyState('No templates configured for this domain', 'The restored flows can still be inspected. Add templates when you want AI task runs for this practice area.')}
    `;
    wireCards();
  }

  // — Forms & Precedent Snippets —
  function viewForms() {
    const templates = S.forms.templates || [];
    const clauses = S.forms.clauses || [];
    const notes = S.forms.notebooklmUsageNotes || [];
    const rules = S.forms.usageRules || [];
    const letter = templates.find(t => t.documentIntent === 'LETTER_OF_CLAIM');
    const writ = templates.find(t => t.documentIntent === 'WRIT');
    const police = templates.find(t => t.documentIntent === 'POLICE_REPORT_REQUEST');
    const medical = templates.find(t => t.documentIntent === 'MEDICAL_RECORDS_REQUEST');
    const specialDamages = clauses.find(c => c.clauseType === 'SPECIAL_DAMAGES');
    const stagePills = Array.from(new Set(templates.map(t => t.proceduralStage))).map(s => `<span class="link-pill"><span class="lp-kind">stage</span>${esc(s)}</span>`).join('');
    root().innerHTML = `
      ${viewHeader('Private drafting layer', 'Forms & Precedent Snippets', 'Forms behave like code snippets: classified by stage and intent, governed by use/do-not-use rules, and applied only when matter facts support them. Synthetic fixtures are shown here; real packs stay in private storage.')}
      <div class="forms-hero card">
        <div class="card-top"><span class="card-title">Forms-as-code MVP</span><span class="card-badges"><span class="badge badge-research">Private metadata layer</span><span class="badge badge-research">Synthetic demo</span><span class="badge badge-verified">Structured gates first</span></span></div>
        <div class="forms-metrics">
          <span><strong>${templates.length}</strong> templates</span>
          <span><strong>${clauses.length}</strong> clauses</span>
          <span><strong>${rules.length}</strong> usage rules</span>
          <span><strong>${notes.length}</strong> internal notes</span>
        </div>
      </div>

      <div class="forms-grid">
        <section class="card">
          <div class="card-top"><span class="card-title">Form Pack Inventory</span><span class="badge badge-research">FIRM_PRIVATE</span></div>
          <div class="card-body">${esc(S.forms.formPack?.sourcePackName || 'Synthetic PI Forms Pack')} · ${esc(S.forms.formPack?.sourceLicenseNote || 'Synthetic fixture only')}</div>
          <div class="card-links">${templates.map(t => `<button class="link-pill" data-card="form:${esc(t.id)}"><span class="lp-kind">${esc(t.documentIntent)}</span>${esc(t.title)}</button>`).join('')}</div>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Form Classification Review</span><span class="badge badge-draft">machine candidate</span></div>
          ${templates.map(t => `<div class="forms-row selectable" data-card="form:${esc(t.id)}" data-sel="form:${esc(t.id)}">
            <span>${esc(t.title)}</span><small>${esc(t.practiceArea)} · ${esc(t.documentIntent)} · ${esc(t.proceduralStage)} · ${esc(t.classificationStatus || 'machine_candidate')}${t.demoFixture ? ' · synthetic/demo' : ' · lawyer review required'}</small>
          </div>`).join('') || emptyState('No forms loaded', 'Run the synthetic ingestion demo or configure a private form store.')}
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Workflow Stage Mapping</span><span class="badge badge-verified">stage-gated</span></div>
          <div class="card-links">${stagePills || '<span class="link-pill">No stages mapped</span>'}</div>
          <div class="card-body">Commencement forms are blocked after proceedings have commenced. Claim letters can remain incomplete drafts until opponent and evidence prerequisites are met.</div>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Clause Snippet Library</span><span class="badge badge-research">TEMPLATE_BASED</span></div>
          <div class="forms-chip-list">${clauses.slice(0, 12).map(c => `<button class="forms-chip" data-card="clause:${esc(c.id)}" data-sel="clause:${esc(c.id)}">${esc(c.heading)}<small>${esc(c.clauseType)}</small></button>`).join('')}</div>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Use / Do Not Use Rules</span><span class="badge badge-verified">rules</span></div>
          <ul class="forms-list">
            <li>LETTER_OF_CLAIM finalisation blocked if opponent / insurer is unknown.</li>
            <li>WRIT blocked if proceedings already commenced.</li>
            <li>SPECIAL_DAMAGES clause becomes placeholder-only if supporting evidence is missing.</li>
          </ul>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">NotebookLM Usage Notes</span><span class="badge badge-research">INTERNAL_USAGE_NOTE</span></div>
          ${notes.map(n => `<div class="forms-row selectable" data-card="note:${esc(n.id)}" data-sel="note:${esc(n.id)}"><span>${esc(n.noteTitle)}</span><small>${esc(n.suggestedWorkflowStage)} · not authority · candidate links</small></div>`).join('') || '<div class="card-body">No notes loaded.</div>'}
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Matter-Specific Recommended Forms</span><span class="badge badge-verified">structured retrieval</span></div>
          <div class="card-body">Demo facts: road traffic injury, opponent unknown, no police report, medical evidence incomplete.</div>
          <div class="card-links">
            ${police ? `<button class="link-pill" data-card="form:${esc(police.id)}"><span class="lp-kind">recommended</span>${esc(police.title)}</button>` : ''}
            ${medical ? `<button class="link-pill" data-card="form:${esc(medical.id)}"><span class="lp-kind">recommended</span>${esc(medical.title)}</button>` : ''}
            ${letter ? `<button class="link-pill" data-card="form:${esc(letter.id)}"><span class="lp-kind">incomplete draft</span>${esc(letter.title)}</button>` : ''}
          </div>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Blocked Forms / Why Not</span><span class="badge badge-draft">gate</span></div>
          <ul class="forms-list">
            ${writ ? `<li><button class="text-btn" data-card="form:${esc(writ.id)}">${esc(writ.title)}</button> is not recommended until the matter reaches commencement and proceedings have not already commenced.</li>` : ''}
            <li>Letter of claim finalisation is blocked until opponent / insurer identification is complete.</li>
          </ul>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Draft Builder</span><span class="badge badge-research">placeholder-safe</span></div>
          <div class="card-body">Drafting fills known fields, leaves missing facts as placeholders, and blocks final approval where evidence is missing.</div>
          ${letter ? `<button class="ghost-btn" data-card="form:${esc(letter.id)}">Inspect letter template</button>` : ''}
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Missing Facts / Evidence Blockers</span><span class="badge badge-draft">no invention</span></div>
          <ul class="forms-list">
            <li>opponentIdentified</li>
            <li>medicalEvidenceReceived</li>
            <li>specialDamagesEvidenceAvailable</li>
          </ul>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">Lawyer Review / Approval</span><span class="badge badge-research">quiet metadata</span></div>
          <div class="card-body">Prototype retrieval is allowed for paragraph-linked public authority and private template metadata. Professional advice certification remains false until a later HITL layer approves the draft.</div>
        </section>

        <section class="card">
          <div class="card-top"><span class="card-title">SOP Update Suggestions</span><span class="badge badge-draft">AI_SUGGESTED</span></div>
          <div class="card-body">When lawyers change a form classification or clause blocker, the correction becomes a proposed SOP/template rule rather than unstructured chat memory.</div>
        </section>
      </div>
    `;
    wireCards();
  }

  // — Sources & audit —
  function viewAudit() {
    const counts = {};
    S.nodes.forEach(n => { if (n.type !== 'case_seed' || isVerifiedCaseSeedNode(n)) counts[n.type] = (counts[n.type] || 0) + 1; });
    const caseSeeds = S.nodes.filter(n => n.type === 'case_seed' && isVerifiedCaseSeedNode(n));
    const excludedCount = S.nodes.filter(n => n.type === 'case_seed' && !isVerifiedCaseSeedNode(n)).length;
    root().innerHTML = `
      ${viewHeader('Governance', 'Sources & audit', 'Product authority surfaces show verified HKLII paragraph proof only. Unresolved seeds are excluded and listed in the developer audit report.')}
      <table class="audit-table">
        <thead><tr><th>Object type</th><th>Count</th><th>Default status</th></tr></thead>
        <tbody>
          ${Object.entries(counts).sort().map(([k, v]) => `<tr>
            <td>${esc(TYPE_LABEL[k] || k)}</td><td class="mono">${v}</td>
            <td>${badge('verified_case_linked')}</td>
          </tr>`).join('')}
          <tr><td>Edges</td><td class="mono">${S.edges.length}</td><td>${badge('verified')}</td></tr>
          <tr><td>Firm SOPs</td><td class="mono">${currentDomainSops().length}</td><td>${badge('approved', 'where marked')}</td></tr>
        </tbody>
      </table>
      <div class="view-eyebrow" style="margin-bottom:10px">Paragraph-linked case authorities</div>
      ${caseSeeds.slice(0, 12).map(c => `
        <div class="card selectable" data-sel="node:${esc(c.id)}" data-card="node:${esc(c.id)}">
          <div class="card-top"><span class="card-title">${esc(c.label)}</span><span class="card-badges">${badge('verified_case_linked')}</span></div>
          <div class="card-body">${esc(c.summary || '')}${authoritySourceUrl(c) ? ` <a href="${esc(authoritySourceUrl(c))}" target="_blank" rel="noreferrer">HKLII</a>` : ''}</div>
        </div>`).join('')}
      ${caseSeeds.length > 12 ? `<p class="view-lede">…and ${caseSeeds.length - 12} more paragraph-linked cases.</p>` : ''}
      <div class="view-eyebrow" style="margin-top:18px">Developer audit — excluded unresolved seeds (${excludedCount})</div>
      <p class="view-lede">See <code>artifacts/excluded_unverified_case_seeds_report.md</code> for the full excluded inventory. These seeds are hidden from product authority cards and AI retrieval.</p>
    `;
    wireCards();
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }

  // — AI Inquiry: graph-grounded fact-pattern analysis —
  // Calls /api/search-evidence (deterministic retrieval over all domain packs,
  // whitelist-validated AI rerank, Supabase paragraph evidence). Falls back to a
  // clearly-labelled lexical search over the loaded domain when the API is absent.
  const INQ = { query: '', loading: false, result: null, mode: null };

  const COVERAGE_BADGE = {
    answer_safe: '<span class="badge badge-verified">Paragraph proof</span>',
    paragraph_verified: '<span class="badge badge-verified">Paragraph proof</span>',
    source_verified: '<span class="badge badge-verified">Source-linked</span>',
    candidate_only: '',
    no_evidence: '<span class="badge badge-draft">No paragraph linked yet</span>',
  };

  function localInquiryMatches(query, limit = 8) {
    const terms = query.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(w => w.length > 2);
    const scored = [];
    S.nodes.forEach(n => {
      if (n.type === 'section_header') return;
      if (n.type === 'case_seed' && !isVerifiedCaseSeedNode(n)) return;
      const hay = `${n.id} ${n.label || ''} ${n.summary || ''} ${(n.statute_refs || []).join(' ')} ${(n.case_seeds || []).join(' ')}`.toLowerCase();
      let score = 0;
      terms.forEach(t => {
        if (hay.includes(t)) score += 1;
        if ((n.label || '').toLowerCase().includes(t)) score += 3;
      });
      if (score) scored.push({ n, score });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ n, score }) => ({
      doctrine_node_id: n.id,
      source_node_id: n.id,
      title: n.label || n.id,
      node_type: n.type || 'unknown',
      domain_id: S.selectedDomainId,
      summary: n.summary || '',
      match_score: score,
      evidence: [],
      coverage_status: 'no_evidence',
    }));
  }

  function sopsForNodeId(nodeId) {
    const flowIds = S.flows.filter(f => (f.steps || []).includes(nodeId)).map(f => f.flow_id);
    return (S.firm?.sops || []).filter(s => (s.linked_flows || []).some(id => flowIds.includes(id)));
  }

  function renderWorkflowItems(items, emptyText) {
    if (!items || !items.length) return `<div class="piw-empty">${esc(emptyText)}</div>`;
    return items.map(item => `
      <div class="piw-item">
        <div class="piw-item-head">
          <strong>${esc(item.title || item)}</strong>
        </div>
        ${item.quote ? `<div class="piw-quote">${esc(item.quote)}</div>` : ''}
        ${item.citation ? `<div class="piw-meta">${esc(item.source || '')} · ${esc(item.citation)} · ${esc(item.pinpoint || '')}</div>` : ''}
        ${item.required_facts && item.required_facts.length ? `<div class="piw-meta">required facts: ${esc(item.required_facts.slice(0, 8).join(', '))}</div>` : ''}
        ${item.review_status || item.output_mode ? `<div class="piw-badges"><span class="badge badge-review">${esc(item.review_status || 'review required')}</span><span class="badge badge-draft">${esc(item.output_mode || 'draft only')}</span></div>` : ''}
      </div>
    `).join('');
  }

  function renderAppliedTriage(triage) {
    if (!triage) return '';
    return `
      <section class="piw-applied">
        <div class="piw-applied-head">
          <div>
            <div class="view-eyebrow">Applied triage</div>
            <h2>${esc(triage.title || 'Applied PI Triage')}</h2>
          </div>
          <span class="badge badge-review">Not legal advice</span>
        </div>
        <p class="piw-short">${esc(triage.short_answer || '')}</p>
        <div class="piw-applied-grid">
          ${(triage.sections || []).map(section => `
            <section class="piw-applied-section">
              <h3>${esc(section.heading)}</h3>
              <ul class="piw-list">${(section.items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
            </section>
          `).join('')}
        </div>
      </section>`;
  }

  function renderPiWorkflow(workflow) {
    if (!workflow) return '';
    return `
      <div class="piw-panel">
        <div class="card-top">
          <span class="card-title">PI staged workflow · ${esc(workflow.matter_view || 'triage')}</span>
          <span class="card-badges"><span class="badge badge-research">Research layer</span><span class="badge badge-review">Lawyer review required</span></span>
        </div>
        <div class="card-body">${esc(workflow.answer_note || '')}</div>
        ${renderAppliedTriage(workflow.applied_answer || workflow.applied_triage)}
        <div class="piw-grid">
          <section class="piw-main-section">
            <h3>Classification</h3>
            <ul class="piw-list">
              <li>Matter type: ${esc(workflow.classification?.matter_type || 'personal_injury')}</li>
              <li>Scenario: ${esc(String(workflow.classification?.scenario || 'unclassified').replace(/_/g, ' '))}</li>
              <li>Perspective: ${esc(String(workflow.classification?.user_perspective || 'unspecified').replace(/_/g, ' '))}</li>
              <li>Posture: ${esc(String(workflow.classification?.procedural_posture || 'early triage').replace(/_/g, ' '))}</li>
            </ul>
          </section>
          <section class="piw-main-section">
            <h3>Collapsed / Excluded Issues</h3>
            <ul class="piw-list">${(workflow.excluded_as_irrelevant || []).map(x => `<li>${esc(String(x).replace(/_/g, ' '))}</li>`).join('') || '<li>No automatic exclusions recorded.</li>'}</ul>
          </section>
        </div>
        <div class="piw-grid">
          <section class="piw-main-section">
            <h3>Evidence To Preserve</h3>
            <ul class="piw-list">${(workflow.evidence_plan || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </section>
          <section class="piw-main-section">
            <h3>Quantum / Settlement Consequences</h3>
            <ul class="piw-list">${(workflow.quantum_and_consequences || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </section>
        </div>
        <div class="piw-grid">
          <section class="piw-main-section">
            <h3>Next Procedural Steps</h3>
            <ol class="piw-list">${(workflow.next_procedure_steps || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          </section>
          <section class="piw-main-section">
            <h3>Missing Facts / Review Gates</h3>
            <ul class="piw-list">${(workflow.missing_information || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </section>
        </div>
        <details class="piw-audit">
          <summary>Source / audit trail</summary>
          <div class="piw-grid">
            <section>
              <h3>Principle Source Chunks</h3>
              ${renderWorkflowItems(workflow.principles, 'No principle source chunk met the PI retrieval threshold.')}
            </section>
            <section>
              <h3>Procedure / Form Source Chunks</h3>
              ${renderWorkflowItems(workflow.procedures_forms, 'No procedure/form source chunk met the PI retrieval threshold.')}
            </section>
          </div>
          ${workflow.verification && workflow.verification.length ? `<section class="piw-governance">
            <h3>Verification / Source Hierarchy</h3>
            ${renderWorkflowItems(workflow.verification, 'No governance chunk matched.')}
          </section>` : ''}
        </details>
      </div>
    `;
  }

  function runInquiry(query) {
    INQ.query = query;
    INQ.loading = true;
    INQ.result = null;
    viewInquiry();
    fetch('/api/search-evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then(r => {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    }).then(result => {
      INQ.result = result;
      INQ.mode = 'api';
    }).catch(() => {
      INQ.mode = 'local';
      INQ.result = {
        matched_doctrine_nodes: localInquiryMatches(query),
        warnings: ['ai_not_configured_fallback_search', 'backend_evidence_unavailable', 'local_lexical_only_current_domain'],
        inquiry_analysis: null,
        ai_provider: 'none',
        evidence_count: 0,
      };
    }).finally(() => {
      INQ.loading = false;
      if (S.view === 'inquiry') viewInquiry();
    });
  }

  function renderAnalysisCaseReferences(analysis, matchedNodes) {
    const refs = analysis?.case_references || [];
    if (!refs.length) return '';
    const evidenceByKey = new Map();
    (matchedNodes || []).forEach(node => {
      (node.evidence || []).forEach(item => {
        const key = `${item.neutral_citation || item.case_name || ''}::${item.para_no || ''}`;
        if (!evidenceByKey.has(key)) evidenceByKey.set(key, item);
      });
    });
    const mergedRefs = refs.map(ref => {
      const key = `${ref.neutral_citation || ref.case_name || ''}::${ref.para_no || ''}`;
      return { ...(evidenceByKey.get(key) || {}), ...ref };
    });
    const groups = groupEvidenceByCase(mergedRefs);
    const cards = groups.map(group => renderCaseNoteCard(group, mergedRefs.length)).join('');
    return `
      <div class="card">
        <div class="card-top"><span class="card-title">Cited paragraph proof</span></div>
        <div class="card-body fruit-list">${cards}</div>
      </div>`;
  }

  function renderPrivateFormsInquiry(forms) {
    if (!forms) return '';
    const recommended = forms.recommended_forms || [];
    const blocked = forms.blocked_forms || [];
    const clauses = forms.applicable_clauses || [];
    const blockedClauses = forms.blocked_clauses || [];
    return `
      <div class="card forms-inquiry-panel">
        <div class="card-top">
          <span class="card-title">Private forms / precedent snippets</span>
          <span class="card-badges"><span class="badge badge-research">TEMPLATE_BASED</span><span class="badge badge-draft">machine candidate</span><span class="badge badge-verified">Structured filters first</span></span>
        </div>
        <div class="forms-grid compact">
          <section>
            <h3>Recommended forms</h3>
            <ul class="forms-list">${recommended.map(f => `<li>${esc(f.title)} · ${esc(f.documentIntent)}${(f.caveats || []).length ? ' · caveated' : ''}</li>`).join('') || '<li>No private form matched the structured filters.</li>'}</ul>
          </section>
          <section>
            <h3>Blocked forms / why not</h3>
            <ul class="forms-list">${blocked.map(f => `<li>${esc(f.title)} · ${(f.reasons || []).map(r => esc(r.reason || r.gateId || 'blocked')).join('; ')}</li>`).join('') || '<li>No hard form block.</li>'}</ul>
          </section>
          <section>
            <h3>Draftable clauses</h3>
            <ul class="forms-list">${clauses.map(c => `<li>${esc(c.heading)} · ${esc(c.clauseType)}</li>`).join('') || '<li>No clause is final-draftable on the current facts.</li>'}</ul>
          </section>
          <section>
            <h3>Missing facts / evidence</h3>
            <ul class="forms-list">${[...(forms.missing_facts || []), ...(forms.required_evidence || [])].map(x => `<li>${esc(x)}</li>`).join('') || '<li>No blockers surfaced.</li>'}</ul>
          </section>
        </div>
        ${blockedClauses.length ? `<details class="piw-audit"><summary>Blocked clauses</summary><ul class="forms-list">${blockedClauses.map(c => `<li>${esc(c.heading)} · ${(c.reasons || []).map(esc).join('; ')}</li>`).join('')}</ul></details>` : ''}
      </div>`;
  }

  function inquiryResultHTML() {
    const r = INQ.result;
    if (!r) return '';
    const analysis = r.inquiry_analysis;
    const warnings = '';
    const cards = (r.matched_doctrine_nodes || []).map(m => {
      const localId = m.source_node_id || m.doctrine_node_id;
      const inGraph = !!S.nodeMap[localId];
      const sops = sopsForNodeId(localId);
      const evidenceGroups = groupEvidenceByCase(m.evidence || []);
      const evidence = evidenceGroups.map(group => renderCaseNoteCard(group, (m.evidence || []).length)).join('');
      return `
        <div class="card ${inGraph ? 'selectable' : ''}" ${inGraph ? `data-sel="node:${esc(localId)}" data-card="node:${esc(localId)}"` : ''}>
          <div class="card-top">
            <span class="card-title">${esc(m.title)}</span>
            <span class="card-badges">${COVERAGE_BADGE[m.coverage_status] || ''}</span>
          </div>
          <div class="card-body">
            <span class="inq-meta">${esc(m.doctrine_node_id)} · ${esc(m.domain_id || '')} · ${esc(TYPE_LABEL[m.node_type] || m.node_type || '')}</span>
            <p>${esc((m.summary || '').slice(0, 280))}</p>
          </div>
          ${evidence ? `<div class="inq-evidence-list"><span class="sn-label">Paragraph evidence trail</span><div class="fruit-list">${evidence}</div></div>` : ''}
          ${sops.map(s => `<div class="sop-note"><span class="sn-label">Firm SOP applies · ${esc(s.title)} ${versionBadge(s.version)}</span>${esc(s.description || '')}</div>`).join('')}
        </div>`;
    }).join('');

    const hasAppliedAnswer = !!(r.pi_workflow || r.applied_answer);
    return `
      ${renderPiWorkflow(r.pi_workflow)}
      ${!r.pi_workflow ? renderAppliedTriage(r.applied_answer) : ''}
      ${analysis ? `<div class="card" style="background:var(--parchment);">
        <div class="card-top"><span class="card-title">Source-bounded analysis${r.ai_provider && r.ai_provider !== 'none' ? ' · via ' + esc(r.ai_provider) : ''}</span>
          ${analysis.abstain ? '<span class="badge badge-audit">No paragraph-linked evidence</span>' : '<span class="badge badge-research">Research prototype</span>'}</div>
        <div class="card-body">
          <p>${esc(analysis.summary || '')}</p>
          ${analysis.legal_position ? `<p><em>Legal position:</em> ${esc(analysis.legal_position)}</p>` : ''}
          ${analysis.application ? `<p><em>Application to facts:</em> ${esc(analysis.application)}</p>` : ''}
        </div>
      </div>` : ''}
      ${analysis ? renderAnalysisCaseReferences(analysis, r.matched_doctrine_nodes) : ''}
      ${renderPrivateFormsInquiry(r.private_form_recommendations)}
      ${warnings ? `<div class="inq-warnings">${warnings}</div>` : ''}
      ${hasAppliedAnswer ? `<details class="piw-audit"><summary>Underlying graph matches</summary>${cards || emptyState('No matches', 'No doctrine nodes matched this inquiry in the maintained graph.')}</details>` : (cards || emptyState('No matches', 'No doctrine nodes matched this inquiry in the maintained graph.'))}
      <p class="inq-note">Research prototype — not legal advice. Paragraph-linked public judgments are quoted and applied from the maintained doctrine graph${INQ.mode === 'api' ? ' and verified evidence index' : ''}. Mode: ${INQ.mode === 'api' ? 'API (all domains, AI-ranked)' : 'local fallback (current domain, lexical only)'}.</p>`;
  }

  function viewInquiry() {
    root().innerHTML = `
      ${viewHeader('AI inquiry', 'Graph-grounded inquiry', 'Describe a fact pattern (e.g. "I was hit by a car and injured"). The system retrieves matching doctrine nodes and paragraph evidence from the maintained graph only — the AI ranks and summarises but cannot cite anything outside it.')}
      <div class="card">
        <textarea id="inquiry-input" class="inq-input" rows="3" placeholder="Describe the facts or legal question…">${esc(INQ.query)}</textarea>
        <div class="inq-actions">
          <button id="inquiry-run" class="inq-button" ${INQ.loading ? 'disabled' : ''}>${INQ.loading ? 'Analysing…' : 'Analyse against graph'}</button>
          <span class="inq-hint">Uses /api/search-evidence (OpenRouter/DeepSeek rank + Supabase evidence) with deterministic fallback.</span>
        </div>
      </div>
      <div id="inquiry-results">${INQ.loading ? '<p class="inq-hint">Retrieving doctrine nodes and evidence…</p>' : inquiryResultHTML()}</div>`;
    const btn = root().querySelector('#inquiry-run');
    if (btn) btn.addEventListener('click', () => {
      const q = root().querySelector('#inquiry-input').value.trim();
      if (q) runInquiry(q);
    });
    wireCards();
  }

  function wireCards() {
    root().querySelectorAll('[data-card]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const [kind, id] = el.dataset.card.split(':');
        select(kind, id);
      });
    });
  }

  // ── Search ──
  function setupSearch() {
    const input = $('#command-bar');
    const results = $('#command-results');
    let items = [];

    function run() {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.hidden = true; return; }
      items = [];
      S.nodes.forEach(n => {
        if (n.type === 'case_seed' && !isVerifiedCaseSeedNode(n)) return;
        const hay = (n.label + ' ' + (n.summary || '') + ' ' + n.id).toLowerCase();
        if (hay.includes(q)) items.push({ kind: 'node', id: n.id, type: TYPE_LABEL[n.type] || n.type, label: n.label, sum: n.summary || '' });
      });
      currentDomainSops().forEach(s => {
        if ((s.title + ' ' + s.description).toLowerCase().includes(q)) items.push({ kind: 'sop', id: s.sop_id, type: 'Firm SOP', label: s.title, sum: s.description });
      });
      currentDomainTemplates().forEach(t => {
        if (t.title.toLowerCase().includes(q)) items.push({ kind: 'template', id: t.template_id, type: 'Template', label: t.title, sum: '' });
      });
      (S.forms.templates || []).forEach(t => {
        const hay = [t.title, t.documentIntent, t.proceduralStage, t.practiceArea, ...(t.recommendedWhen || [])].join(' ').toLowerCase();
        if (hay.includes(q)) items.push({ kind: 'form', id: t.id, type: 'Private form', label: t.title, sum: `${t.documentIntent} · ${t.proceduralStage}` });
      });
      (S.forms.clauses || []).forEach(c => {
        const hay = [c.heading, c.clauseType, c.text, ...(c.issueTags || [])].join(' ').toLowerCase();
        if (hay.includes(q)) items.push({ kind: 'clause', id: c.id, type: 'Clause snippet', label: c.heading, sum: c.clauseType });
      });
      S.flows.forEach(f => {
        if ((f.title + ' ' + (f.description || '')).toLowerCase().includes(q)) items.push({ kind: 'flow', id: f.flow_id, type: 'Flow', label: f.title, sum: f.description || '' });
      });
      S.domains.forEach(d => {
        const summary = S.domainSummaries[d.domain_id] || d;
        if ((summary.title + ' ' + d.domain_id + ' ' + (summary.description || '')).toLowerCase().includes(q)) {
          items.push({ kind: 'domain', id: d.domain_id, type: 'Domain', label: summary.title || d.title, sum: summary.description || d.domain_id });
        }
      });
      items = items.slice(0, 12);
      results.innerHTML = items.length
        ? items.map((it, i) => `<button class="command-result" data-i="${i}">
            <span class="cr-type">${esc(it.type)}</span>
            <span class="cr-label">${esc(it.label)}</span>
            <span class="cr-sum">${esc(it.sum)}</span>
          </button>`).join('')
        : '<div class="command-result"><span class="cr-sum">No matches in the graph, flows, forms, or firm overlay.</span></div>';
      results.hidden = false;
      results.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        const it = items[+b.dataset.i];
        results.hidden = true; input.value = '';
        if (it.kind === 'domain') switchDomain(it.id, 'flows');
        else if (it.kind === 'flow') { S.view = 'flows'; S.selectedFlowId = it.id; renderView(); setActiveNav(); }
        else if (it.kind === 'sop') { S.view = 'playbooks'; renderView(); setActiveNav(); select('sop', it.id); }
        else if (it.kind === 'template') { S.view = 'templates'; renderView(); setActiveNav(); select('template', it.id); }
        else if (it.kind === 'form' || it.kind === 'clause' || it.kind === 'note') { S.view = 'forms'; renderView(); setActiveNav(); select(it.kind, it.id); }
        else select('node', it.id);
      }));
    }

    input.addEventListener('input', run);
    document.addEventListener('click', (e) => { if (!e.target.closest('.command-wrap')) results.hidden = true; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { results.hidden = true; input.blur(); } });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
    });
  }

  // ── Domains ──
  function renderDomainSelect() {
    const select = $('#domain-select');
    if (!select) return;
    select.innerHTML = S.domains.map(d => {
      const summary = S.domainSummaries[d.domain_id] || d;
      return `<option value="${esc(d.domain_id)}">${esc(summary.title || d.title)}</option>`;
    }).join('');
    select.value = S.selectedDomainId || '';
  }

  function setupDomainSelect() {
    const select = $('#domain-select');
    if (!select) return;
    select.addEventListener('change', () => switchDomain(select.value, 'flows'));
  }

  function switchDomain(domainId, nextView) {
    if (!domainId || domainId === S.selectedDomainId && S.nodes.length) {
      if (nextView) { S.view = nextView; setActiveNav(); renderView(); }
      return;
    }
    root().innerHTML = emptyState('Loading domain', 'Fetching the restored graph pack and flow registry.');
    loadDomain(domainId).then(() => {
      S.view = nextView || S.view || 'flows';
      setActiveNav();
      renderView();
      renderInspector();
    }).catch(err => {
      console.error(err);
      fallbackData();
      indexData();
      renderStatus();
      root().innerHTML = emptyState('Could not load domain', err.message || 'The selected graph pack is unreachable.');
    });
  }

  // ── Nav ──
  function setActiveNav() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  }
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
      S.view = b.dataset.view; setActiveNav(); renderView();
      $('#inspector').classList.remove('open');
    }));
    document.addEventListener('click', (e) => {
      if (window.matchMedia('(max-width: 1100px)').matches && !e.target.closest('#inspector') && !e.target.closest('[data-card]')) {
        $('#inspector').classList.remove('open');
      }
    });
  }

  function renderFirmCard() {
    const p = S.firm.firm_profile || {};
    $('#firm-name').textContent = p.name || '—';
    $('#firm-meta').innerHTML =
      `<strong>${esc(S.domainInfo?.title || 'Selected domain')}</strong>` +
      `<br>${currentDomainSops().length} SOPs · ${currentDomainTemplates().length} templates · ${(S.forms.templates || []).length} form snippets` +
      (p.review_policy ? `<br>${esc(p.review_policy)}` : '') +
      (p.overlay_version ? `<br>Overlay v${esc(p.overlay_version)}` : '');
  }

  function renderStatus() {
    $('#status-data').textContent = S.dataSource === 'live' ? `Data: ${S.domainInfo?.title || 'live domain pack'}` : 'Data: demo fallback (pack unreachable)';
    $('#status-counts').textContent = `${S.nodes.length} nodes · ${S.edges.length} edges · ${S.flows.length} flows · ${currentDomainSops().length} SOPs · ${currentDomainTemplates().length} templates · ${(S.forms.templates || []).length} forms · ${(S.forms.clauses || []).length} clauses`;
  }

  // ── Boot ──
  const sopEditorReady = window.SopEditor
    ? window.SopEditor.init('../data/firm_overlay/demo_firm_sop_reviews.json')
    : Promise.resolve([]);
  document.addEventListener('sop-proposals-changed', () => {
    if (S.selectedEntity && S.selectedEntity.kind === 'sop') renderInspector();
  });

  Promise.allSettled([loadRegistry(), loadFirm(), loadViewerEvidenceIndex(), loadStructuredCaseNotes(), loadFormsDemoStore(), sopEditorReady]).then(([registryRes, firmRes]) => {
    if (firmRes.status === 'rejected' || !S.firm) fallbackFirm();
    if (registryRes.status === 'rejected' || !S.domains.length) {
      S.domains = [{ domain_id: DEFAULT_DOMAIN_ID, title: 'Hong Kong Criminal Procedure', path: DEFAULT_DOMAIN_ID + '/domain.json' }];
      S.selectedDomainId = DEFAULT_DOMAIN_ID;
    }
    setupNav();
    setupSearch();
    setupDomainSelect();
    renderDomainSelect();
    return loadDomain(S.selectedDomainId || DEFAULT_DOMAIN_ID);
  }).then(() => {
    if (!S.nodes.length) fallbackData();
    indexData();
    renderFirmCard();
    renderStatus();
    renderView();
  }).catch(err => {
    console.error(err);
    fallbackData();
    fallbackFirm();
    indexData();
    setupNav();
    setupSearch();
    setupDomainSelect();
    renderFirmCard();
    renderStatus();
    renderView();
  });

})();
