(() => {
  'use strict';

  const DATA_BASE = window.DATA_BASE || '../data/legal_domain_packs/demo_maps/criminal_procedure_hk/';
  const FIRM_OVERLAY_PATH = window.FIRM_OVERLAY_PATH || '../data/firm_overlay/demo_firm.json';

  const state = {
    manifest: null,
    nodes: [],
    edges: [],
    flows: [],
    overlay: null,
    nodeById: new Map(),
    view: 'flows',
    selectedFlowId: 'crim_proc_bail_flow',
    selectedNodeId: null,
    selectedKind: '',
    trace: new Set(),
    query: ''
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const cls = (status = '') => status.includes('approved') || status === 'verified' ? 'ok' : status.includes('unverified') || status.includes('audit') ? 'danger' : status.includes('need') || status.includes('pending') || status === 'draft' ? 'pending' : 'neutral';
  const labelStatus = (status = '') => ({
    approved: 'Approved',
    draft: 'Draft',
    needs_review: 'Needs review',
    needs_hklii_verification: 'Verification pending',
    needs_official_source_verification: 'Source check pending',
    unverified_case_seed: 'Case audit required',
    not_product_answer_layer: 'Research layer'
  }[status] || String(status).replace(/_/g, ' '));
  const badge = (text, status = 'neutral') => `<span class="badge ${cls(status)}">${esc(text)}</span>`;

  function loadJSON(path) {
    return fetch(path).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return res.json();
    });
  }

  async function loadData() {
    const manifest = await loadJSON(`${DATA_BASE}consolidated.json`);
    const nodeFiles = await Promise.all(manifest.sections.map((s) => loadJSON(`${DATA_BASE}${s.node_file}`).catch(() => ({ nodes: [] }))));
    const edgeFiles = await Promise.all(manifest.sections.map((s) => loadJSON(`${DATA_BASE}${s.edge_file}`).catch(() => ({ edges: [] }))));
    const flowPack = await loadJSON(`${DATA_BASE}${manifest.flows_file}`);
    const overlay = await loadJSON(FIRM_OVERLAY_PATH).catch(() => demoOverlay());

    state.manifest = manifest;
    state.nodes = nodeFiles.flatMap((f) => f.nodes || []);
    state.edges = edgeFiles.flatMap((f) => f.edges || []);
    state.flows = flowPack.flows || manifest.flow_chains || [];
    state.overlay = overlay;
    state.nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    if (!state.flows.some((f) => f.flow_id === state.selectedFlowId) && state.flows[0]) state.selectedFlowId = state.flows[0].flow_id;
    state.selectedNodeId = currentFlow()?.steps?.[0] || null;
  }

  function demoOverlay() {
    return {
      firm_profile: { name: 'Demo Litigation Firm', practice_areas: ['Criminal Procedure'], review_policy: 'Partner review required before external advice is issued.', overlay_version: '0.4.0' },
      sops: [],
      templates: [],
      demo_tasks: []
    };
  }

  function currentFlow() {
    return state.flows.find((f) => f.flow_id === state.selectedFlowId) || state.flows[0];
  }

  function getNode(id) {
    return state.nodeById.get(id) || null;
  }

  function flowSops(flowId = state.selectedFlowId) {
    return (state.overlay?.sops || []).filter((s) => (s.linked_flows || []).includes(flowId));
  }

  function sopForStep(stepId, flowId = state.selectedFlowId) {
    const sops = flowSops(flowId);
    for (const sop of sops) {
      const block = (sop.blocks || []).find((b) => (b.applies_to_steps || []).includes(stepId));
      if (block) return { sop, block };
    }
    return sops[0] ? { sop: sops[0], block: (sops[0].blocks || [])[0] } : null;
  }

  function templatesForSop(sop) {
    const ids = new Set(sop?.linked_templates || []);
    return (state.overlay?.templates || []).filter((tpl) => ids.has(tpl.template_id));
  }

  const MANUAL_AUTH = {
    bail_flow_start: ['bail_right_to_bail', 'bail_factors', 'cap221_s9d', 'nsl_art42'],
    bail_flow_step2: ['bail_police_icac', 'bail_right_to_bail', 'cap232_s52', 'cap204_s10a', 'dpp_v_richards', 'gizzonio_v_chief_constable'],
    bail_flow_step3: ['bail_right_to_bail', 'cap221_s9d', 'nsl_art42'],
    bail_flow_step4: ['bail_right_to_bail', 'bail_factors', 'cap221_s9d', 'nsl_art42'],
    bail_flow_step5: ['bail_factors', 'cap221_s9d'],
    bail_flow_step6: ['bail_variation_revocation', 'cap221_s9n'],
    bail_flow_step7: ['bail_variation_revocation', 'bail_pending_appeal', 'cap221_s9k', 'cap484_s35']
  };

  function linkedAuthorities(step) {
    if (!step) return [];
    const ids = new Set(MANUAL_AUTH[step.id] || []);
    const words = `${step.label || ''} ${step.summary || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
    for (const node of state.nodes) {
      if (!['legal_issue', 'statute', 'case_seed', 'practice_direction', 'restricted_nsl'].includes(node.type)) continue;
      if (node.section !== step.section) continue;
      const haystack = `${node.label || ''} ${node.summary || ''} ${node.id}`.toLowerCase();
      if (words.some((w) => haystack.includes(w))) ids.add(node.id);
    }
    const expanded = [];
    for (const id of ids) {
      const n = getNode(id);
      if (n) expanded.push(n);
    }
    for (const issue of expanded.filter((n) => n.type === 'legal_issue')) {
      (issue.statute_refs || []).forEach((id) => { const n = getNode(id); if (n && !expanded.some((x) => x.id === n.id)) expanded.push(n); });
      (issue.case_seeds || []).forEach((id) => { const n = getNode(id); if (n && !expanded.some((x) => x.id === n.id)) expanded.push(n); });
    }
    return expanded.slice(0, 8);
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    render();
  }

  function selectNode(id, kind = 'flow_step') {
    state.selectedNodeId = id;
    state.selectedKind = kind;
    renderInspector();
    renderStatus();
    document.querySelectorAll('[data-node-id]').forEach((el) => el.classList.toggle('selected', el.dataset.nodeId === id));
  }

  function renderShell() {
    const firm = state.overlay?.firm_profile || {};
    $('firm-name').textContent = firm.name || 'Demo Litigation Firm';
    $('firm-meta').innerHTML = `${esc((firm.practice_areas || []).join(' · '))}<br>${esc(firm.review_policy || '')}<br>Overlay v${esc(firm.overlay_version || '0.1')}`;
    document.querySelectorAll('.nav-item').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $('command-bar').addEventListener('input', (e) => {
      state.query = e.target.value.trim();
      renderCommandResults();
    });
    $('command-bar').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.query = e.target.value.trim();
        setView('audit');
      }
    });
  }

  function render() {
    const map = { flows: renderFlows, doctrine: renderDoctrine, tasks: renderTasks, playbooks: renderPlaybooks, templates: renderTemplates, audit: renderAudit };
    (map[state.view] || renderFlows)();
    renderStatus();
  }

  function renderFlowTabs() {
    return `<div class="flow-tabs">${state.flows.map((flow) => `<button class="flow-pill ${flow.flow_id === state.selectedFlowId ? 'active' : ''}" data-flow-id="${esc(flow.flow_id)}">${esc(flow.title)}</button>`).join('')}</div>`;
  }

  function renderFlows() {
    const flow = currentFlow();
    const sops = flowSops(flow.flow_id);
    const sop = sops[0];
    $('view-root').innerHTML = `
      <section class="view-heading">
        <div class="kicker">Legal flows</div>
        <h2>Procedural flows</h2>
        <p>Fixed, reusable procedural flows extracted from the doctrine graph. Each step shows its linked authority, verification status, and any firm SOP instruction layered on top.</p>
      </section>
      ${renderFlowTabs()}
      <section class="flow-summary-card">
        <div><strong>${esc(flow.title)}</strong><p>${esc(flow.description || 'Reusable legal workflow from the doctrine graph.')}</p></div>
        <div class="summary-badges">${badge('v1.0', 'neutral')}${sop ? badge(`Firm overlay: ${sop.title} v${sop.version}`, sop.status) : ''}</div>
      </section>
      <div class="step-list">${(flow.steps || []).map((id, idx) => renderStepCard(getNode(id), idx, flow)).join('')}</div>`;
    wireFlowTabs();
    document.querySelectorAll('.step-card').forEach((card) => card.addEventListener('click', () => selectNode(card.dataset.nodeId, 'flow_step')));
  }

  function renderStepCard(step, index, flow) {
    if (!step) return '';
    const auth = linkedAuthorities(step);
    const sopHit = sopForStep(step.id, flow.flow_id);
    const selected = step.id === state.selectedNodeId ? ' selected' : '';
    return `<article class="step-card${selected}" data-node-id="${esc(step.id)}">
      <div class="step-top"><span class="step-num">${index + 1}</span><h3>${esc(step.label || step.id).replace(/^Bail Flow: /, '')}</h3>${badge(labelStatus(step.verification_status), step.verification_status)}</div>
      <p>${esc(step.summary || '')}</p>
      <div class="authority-chips">${auth.length ? auth.slice(0, 6).map((n) => `<span class="chip ${esc(n.type)}"><em>${esc((n.type || '').replace(/_/g, ' '))}</em>${esc(n.label || n.id)}</span>`).join('') : '<span class="chip muted">No direct authority yet</span>'}</div>
      ${sopHit ? `<div class="sop-callout"><div class="sop-callout-title">Firm SOP · ${esc(sopHit.sop.title)} <span>v${esc(sopHit.block?.version || sopHit.sop.version)}</span></div><p>${esc(sopHit.block?.instruction || sopHit.sop.description)}</p></div>` : ''}
    </article>`;
  }

  function wireFlowTabs() {
    document.querySelectorAll('[data-flow-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedFlowId = btn.dataset.flowId;
        state.selectedNodeId = currentFlow()?.steps?.[0] || null;
        renderFlows();
        renderInspector();
      });
    });
  }

  function renderDoctrine() {
    const sections = state.manifest.sections || [];
    $('view-root').innerHTML = `
      <section class="view-heading"><div class="kicker">Doctrine map</div><h2>Seed doctrine graph</h2><p>The public legal graph remains visible as a source-backed map. It is not a final legal answer layer.</p></section>
      <div class="doctrine-grid">${sections.map((section) => {
        const nodes = state.nodes.filter((n) => n.section === section.id && n.type !== 'section_header').slice(0, 8);
        return `<section class="doctrine-section"><h3>${esc(section.id)} · ${esc(section.title)}</h3>${nodes.map((n) => `<button class="doctrine-node" data-node-id="${esc(n.id)}"><span>${esc((n.type || '').replace(/_/g, ' '))}</span>${esc(n.label || n.id)}</button>`).join('')}</section>`;
      }).join('')}</div>`;
    document.querySelectorAll('.doctrine-node').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.nodeId, 'doctrine')));
  }

  function renderTasks() {
    const tasks = state.overlay?.demo_tasks || [];
    const task = tasks.find((t) => t.flow_id === state.selectedFlowId) || tasks[0];
    const flow = state.flows.find((f) => f.flow_id === task?.flow_id) || currentFlow();
    const sop = (state.overlay?.sops || []).find((s) => s.sop_id === task?.sop_id) || flowSops(flow.flow_id)[0];
    const template = (state.overlay?.templates || []).find((t) => t.template_id === task?.template_id);
    state.trace = new Set([...(flow.steps || []), sop?.sop_id, template?.template_id].filter(Boolean));
    $('view-root').innerHTML = `
      <section class="trace-view">
        <div class="trace-title-row"><div><h2>Execution trace — ${esc(task?.title || 'Draft preliminary advice')}</h2><p>flow: ${esc(flow.title)} v1.0 · sop: ${esc(sop?.title || '—')} v${esc(sop?.version || '—')} · template: ${esc(template?.title || '—')} v${esc(template?.version || '—')} · run: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p></div>${badge('Research layer', 'not_product_answer_layer')}${badge('Partner review pending', 'needs_review')}</div>
        <div class="provenance-rail">${(flow.steps || []).map((id, idx) => renderTraceStep(getNode(id), idx, sop)).join('')}</div>
      </section>`;
    document.querySelectorAll('.trace-item[data-node-id]').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.nodeId, 'flow_step')));
  }

  function renderTraceStep(step, idx, sop) {
    if (!step) return '';
    const auth = linkedAuthorities(step).filter((n) => ['statute', 'case_seed', 'legal_issue'].includes(n.type)).slice(0, 3);
    const hit = sopForStep(step.id, state.selectedFlowId) || { sop, block: null };
    return `<div class="trace-pair"><button class="trace-item" data-node-id="${esc(step.id)}"><span>Flow step</span><strong>${esc(step.label || step.id).replace(/^Bail Flow: /, '')}</strong><em>Authority: ${esc(auth.map((n) => n.label).join('; ') || 'Pending authority linkage')}</em></button>${hit?.block ? `<div class="trace-item sop"><span>Firm SOP</span><strong>${esc(hit.block.title)} (${esc(hit.sop.title)} v${esc(hit.block.version || hit.sop.version)})</strong><em>${esc(hit.block.instruction)}</em></div>` : ''}</div>`;
  }

  function renderPlaybooks() {
    $('view-root').innerHTML = `<section class="view-heading"><div class="kicker">Firm overlay</div><h2>Firm playbooks</h2><p>Versioned SOPs layered on top of the public legal graph. These are firm-specific and human-reviewed.</p></section><div class="card-grid">${(state.overlay?.sops || []).map((sop) => `<article class="plain-card"><div class="card-head"><h3>${esc(sop.title)}</h3>${badge(labelStatus(sop.status), sop.status)}</div><p>${esc(sop.description)}</p><div class="mono">v${esc(sop.version)} · ${esc(sop.practice_area)} · ${esc(sop.last_updated)}</div>${(sop.blocks || []).slice(0, 3).map((b) => `<button class="block-row" data-sop-id="${esc(sop.sop_id)}" data-block-id="${esc(b.block_id)}"><strong>${esc(b.title)}</strong><span>${esc(b.instruction)}</span></button>`).join('')}</article>`).join('')}</div>`;
    document.querySelectorAll('.block-row').forEach((el) => el.addEventListener('click', () => showSopBlock(el.dataset.sopId, el.dataset.blockId)));
  }

  function renderTemplates() {
    $('view-root').innerHTML = `<section class="view-heading"><div class="kicker">Templates</div><h2>Drafting templates</h2><p>Approved clauses can be pulled into AI task runs, but remain versioned and reviewable.</p></section><div class="card-grid">${(state.overlay?.templates || []).map((tpl) => `<article class="plain-card"><div class="card-head"><h3>${esc(tpl.title)}</h3>${badge(labelStatus(tpl.status), tpl.status)}</div><p class="mono">v${esc(tpl.version)} · ${esc(tpl.last_updated)}</p>${(tpl.clauses || []).map((c) => `<button class="block-row" data-template-id="${esc(tpl.template_id)}" data-clause-id="${esc(c.clause_id)}"><strong>${esc(c.title)}</strong><span>${esc(c.text)}</span></button>`).join('')}</article>`).join('')}</div>`;
    document.querySelectorAll('.block-row[data-template-id]').forEach((el) => el.addEventListener('click', () => showTemplateClause(el.dataset.templateId, el.dataset.clauseId)));
  }

  function renderAudit() {
    const q = state.query.toLowerCase();
    const pool = state.nodes.filter((n) => !q || `${n.id} ${n.label} ${n.summary}`.toLowerCase().includes(q)).slice(0, 30);
    $('view-root').innerHTML = `<section class="view-heading"><div class="kicker">Sources & audit</div><h2>Evidence trail search</h2><p>Search results are source boxes and doctrine seeds, not final legal advice. Click any result to inspect verification status.</p></section><div class="audit-list">${pool.map((n) => `<button class="audit-row" data-node-id="${esc(n.id)}"><div><strong>${esc(n.label || n.id)}</strong><span>${esc(n.summary || '').slice(0, 220)}</span></div>${badge(labelStatus(n.verification_status || n.authority_status || 'not_product_answer_layer'), n.verification_status || n.authority_status || 'not_product_answer_layer')}</button>`).join('')}</div>`;
    document.querySelectorAll('.audit-row').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.nodeId, 'authority')));
  }

  function renderCommandResults() {
    const box = $('command-results');
    const q = state.query.toLowerCase();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    const results = [
      ...state.flows.map((f) => ({ kind: 'flow', id: f.flow_id, title: f.title, text: f.description || '' })),
      ...state.nodes.map((n) => ({ kind: n.type || 'node', id: n.id, title: n.label || n.id, text: n.summary || '' })),
      ...(state.overlay?.sops || []).map((s) => ({ kind: 'SOP', id: s.sop_id, title: s.title, text: s.description || '' })),
      ...(state.overlay?.templates || []).map((t) => ({ kind: 'template', id: t.template_id, title: t.title, text: (t.clauses || []).map((c) => c.text).join(' ') }))
    ].filter((r) => `${r.kind} ${r.title} ${r.text}`.toLowerCase().includes(q)).slice(0, 8);
    box.hidden = false;
    box.innerHTML = results.length ? results.map((r) => `<button class="command-result" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}"><span>${esc(r.kind)}</span><strong>${esc(r.title)}</strong></button>`).join('') : '<div class="command-empty">No direct match. Try “bail”, “Cap 221”, “NSL”, or “template”.</div>';
    box.querySelectorAll('.command-result').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.kind === 'flow') { state.selectedFlowId = btn.dataset.id; setView('flows'); }
      else if (state.nodeById.has(btn.dataset.id)) { selectNode(btn.dataset.id, 'authority'); setView('audit'); }
      else { setView(btn.dataset.kind === 'template' ? 'templates' : 'playbooks'); }
      box.hidden = true;
    }));
  }

  function renderInspector() {
    const node = getNode(state.selectedNodeId);
    if (!node) {
      $('inspector-kind').textContent = '';
      $('inspector-body').innerHTML = '<p class="hint">Select a flow step, authority, SOP block, or template clause to inspect its source trail.</p>';
      return;
    }
    const auth = linkedAuthorities(node);
    const hit = sopForStep(node.id);
    const used = state.trace.has(node.id);
    $('inspector-kind').textContent = state.selectedKind || (node.type || 'node').replace(/_/g, ' ');
    $('inspector-body').innerHTML = `
      <h2>${esc(node.label || node.id)}</h2>
      ${badge(labelStatus(node.verification_status || 'needs_hklii_verification'), node.verification_status || 'needs_hklii_verification')}
      ${used ? '<p class="used-line">✓ Used in current task trace</p>' : ''}
      <div class="inspect-section"><div class="inspect-label">Extracted principle / summary</div><div class="quote-box">${esc(node.summary || 'No summary available.')}</div><p class="mono">${esc(node.id)} · ${esc(node.subsection || node.type || '')}</p></div>
      <div class="inspect-section"><div class="inspect-label">Linked authority</div>${auth.length ? auth.slice(0, 6).map((a) => `<div class="authority-line"><strong>${esc(a.label || a.id)}</strong>${badge(labelStatus(a.verification_status || a.authority_status || 'needs_hklii_verification'), a.verification_status || a.authority_status || 'needs_hklii_verification')}</div>`).join('') : '<p class="hint">No authority boxes linked yet.</p>'}</div>
      <div class="inspect-section"><div class="inspect-label">Appears in flows</div><p>${esc(state.flows.filter((f) => (f.steps || []).includes(node.id)).map((f) => f.title).join(', ') || 'No flow membership recorded.')}</p></div>
      ${hit ? `<div class="inspect-section"><div class="inspect-label">Firm SOP at this step</div><div class="sop-mini"><strong>${esc(hit.sop.title)} <span>v${esc(hit.block?.version || hit.sop.version)}</span></strong><p>${esc(hit.block?.instruction || hit.sop.description)}</p></div></div>` : ''}
      <div class="inspect-section"><div class="inspect-label">Audit</div><p>Every use of this item in a task run is recorded in the execution trace with flow, SOP and template versions.</p></div>`;
  }

  function showSopBlock(sopId, blockId) {
    const sop = (state.overlay?.sops || []).find((s) => s.sop_id === sopId);
    const block = (sop?.blocks || []).find((b) => b.block_id === blockId);
    $('inspector-kind').textContent = 'SOP block';
    $('inspector-body').innerHTML = `<h2>${esc(block?.title || sop?.title || 'SOP')}</h2>${badge(labelStatus(sop?.status || 'draft'), sop?.status || 'draft')}<div class="inspect-section"><div class="inspect-label">Instruction</div><div class="quote-box">${esc(block?.instruction || sop?.description || '')}</div><p class="mono">${esc(sop?.title)} · v${esc(block?.version || sop?.version)}</p></div><div class="inspect-section"><div class="inspect-label">Applies to steps</div><p>${esc((block?.applies_to_steps || []).join(', ') || 'General playbook block')}</p></div>`;
  }

  function showTemplateClause(templateId, clauseId) {
    const tpl = (state.overlay?.templates || []).find((t) => t.template_id === templateId);
    const clause = (tpl?.clauses || []).find((c) => c.clause_id === clauseId);
    $('inspector-kind').textContent = 'template clause';
    $('inspector-body').innerHTML = `<h2>${esc(clause?.title || tpl?.title || 'Template')}</h2>${badge(labelStatus(tpl?.status || 'draft'), tpl?.status || 'draft')}<div class="inspect-section"><div class="inspect-label">Clause text</div><div class="quote-box">${esc(clause?.text || '')}</div><p class="mono">${esc(tpl?.title)} · v${esc(tpl?.version)}</p></div>`;
  }

  function renderStatus() {
    $('status-data').textContent = 'Data: live domain pack';
    $('status-counts').textContent = `${state.nodes.length} nodes · ${state.edges.length} edges · ${state.flows.length} flows · ${(state.overlay?.sops || []).length} SOPs · ${(state.overlay?.templates || []).length} templates`;
    $('status-selected').textContent = state.selectedNodeId ? `Selected: ${state.selectedNodeId}` : 'Nothing selected';
  }

  async function init() {
    try {
      await loadData();
      renderShell();
      render();
      renderInspector();
    } catch (err) {
      $('view-root').innerHTML = `<section class="error-box"><h2>Failed to load viewer</h2><p>${esc(err.message)}</p></section>`;
      console.error(err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
