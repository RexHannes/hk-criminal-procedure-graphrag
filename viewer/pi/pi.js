(function () {
  'use strict';

  const PATHS = {
    nodes: '../../data/pi_ontology/pi_nodes.json',
    edges: '../../data/pi_ontology/pi_edges.json',
    flows: '../../data/pi_ontology/pi_flows.json',
    forms: '../../data/pi_ontology/pi_form_registry.json',
    cards: '../../data/pi_ontology/pi_demo_source_cards.json',
    firm: '../../data/firm_overlay/pi_demo_firm_overlay.json',
  };

  const S = {
    nodes: {},
    legalNodes: [],
    proceduralNodes: [],
    flows: [],
    forms: [],
    cards: {},
    firm: null,
    facts: '',
    expanded: new Set(),
    selectedId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadJSON(path) {
    return fetch(path).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
      return r.json();
    });
  }

  function norm(s) {
    return String(s || '').toLowerCase();
  }

  function includesAny(text, terms) {
    const hay = norm(text);
    return terms.some(t => hay.includes(t));
  }

  function classifyFacts(facts) {
    const relevant = new Set(['pi_negligence_overview', 'pi_duty_of_care', 'pi_breach', 'pi_causation', 'pi_limitation', 'pi_general_damages', 'pi_evidence_checklist']);
    const procedural = new Set(['pi_procedure_intake', 'pi_procedure_limitation_check', 'pi_procedure_evidence_preservation', 'pi_procedure_medical_evidence', 'pi_procedure_pre_action_letter', 'pi_procedure_partner_review']);
    const damagesOnly = includesAny(facts, ['damages', 'quantum', 'injury calculation', 'calculate', 'loss of earnings', 'medical expenses', 'future loss']);

    if (includesAny(facts, ['slip', 'trip', 'fall', 'wet floor', 'mall', 'shop', 'premises', 'restaurant', 'building'])) {
      ['pi_occupiers_liability', 'pi_foreseeability', 'pi_proximity', 'pi_res_ipsa'].forEach(id => relevant.add(id));
      ['pi_procedure_discovery', 'pi_procedure_statement_of_claim'].forEach(id => procedural.add(id));
    }
    if (includesAny(facts, ['at work', 'worker', 'employee', 'employer', 'workplace', 'factory', 'construction site', 'work site'])) relevant.add('pi_employers_liability');
    if (includesAny(facts, ['car', 'vehicle', 'driver', 'bus', 'taxi', 'lorry', 'road', 'traffic', 'collision', 'hit'])) relevant.add('pi_road_traffic_accident');
    if (includesAny(facts, ['psychiatric', 'ptsd', 'shock', 'trauma', 'secondary victim', 'rescuer'])) relevant.add('pi_psychiatric_injury');
    if (includesAny(facts, ['warning', 'sign', 'cctv', 'cleaning', 'inspection', 'incident report'])) relevant.add('pi_breach');
    if (includesAny(facts, ['fracture', 'wrist', 'injury', 'medical', 'doctor', 'hospital', 'off work', 'salary', 'income', 'earnings', 'expense'])) {
      ['pi_general_damages', 'pi_special_damages', 'pi_loss_of_earnings', 'pi_medical_expenses'].forEach(id => relevant.add(id));
      ['pi_procedure_schedule_of_damages', 'pi_procedure_settlement_offer'].forEach(id => procedural.add(id));
    }
    if (damagesOnly) {
      ['pi_general_damages', 'pi_special_damages', 'pi_loss_of_earnings', 'pi_future_loss', 'pi_care', 'pi_medical_expenses', 'pi_aids_equipment', 'pi_interest'].forEach(id => relevant.add(id));
      ['pi_procedure_medical_evidence', 'pi_procedure_schedule_of_damages', 'pi_procedure_interim_payment', 'pi_procedure_settlement_offer'].forEach(id => procedural.add(id));
    }
    return { relevant, procedural, damagesOnly };
  }

  function chooseExpanded() {
    const c = classifyFacts(S.facts);
    S.expanded = new Set();
    S.flows.forEach(flow => {
      (flow.sections || []).forEach(section => {
        const ids = section.nodes || [];
        const hit = ids.some(id => c.relevant.has(id) || c.procedural.has(id) || S.nodes[id]?.default_expanded);
        if (hit) S.expanded.add(section.section_id);
      });
    });
    return c;
  }

  function sourceCards(node) {
    return (node.source_card_ids || []).map(id => S.cards[id]).filter(Boolean);
  }

  function badgeHTML(node) {
    const cards = sourceCards(node);
    if (!cards.length) return '<span class="badge badge-audit">Source missing</span>';
    const statuses = new Set(cards.map(c => c.answer_layer_status));
    const verify = new Set(cards.map(c => c.verification_status));
    const out = ['<span class="badge badge-research">Research layer</span>'];
    if ([...verify].some(v => String(v).includes('verified') || v === 'source_verified')) out.push('<span class="badge badge-verified">Source card present</span>');
    if ([...verify].some(v => String(v).includes('needs'))) out.push('<span class="badge badge-review">Verification pending</span>');
    if (statuses.has('answer_safe')) out.push('<span class="badge badge-approved">Answer-safe</span>');
    return out.join('');
  }

  function missingFacts(required) {
    const f = norm(S.facts);
    return (required || []).filter(item => {
      const words = norm(item).split(/[^a-z0-9]+/).filter(w => w.length > 3);
      if (!words.length) return true;
      return !words.some(w => f.includes(w));
    });
  }

  function renderSection(flow, section, relevantIds) {
    const open = S.expanded.has(section.section_id);
    const nodes = (section.nodes || []).map(id => S.nodes[id]).filter(Boolean);
    const relevantCount = nodes.filter(n => relevantIds.has(n.node_id)).length;
    return `
      <section class="pi-section">
        <button class="pi-section-head" data-section="${esc(section.section_id)}">
          <span class="pi-section-title">${esc(section.title)}</span>
          <span class="pi-count">${relevantCount}/${nodes.length} relevant</span>
          <span>${open ? 'Collapse' : 'Expand'}</span>
        </button>
        ${open ? `<div class="pi-node-list">${nodes.map(n => renderNode(n, relevantIds)).join('')}</div>` : ''}
      </section>`;
  }

  function renderNode(n, relevantIds) {
    const selected = S.selectedId === n.node_id ? ' selected' : '';
    const relevant = relevantIds.has(n.node_id);
    return `
      <button class="pi-node${selected}" data-node="${esc(n.node_id)}">
        <div class="pi-node-main">
          <span class="pi-node-title">${esc(n.title)}</span>
          ${relevant ? '<span class="badge badge-approved">Relevant</span>' : '<span class="badge badge-draft">Collapsed by default</span>'}
        </div>
        <div class="pi-node-summary">${esc(n.summary || '')}</div>
        <div class="pi-node-badges">${badgeHTML(n)}</div>
      </button>`;
  }

  function relatedForms(node) {
    const ids = new Set(node.related_forms || []);
    return S.forms.filter(f => ids.has(f.form_id));
  }

  function relatedFirmBlocks(node) {
    const blocks = [];
    (S.firm?.sops || []).forEach(sop => (sop.blocks || []).forEach(block => {
      if ((block.applies_to_nodes || []).includes(node.node_id) || (node.related_procedural_steps || []).some(id => (block.applies_to_steps || []).includes(id))) {
        blocks.push({ sop, block });
      }
    }));
    return blocks;
  }

  function renderInspector() {
    const node = S.nodes[S.selectedId] || S.nodes.pi_negligence_overview;
    const cards = sourceCards(node);
    const forms = relatedForms(node);
    const firmBlocks = relatedFirmBlocks(node);
    const missing = missingFacts(node.required_facts);
    const abstain = !cards.length || cards.some(c => c.answer_layer_status !== 'answer_safe');
    return `
      <div class="pi-inspector">
        <section class="pi-trace">
          <div class="view-eyebrow">Structured legal reasoning trace</div>
          <div class="view-title">${esc(node.title)}</div>
          <div class="pi-node-badges">${badgeHTML(node)}<span class="badge badge-review">Lawyer review required</span></div>
          ${abstain ? '<div class="pi-abstain">Abstention gate: this item cannot be shown as final legal advice because it is research-only, unverified, or source support is incomplete.</div>' : ''}
          <div class="pi-trace-grid">
            <div class="pi-trace-label">Issue</div><div class="pi-trace-value">${esc(node.group || node.rail)}: ${esc(node.title)}</div>
            <div class="pi-trace-label">Rule</div><div class="pi-trace-value">${esc(cards[0]?.rule_text || 'Source missing. No legal proposition may be stated as verified.')}</div>
            <div class="pi-trace-label">Application</div><div class="pi-trace-value">${esc(applicationText(node))}</div>
            <div class="pi-trace-label">Missing facts</div><div class="pi-trace-value">${missing.length ? esc(missing.join('; ')) : 'No obvious required fact gap detected by the demo classifier.'}</div>
            <div class="pi-trace-label">Procedure</div><div class="pi-trace-value">${esc((node.related_procedural_steps || node.related_legal_nodes || []).join('; ') || 'No linked procedural step recorded.')}</div>
            <div class="pi-trace-label">Forms</div><div class="pi-trace-value">${forms.length ? forms.map(f => esc(f.title) + ' (' + esc(f.verification_status) + ')').join('; ') : 'No form/template linked.'}</div>
            <div class="pi-trace-label">Review status</div><div class="pi-trace-value">Research layer only. Partner review and latest official form check required before external use.</div>
          </div>
        </section>
        <section class="pi-trace">
          <div class="view-eyebrow">Evidence / source cards</div>
          ${cards.length ? cards.map(c => `
            <div class="pi-source-card">
              <strong>${esc(c.source_title)}</strong>
              <div class="pi-meta">${esc(c.citation)} · ${esc(c.pinpoint)} · ${esc(c.verification_status)} · ${esc(c.source_license_status)}</div>
              <q>${esc(c.quoted_excerpt)}</q>
            </div>`).join('') : '<div class="pi-abstain">Source missing / verification required.</div>'}
          ${firmBlocks.length ? `<div class="view-eyebrow" style="margin-top:14px">Firm private overlay</div>${firmBlocks.map(({ sop, block }) => `
            <div class="sop-note"><span class="sn-label">${esc(sop.title)} v${esc(sop.version)} · ${esc(block.title)}</span>${esc(block.instruction)}</div>`).join('')}` : ''}
        </section>
      </div>`;
  }

  function applicationText(node) {
    if (!S.facts.trim()) return 'No fact pattern entered; node remains a checklist item only.';
    const missing = missingFacts(node.required_facts);
    if (missing.length) return 'The fact pattern may engage this node, but the workflow withholds a final view until missing facts are supplied: ' + missing.join(', ') + '.';
    return 'The entered facts contain the required demo fields for this node. The output remains research-only unless source cards become verified and lawyer review is recorded.';
  }

  function renderPreviews() {
    const previews = S.previewData || [];
    return `
      <div class="pi-preview-grid">
        ${previews.map(p => `
          <section class="pi-preview">
            <h3>${esc(p.title)}</h3>
            <div class="pi-node-badges"><span class="badge badge-review">Lawyer review required</span><span class="badge badge-research">Mock assembly preview</span></div>
            ${(p.paragraphs || []).map(para => {
              const missing = missingFacts(para.required_facts);
              const supported = (para.source_card_ids || []).length || (para.firm_template_clause_ids || []).length;
              return `<div class="pi-paragraph">
                <div class="pi-paragraph-title">${esc(para.title)}</div>
                <div class="card-body">${esc(para.template_text)}</div>
                <div class="pi-meta">fields: ${missing.length ? 'missing ' + esc(missing.join(', ')) : 'demo facts detected'}</div>
                <div class="pi-meta">trail: ${supported ? esc([...(para.source_card_ids || []), ...(para.firm_template_clause_ids || [])].join(', ')) : 'source missing'}</div>
              </div>`;
            }).join('')}
          </section>`).join('')}
      </div>`;
  }

  function render() {
    const c = chooseExpanded();
    const relevantIds = new Set([...c.relevant, ...c.procedural]);
    if (!S.selectedId) S.selectedId = c.damagesOnly ? 'pi_general_damages' : 'pi_negligence_overview';
    const legalFlow = S.flows.find(f => f.rail === 'legal_analysis');
    const proceduralFlow = S.flows.find(f => f.rail === 'procedural_forms');
    $('#view-root').innerHTML = `
      <div class="view-eyebrow">PI source-card cockpit</div>
      <div class="view-title">Two synchronized fail-closed flows</div>
      <p class="view-lede">Facts expand the maintained PI ontology only. Every rule, procedural step, form outline, and draft paragraph must show a source card or firm-private clause; otherwise the UI abstains.</p>
      <div class="pi-shell">
        <div>
          <div class="pi-rail-title"><h2>Legal Analysis Flow</h2><span class="badge badge-research">Issue -> Rule -> Source -> Application</span></div>
          ${(legalFlow?.sections || []).map(section => renderSection(legalFlow, section, c.relevant)).join('')}
        </div>
        <div>
          <div class="pi-rail-title"><h2>Procedural / Forms Flow</h2><span class="badge badge-review">Draft only</span></div>
          ${(proceduralFlow?.sections || []).map(section => renderSection(proceduralFlow, section, c.procedural)).join('')}
        </div>
      </div>
      ${renderInspector()}
      ${renderPreviews()}
    `;
    wire();
    $('#status-data').textContent = 'Data: HK PI ontology demo';
    $('#status-counts').textContent = `${S.legalNodes.length} legal nodes · ${S.proceduralNodes.length} procedural nodes · ${S.forms.length} forms · ${Object.keys(S.cards).length} source cards`;
  }

  function wire() {
    document.querySelectorAll('[data-section]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.section;
      S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id);
      render();
    }));
    document.querySelectorAll('[data-node]').forEach(btn => btn.addEventListener('click', () => {
      S.selectedId = btn.dataset.node;
      render();
    }));
  }

  function boot() {
    const factInput = $('#pi-facts');
    S.facts = factInput.value;
    factInput.addEventListener('input', () => {
      S.facts = factInput.value;
      S.selectedId = null;
      render();
    });
    Promise.all([
      loadJSON(PATHS.nodes),
      loadJSON(PATHS.flows),
      loadJSON(PATHS.forms),
      loadJSON(PATHS.cards),
      loadJSON(PATHS.firm),
    ]).then(([nodes, flows, forms, cards, firm]) => {
      S.legalNodes = nodes.legal_nodes || [];
      S.proceduralNodes = nodes.procedural_nodes || [];
      [...S.legalNodes, ...S.proceduralNodes].forEach(n => { S.nodes[n.node_id] = n; });
      S.flows = flows.flows || [];
      S.previewData = flows.document_previews || [];
      S.forms = forms.forms || [];
      (cards.source_cards || []).forEach(c => { S.cards[c.source_card_id] = c; });
      S.firm = firm;
      render();
    }).catch(err => {
      $('#view-root').innerHTML = `<div class="empty-state"><h3>Could not load PI workflow</h3><p>${esc(err.message)}</p></div>`;
      $('#status-data').textContent = 'Data load failed';
    });
  }

  boot();
})();
