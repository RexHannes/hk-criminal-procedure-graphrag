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
    firm: null,
    view: 'flows',
    selectedFlowId: null,
    selectedEntity: null,   // {kind, id}
    lastTrace: null,        // execution trace of last task run
    dataSource: 'live',
    openSections: new Set(),
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
  };

  function badge(key, extra) {
    const b = BADGE_MAP[key];
    if (!b) return '';
    return `<span class="badge ${b.cls}">${b.text}${extra ? ' · ' + esc(extra) : ''}</span>`;
  }
  function versionBadge(v) { return v ? `<span class="badge badge-version">v${esc(String(v))}</span>` : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  function loadAll() {
    const base = window.DATA_BASE;
    return loadJSON(base + 'consolidated.json').then(manifest => {
      const sectionP = manifest.sections.map(s =>
        Promise.all([
          loadJSON(base + s.node_file).then(d => d.nodes || []),
          loadJSON(base + s.edge_file).then(d => d.edges || []),
        ]).then(([nodes, edges]) => { S.nodes.push(...nodes); S.edges.push(...edges); })
      );
      const flowP = loadJSON(base + (manifest.flows_file || 'flows.json')).then(d => { S.flows = d.flows || []; });
      return Promise.all([...sectionP, flowP]);
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
    S.nodes.forEach(n => { S.nodeMap[n.id] = n; });
    S.edges.forEach(e => {
      (S.edgesFrom[e.from] = S.edgesFrom[e.from] || []).push(e);
      (S.edgesTo[e.to] = S.edgesTo[e.to] || []).push(e);
    });
  }

  // ── Graph helpers ──
  function authoritiesForNode(n) {
    // statute_refs + outgoing/incoming statutory_anchor & case_seed edges
    const ids = new Set(n.statute_refs || []);
    (S.edgesFrom[n.id] || []).forEach(e => {
      if (e.relationship === 'statutory_anchor' || e.relationship === 'case_seed') ids.add(e.to);
    });
    (S.edgesTo[n.id] || []).forEach(e => {
      if (e.relationship === 'statutory_anchor' || e.relationship === 'case_seed') ids.add(e.from);
    });
    return [...ids].map(id => S.nodeMap[id]).filter(x => x && (x.type === 'statute' || x.type === 'case_seed' || x.type === 'practice_direction' || x.type === 'restricted_nsl'));
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
      const relatedFlows = S.flows.filter(f => f.steps.includes(n.id));

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
          <div class="insp-label">Audit</div>
          <div class="insp-text">Every use of this item in a task run is recorded in the execution trace with flow, SOP and template versions.</div>
        </div>`;
      wireInspectorLinks(body);
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
    ({ flows: viewFlows, doctrine: viewDoctrine, tasks: viewTasks, playbooks: viewPlaybooks, templates: viewTemplates, audit: viewAudit }[S.view] || viewFlows)();
  }

  function viewHeader(eyebrow, title, lede) {
    return `<div class="view-eyebrow">${eyebrow}</div><div class="view-title">${title}</div><p class="view-lede">${lede}</p>`;
  }

  // — Legal Flows —
  function viewFlows() {
    if (!S.flows.length) { root().innerHTML = emptyState('No flows loaded', 'The flow registry could not be read. The workspace is running on fallback demo data.'); return; }
    if (!S.selectedFlowId) S.selectedFlowId = S.flows[0].flow_id;
    const flow = S.flows.find(f => f.flow_id === S.selectedFlowId) || S.flows[0];
    const linkedSops = sopsForFlow(flow.flow_id);

    root().innerHTML = `
      ${viewHeader('Legal flows', 'Procedural flows', 'Fixed, reusable procedural flows extracted from the doctrine graph. Each step shows its linked authority, verification status, and any firm SOP instruction layered on top.')}
      <div class="chip-row">${S.flows.map(f => `<button class="chip ${f.flow_id === flow.flow_id ? 'active' : ''}" data-flow="${f.flow_id}">${esc(f.title)}</button>`).join('')}</div>
      <div class="card" style="background:var(--parchment);border-style:dashed;">
        <div class="card-top"><span class="card-title">${esc(flow.title)}</span>${versionBadge('1.0')}
          ${linkedSops.map(s => `<span class="badge badge-research">Firm overlay: ${esc(s.title)} v${esc(s.version)}</span>`).join('')}
        </div>
        <div class="card-body">${esc(flow.description || '')}</div>
      </div>
      ${flow.steps.map((sid, i) => renderStepCard(sid, i + 1)).join('')}
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
          <span class="card-title">${esc(n.label.replace(/^.*?Flow:\s*/, ''))}</span>
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
      ${viewHeader('Doctrine map', 'Doctrine by section', 'The base legal graph: issues, statutes, case seeds, and practice directions grouped by procedural section. Click any item to inspect its extracted principle and source trail.')}
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
    const tasks = S.firm.demo_tasks || [];
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
      }).join('') : emptyState('No firm tasks configured', 'Connect the firm overlay to define matter tasks bound to approved flows and SOPs.')}
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
    (flow ? flow.steps : []).forEach(sid => {
      const n = S.nodeMap[sid]; if (!n) return;
      usedIds.add(sid);
      const auths = authoritiesForStep(sid);
      auths.forEach(a => usedIds.add(a.id));
      rail.push({
        kind: 'Flow step', label: n.label.replace(/^.*?Flow:\s*/, ''),
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
    const sops = S.firm.sops || [];
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
        </div>`).join('') : emptyState('No firm SOPs yet', 'Add your first playbook: start from a public legal flow, then layer your firm’s checklist, preferred authorities, templates and review gates on top.')}
    `;
    wireCards();
  }

  // — Templates —
  function viewTemplates() {
    const tpls = S.firm.templates || [];
    root().innerHTML = `
      ${viewHeader('Firm overlay', 'Templates', 'Firm-approved drafting blocks. AI drafts pull clauses from here instead of inventing structure, so every output already speaks in the firm’s voice.')}
      ${tpls.length ? tpls.map(t => `
        <div class="card selectable" data-sel="template:${esc(t.template_id)}" data-card="template:${esc(t.template_id)}">
          <div class="card-top"><span class="card-title">${esc(t.title)}</span>
            <span class="card-badges">${badge(t.status)} ${versionBadge(t.version)}</span></div>
          <div class="card-body" style="color:var(--faded)">updated ${esc(t.last_updated)} · ${t.clauses.length} clauses</div>
          <div class="card-links">${t.clauses.map(c => `<span class="link-pill"><span class="lp-kind">clause</span>${esc(c.title)}</span>`).join('')}</div>
        </div>`).join('') : emptyState('No templates yet', 'Upload or draft firm templates so AI tasks can pull approved clauses directly.')}
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
          <tr><td>Firm SOPs</td><td class="mono">${(S.firm.sops || []).length}</td><td>${badge('approved', 'where marked')}</td></tr>
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
      (S.firm.sops || []).forEach(s => {
        if ((s.title + ' ' + s.description).toLowerCase().includes(q)) items.push({ kind: 'sop', id: s.sop_id, type: 'Firm SOP', label: s.title, sum: s.description });
      });
      (S.firm.templates || []).forEach(t => {
        if (t.title.toLowerCase().includes(q)) items.push({ kind: 'template', id: t.template_id, type: 'Template', label: t.title, sum: '' });
      });
      S.flows.forEach(f => {
        if ((f.title + ' ' + (f.description || '')).toLowerCase().includes(q)) items.push({ kind: 'flow', id: f.flow_id, type: 'Flow', label: f.title, sum: f.description || '' });
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
        if (it.kind === 'flow') { S.view = 'flows'; S.selectedFlowId = it.id; renderView(); setActiveNav(); }
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
    $('#firm-meta').innerHTML = esc((p.practice_areas || []).join(' · ')) + (p.review_policy ? `<br>${esc(p.review_policy)}` : '') + (p.overlay_version ? `<br>Overlay v${esc(p.overlay_version)}` : '');
  }

  function renderStatus() {
    $('#status-data').textContent = S.dataSource === 'live' ? 'Data: live domain pack' : 'Data: demo fallback (pack unreachable)';
    $('#status-counts').textContent = `${S.nodes.length} nodes · ${S.edges.length} edges · ${S.flows.length} flows · ${(S.firm.sops || []).length} SOPs · ${(S.firm.templates || []).length} templates`;
  }

  // ── Boot ──
  Promise.allSettled([loadAll(), loadFirm()]).then(([dataRes, firmRes]) => {
    if (dataRes.status === 'rejected' || !S.nodes.length) fallbackData();
    if (firmRes.status === 'rejected' || !S.firm) fallbackFirm();
    indexData();
    renderFirmCard();
    renderStatus();
    setupNav();
    setupSearch();
    renderView();
  });

})();
