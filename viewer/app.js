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
  };

  const $ = (sel) => document.querySelector(sel);

  // ── Badge mapping: raw pipeline labels → professional badges ──
  const BADGE_MAP = {
    not_product_answer_layer: { text: 'Research layer', cls: 'badge-research' },
    needs_hklii_verification: { text: 'Verification pending', cls: 'badge-pending' },
    needs_official_source_verification: { text: 'Source check pending', cls: 'badge-pending' },
    unverified_case_seed: { text: 'Case audit required', cls: 'badge-audit' },
    approved: { text: 'Approved', cls: 'badge-approved' },
    needs_review: { text: 'Needs review', cls: 'badge-review' },
    draft: { text: 'Draft', cls: 'badge-draft' },
    verified: { text: 'Verified', cls: 'badge-verified' },
  };

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
  function renderInlineText(value) {
    return String(value == null ? '' : value)
      .split(/(https?:\/\/[^\s)]+)/g)
      .map(part => /^https?:\/\//.test(part)
        ? `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`
        : esc(part))
      .join('');
  }
  function nodeStatusBadges(n) {
    const out = [];
    if (n.answer_layer_status) out.push(badge(n.answer_layer_status));
    if (n.verification_status) out.push(badge(n.verification_status));
    if (n.authority_status && n.authority_status !== n.verification_status) out.push(badge(n.authority_status));
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
      flags: ['public_source_candidate', 'quote_verified', 'needs_human_review'],
      fallbackCaseName: 'Public bail source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/sedition_public_expression_v1',
      flags: ['public_source_candidate', 'quote_verified', 'needs_human_review', 'tree_gap_candidate'],
      fallbackCaseName: 'Sedition/public-expression source candidate',
      fallbackCitation: '[Public source candidate]',
    },
    {
      base: '../data/legal_ingest/criminal_evidence_tree_v1/tree_gap_pilots/public_order_riot_v1',
      flags: ['public_source_candidate', 'quote_verified', 'needs_human_review', 'tree_gap_candidate'],
      fallbackCaseName: 'Public-order source candidate',
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
        description: info?.description || '',
        sectionCount: (manifest.sections || []).length,
        flowCount: (flowPack.flows || []).length,
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

  // Fallback so the workspace never renders a dead, zero-node demo.
  function fallbackData() {
    S.dataSource = 'fallback';
    S.nodes = [
      { id: 'crim_proc_bail', type: 'section_header', label: 'Bail', section: '04', summary: 'Right to bail, exceptions, conditions, variation.' },
      { id: 'bail_right_to_bail', type: 'legal_issue', label: 'Right to Bail and Statutory Exceptions', section: '04', summary: 'Presumption of bail under Cap 221 s.9D(1); refusal grounds under s.9D(2); NSL Art.42 stricter threshold.', statute_refs: ['cap221_s9d'], verification_status: 'needs_hklii_verification', answer_layer_status: 'not_product_answer_layer' },
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
    return [...ids].map(id => S.nodeMap[id]).filter(x => x && AUTHORITY_TYPES.has(x.type));
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
      coverage_status: payload?.coverage_status || (evidence.length ? 'candidate_only' : 'no_evidence'),
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
    target.innerHTML = '<div class="fruit-loading">Loading source-linked paragraph proof…</div>';
    const cached = S.caseFruitCache[nodeId];
    const request = cached
      ? Promise.resolve(cached)
      : loadJSON(`/api/doctrine-evidence?node_id=${encodeURIComponent(nodeId)}`)
        .then(normalizeEvidencePayload)
        .catch(() => loadLocalCaseFruitArtifacts(nodeId))
        .then(payload => {
          S.caseFruitCache[nodeId] = payload;
          return payload;
        });
    request
      .then(payload => renderCaseFruits(target, nodeId, payload))
      .catch(err => {
        target.innerHTML = `<div class="fruit-empty">No source-linked case fruits loaded for this node yet. <span>${esc(err.message || '')}</span></div>`;
      });
  }

  function loadLocalCaseFruitArtifacts(nodeId) {
    return Promise.all(CASE_FRUIT_ARTIFACTS.map(config => loadLocalCaseFruitArtifact(nodeId, config).catch(() => [])))
      .then(groups => {
        const evidence = groups.flat();
        return normalizeEvidencePayload({
          coverage_status: evidence.length ? 'candidate_only' : 'no_evidence',
          evidence,
          candidate_evidence: evidence,
          warnings: evidence.length ? ['Loaded from local quote-proof artifacts. Human review still required.'] : [],
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
            source_url: l5.source_url || caseRecord.source_url || 'https://legalref.judiciary.hk/',
            link_type: link.link_type || 'candidate',
            authority_role: link.authority_role || 'application',
            significance_label: link.significance_label || '',
            verification_status: link.review_status || 'machine_candidate',
            answer_layer_status: link.answer_layer_status || 'candidate_only',
            human_review_status: 'unreviewed',
            validator_flags: config.flags,
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

  function renderCaseFruits(target, nodeId, payload) {
    const normalized = normalizeEvidencePayload(payload);
    const evidence = normalized.evidence || [];
    if (!evidence.length) {
      target.innerHTML = '<div class="fruit-empty">No source-linked case fruits for this node yet. New case-miner runs can attach quote-proof L4/L5 fruits here after validation.</div>';
      return;
    }
    const sorted = evidence.slice().sort((a, b) => {
      const aSafe = a.answer_layer_status === 'answer_safe' ? 0 : 1;
      const bSafe = b.answer_layer_status === 'answer_safe' ? 0 : 1;
      return aSafe - bSafe || String(a.neutral_citation || '').localeCompare(String(b.neutral_citation || '')) || String(a.para_no || '').localeCompare(String(b.para_no || ''), undefined, { numeric: true });
    });
    target.innerHTML = `
      <div class="fruit-summary">
        <span class="badge badge-source-linked">Source-linked demo</span>
        <span>${sorted.length} quote-proof case fruit${sorted.length === 1 ? '' : 's'} attached to <code>${esc(nodeId)}</code>.</span>
      </div>
      ${(normalized.warnings || []).length ? `<div class="fruit-warning">${normalized.warnings.map(esc).join(' ')}</div>` : ''}
      <div class="fruit-list">
        ${sorted.map(renderCaseFruitCard).join('')}
      </div>
    `;
  }

  function renderCaseFruitCard(e) {
    const quote = e.supporting_quote || e.exact_quote || '';
    const paragraph = e.paragraph_text || quote;
    const statusBadge = e.answer_layer_status === 'answer_safe'
      ? '<span class="badge badge-approved">Answer-safe</span>'
      : e.answer_layer_status === 'paragraph_verified' || e.quote_verified
        ? '<span class="badge badge-source-linked">Quote verified</span>'
        : '<span class="badge badge-review">Human review required</span>';
    const sourceLink = e.source_url
      ? `<a href="${esc(e.source_url)}" target="_blank" rel="noreferrer">Open public judgment (HKLII/LegalRef)</a>`
      : '';
    const citeLabel = [
      e.neutral_citation || '',
      e.law_report_citation || '',
      e.para_no ? `para ${e.para_no}` : '',
    ].filter(Boolean).join(' · ');
    return `
      <article class="fruit-card">
        <div class="fruit-card-top">
          <strong>${esc(e.case_name || 'Untitled case')}</strong>
          <span>${esc(citeLabel)}</span>
        </div>
        <div class="fruit-badges">
          ${statusBadge}
          ${e.authority_role ? `<span class="badge badge-research">${esc(e.authority_role)}</span>` : ''}
          ${e.significance_label ? `<span class="badge badge-draft">${esc(e.significance_label)}</span>` : ''}
        </div>
        ${e.proposition_text ? `<p class="fruit-proposition">${esc(e.proposition_text)}</p>` : ''}
        ${quote ? `<blockquote class="fruit-quote"><span class="fruit-quote-label">Exact quote</span>${esc(quote)}</blockquote>` : ''}
        <details class="fruit-proof" ${paragraph && paragraph !== quote ? 'open' : ''}>
          <summary>Full paragraph text / audit trail</summary>
          <div class="fruit-paragraph">${highlightQuote(paragraph, quote)}</div>
          <div class="fruit-meta">
            <span>${esc(e.paragraph_id || e.proposition_id || '')}</span>
            ${sourceLink}
          </div>
          ${e.lineage_note ? `<div class="fruit-lineage">${esc(e.lineage_note)}</div>` : ''}
        </details>
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
          <div class="insp-quote">${esc(n.summary || '—')}</div>
          <div class="insp-anchor">${esc(n.id)}${n.subsection ? ' · §' + esc(n.subsection) : n.section ? ' · §' + esc(n.section) : ''}</div>
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
      body.innerHTML = `
        <div class="insp-title">${esc(sop.title)}</div>
        <div class="insp-badges">${badge(sop.status)} ${versionBadge(sop.version)}</div>
        <div class="insp-section"><div class="insp-label">Purpose</div><div class="insp-text">${esc(sop.description)}</div></div>
        ${(sop.review_gates || []).length ? `<div class="insp-section"><div class="insp-label">Review gates</div>
          <ul class="insp-list">${sop.review_gates.map(g => `<li><span class="badge badge-review">Human review</span> ${esc(g.label)}</li>`).join('')}</ul></div>` : ''}
        <div class="insp-section"><div class="insp-label">Version history</div>
          <ul class="insp-list">${(sop.changelog || []).map(c => `<li><strong>v${esc(c.version)}</strong> · ${esc(c.date)} · ${esc(c.by)}<br><span style="color:var(--umber)">${esc(c.note)}</span></li>`).join('')}</ul></div>
        <div class="insp-section">
          <button class="ghost-btn" disabled title="Demo: edit proposals route to partner approval">Propose edit</button>
          <button class="ghost-btn" disabled title="Demo: compare versions">Compare versions</button>
        </div>`;
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
    ({ domains: viewDomains, flows: viewFlows, doctrine: viewDoctrine, inquiry: viewInquiry, tasks: viewTasks, playbooks: viewPlaybooks, templates: viewTemplates, audit: viewAudit }[S.view] || viewFlows)();
  }

  function viewHeader(eyebrow, title, lede) {
    return `<div class="view-eyebrow">${eyebrow}</div><div class="view-title">${title}</div><p class="view-lede">${lede}</p>`;
  }

  // — Domains —
  function viewDomains() {
    root().innerHTML = `
      ${viewHeader('Domain registry', 'Legal domains', 'Choose a restored domain pack. Each pack has its own doctrine map, legal flows, source audit queue, and any firm overlay that applies to those flow IDs.')}
      <div class="domain-grid">
        ${S.domains.map(domain => {
          const summary = S.domainSummaries[domain.domain_id] || {};
          const active = domain.domain_id === S.selectedDomainId;
          return `<button class="domain-card ${active ? 'active' : ''}" data-domain-card="${esc(domain.domain_id)}">
            <div class="domain-card-top">
              <span class="domain-card-title">${esc(summary.title || domain.title)}</span>
              ${active ? '<span class="badge badge-approved">Active</span>' : ''}
            </div>
            <p>${esc(summary.description || 'Restored Casemap4 legal domain pack.')}</p>
            <div class="domain-card-meta">
              <span>${summary.sectionCount || 0} sections</span>
              <span>${summary.flowCount || 0} flows</span>
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
  function viewDoctrine() {
    const sections = S.nodes.filter(n => n.type === 'section_header').sort((a, b) => (a.section || '').localeCompare(b.section || ''));
    root().innerHTML = `
      ${viewHeader('Doctrine map', S.domainInfo?.title || 'Doctrine by section', 'The base legal graph: issues, statutes, case seeds, and practice directions grouped by section. Click any item to inspect its extracted principle and source trail.')}
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
          <span class="card-badges">${badge('not_product_answer_layer')}<span class="badge badge-review">Partner review pending</span></span></div>
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

  // — Sources & audit —
  function viewAudit() {
    const counts = {};
    S.nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
    const caseSeeds = S.nodes.filter(n => n.type === 'case_seed');
    root().innerHTML = `
      ${viewHeader('Governance', 'Sources & audit', 'Transparency is the product. Every node carries an explicit verification status; nothing in the research layer is presented as a final answer, and nothing is hidden behind an unlock.')}
      <table class="audit-table">
        <thead><tr><th>Object type</th><th>Count</th><th>Default status</th></tr></thead>
        <tbody>
          ${Object.entries(counts).sort().map(([k, v]) => `<tr>
            <td>${esc(TYPE_LABEL[k] || k)}</td><td class="mono">${v}</td>
            <td>${k === 'case_seed' ? badge('unverified_case_seed') : k === 'statute' ? badge('needs_official_source_verification') : badge('not_product_answer_layer')}</td>
          </tr>`).join('')}
          <tr><td>Edges</td><td class="mono">${S.edges.length}</td><td>${badge('not_product_answer_layer')}</td></tr>
          <tr><td>Firm SOPs</td><td class="mono">${currentDomainSops().length}</td><td>${badge('approved', 'where marked')}</td></tr>
        </tbody>
      </table>
      <div class="view-eyebrow" style="margin-bottom:10px">Case seeds awaiting HKLII audit</div>
      ${caseSeeds.slice(0, 12).map(c => `
        <div class="card selectable" data-sel="node:${esc(c.id)}" data-card="node:${esc(c.id)}">
          <div class="card-top"><span class="card-title">${esc(c.label)}</span><span class="card-badges">${badge('unverified_case_seed')}</span></div>
          <div class="card-body">${esc(c.summary || '')}</div>
        </div>`).join('')}
      ${caseSeeds.length > 12 ? `<p class="view-lede">…and ${caseSeeds.length - 12} more case seeds in the audit queue.</p>` : ''}
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
    answer_safe: '<span class="badge badge-approved">Answer-safe (human reviewed)</span>',
    paragraph_verified: '<span class="badge badge-verified">Paragraph verified</span>',
    source_verified: '<span class="badge badge-verified">Source verified — review pending</span>',
    candidate_only: '<span class="badge badge-review">Candidate only — needs review</span>',
    no_evidence: '<span class="badge badge-pending">No paragraph evidence yet</span>',
  };

  function localInquiryMatches(query, limit = 8) {
    const terms = query.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(w => w.length > 2);
    const scored = [];
    S.nodes.forEach(n => {
      if (n.type === 'section_header') return;
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
              <ul class="piw-list">${(section.items || []).map(item => `<li>${renderInlineText(item)}</li>`).join('')}</ul>
            </section>
          `).join('')}
        </div>
      </section>`;
  }

  function renderLegalResearchAnswer(answer, fallbackApplied) {
    const memo = answer || (fallbackApplied ? {
      title: fallbackApplied.title,
      short_answer: fallbackApplied.short_answer,
      sections: fallbackApplied.sections || [],
      source_status: {
        display: fallbackApplied.source_audit_policy || 'collapsed_by_default',
        answer_layer_status: fallbackApplied.answer_generation_mode || fallbackApplied.mode || 'research_only',
      },
      debug_hidden_by_default: true,
    } : null);
    if (!memo) return '';
    const sections = memo.sections || [];
    const sourceStatus = memo.source_status || {};
    return `
      <section class="research-answer">
        <div class="research-answer-head">
          <div>
            <div class="view-eyebrow">Legal research answer</div>
            <h2>${esc(memo.title || 'Source-Gated Legal Research Answer')}</h2>
          </div>
          <span class="card-badges">
            <span class="badge badge-research">Answer first</span>
            <span class="badge badge-review">Review required</span>
          </span>
        </div>
        ${memo.short_answer ? `<p class="research-short">${renderInlineText(memo.short_answer)}</p>` : ''}
        <div class="research-section-list">
          ${sections.map(section => `
            <section class="research-section">
              <h3>${esc(section.heading)}</h3>
              ${(section.items || []).length
                ? `<ul class="piw-list">${section.items.map(item => `<li>${renderInlineText(item)}</li>`).join('')}</ul>`
                : '<div class="piw-empty">No source-backed item is currently attached.</div>'}
            </section>
          `).join('')}
        </div>
        <details class="piw-audit">
          <summary>Source audit and debug status</summary>
          <ul class="piw-list">
            <li>Audit display: ${esc(sourceStatus.display || 'collapsed')}</li>
            <li>Verification status: ${esc(sourceStatus.verification_status || 'research_only')}</li>
            <li>Claim count: ${esc(sourceStatus.claims_count || 0)}</li>
            <li>Unsupported/problem claims: ${esc(sourceStatus.unsupported_claims_count || 0)}</li>
            <li>Recall-only cases cannot support final legal propositions.</li>
          </ul>
        </details>
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
    const cards = refs.map(ref => {
      const key = `${ref.neutral_citation || ref.case_name || ''}::${ref.para_no || ''}`;
      const merged = { ...(evidenceByKey.get(key) || {}), ...ref };
      return renderCaseFruitCard(merged);
    }).join('');
    return `
      <div class="card">
        <div class="card-top"><span class="card-title">Cited paragraph proof</span></div>
        <div class="card-body fruit-list">${cards}</div>
      </div>`;
  }

  function inquiryResultHTML() {
    const r = INQ.result;
    if (!r) return '';
    const analysis = r.inquiry_analysis;
    const warnings = (r.warnings || []).map(w => `<span class="badge badge-pending">${esc(String(w).replace(/_/g, ' '))}</span>`).join(' ');
    const cards = (r.matched_doctrine_nodes || []).map(m => {
      const localId = m.source_node_id || m.doctrine_node_id;
      const inGraph = !!S.nodeMap[localId];
      const sops = sopsForNodeId(localId);
      const evidence = (m.evidence || []).map(e => renderCaseFruitCard(e)).join('');
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

    const hasAppliedAnswer = !!(r.pi_workflow || r.applied_answer || r.legal_research_answer);
    return `
      ${renderPiWorkflow(r.pi_workflow)}
      ${!r.pi_workflow ? renderLegalResearchAnswer(r.legal_research_answer, r.applied_answer) : ''}
      ${analysis ? `<div class="card" style="background:var(--parchment);">
        <div class="card-top"><span class="card-title">Source-bounded analysis${r.ai_provider && r.ai_provider !== 'none' ? ' · via ' + esc(r.ai_provider) : ''}</span>
          ${analysis.abstain ? '<span class="badge badge-audit">Abstained — insufficient verified evidence</span>' : ''}</div>
        <div class="card-body">
          <p>${esc(analysis.summary || '')}</p>
          ${analysis.legal_position ? `<p><em>Legal position:</em> ${esc(analysis.legal_position)}</p>` : ''}
          ${analysis.application ? `<p><em>Application to facts:</em> ${esc(analysis.application)}</p>` : ''}
        </div>
      </div>` : ''}
      ${analysis ? renderAnalysisCaseReferences(analysis, r.matched_doctrine_nodes) : ''}
      ${warnings ? `<div class="inq-warnings">${warnings}</div>` : ''}
      ${hasAppliedAnswer ? `<details class="piw-audit"><summary>Underlying retrieval / graph matches</summary>${cards || emptyState('No matches', 'No doctrine nodes matched this inquiry in the maintained graph.')}</details>` : (cards || emptyState('No matches', 'No doctrine nodes matched this inquiry in the maintained graph.'))}
      <p class="inq-note">Answer-first source-bounded research trail — not legal advice. The memo renders verified source-card content first; raw doctrine matches remain collapsed for audit. Mode: ${INQ.mode === 'api' ? 'API (all domains, AI-ranked)' : 'local fallback (current domain, lexical only)'}.</p>`;
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
        const hay = (n.label + ' ' + (n.summary || '') + ' ' + n.id).toLowerCase();
        if (hay.includes(q)) items.push({ kind: 'node', id: n.id, type: TYPE_LABEL[n.type] || n.type, label: n.label, sum: n.summary || '' });
      });
      currentDomainSops().forEach(s => {
        if ((s.title + ' ' + s.description).toLowerCase().includes(q)) items.push({ kind: 'sop', id: s.sop_id, type: 'Firm SOP', label: s.title, sum: s.description });
      });
      currentDomainTemplates().forEach(t => {
        if (t.title.toLowerCase().includes(q)) items.push({ kind: 'template', id: t.template_id, type: 'Template', label: t.title, sum: '' });
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
        : '<div class="command-result"><span class="cr-sum">No matches in the graph, flows, or firm overlay.</span></div>';
      results.hidden = false;
      results.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        const it = items[+b.dataset.i];
        results.hidden = true; input.value = '';
        if (it.kind === 'domain') switchDomain(it.id, 'flows');
        else if (it.kind === 'flow') { S.view = 'flows'; S.selectedFlowId = it.id; renderView(); setActiveNav(); }
        else if (it.kind === 'sop') { S.view = 'playbooks'; renderView(); setActiveNav(); select('sop', it.id); }
        else if (it.kind === 'template') { S.view = 'templates'; renderView(); setActiveNav(); select('template', it.id); }
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
      `<br>${currentDomainSops().length} SOPs · ${currentDomainTemplates().length} templates in this domain` +
      (p.review_policy ? `<br>${esc(p.review_policy)}` : '') +
      (p.overlay_version ? `<br>Overlay v${esc(p.overlay_version)}` : '');
  }

  function renderStatus() {
    $('#status-data').textContent = S.dataSource === 'live' ? `Data: ${S.domainInfo?.title || 'live domain pack'}` : 'Data: demo fallback (pack unreachable)';
    $('#status-counts').textContent = `${S.nodes.length} nodes · ${S.edges.length} edges · ${S.flows.length} flows · ${currentDomainSops().length} SOPs · ${currentDomainTemplates().length} templates`;
  }

  // ── Boot ──
  Promise.allSettled([loadRegistry(), loadFirm()]).then(([registryRes, firmRes]) => {
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
