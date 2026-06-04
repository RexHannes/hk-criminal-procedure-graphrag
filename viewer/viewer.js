(function() {
  'use strict';

  const TYPE_COLORS_DEFAULT = {
    domain: '#0b2245',
    section_header: '#475569',
    legal_issue: '#2563eb',
    statute: '#23844f',
    case_seed: '#7c3aed',
    flow_step: '#d97706',
    flow_group: '#b45309',
    practice_direction: '#0f766e',
    gap: '#6b7280',
    restricted_nsl: '#dc2626',
    listing_rule_anchor: '#15803d',
    sehk_decision_seed: '#7c3aed',
    guidance_letter_seed: '#0891b2',
    practice_note_anchor: '#0f766e',
    sfc_material_seed: '#dc2626',
    textbook_seed: '#b45309',
    enforcement_seed: '#dc2626',
    cross_reference: '#9333ea',
    gap_node: '#6b7280',
  };

  const REGULATORY_TYPES = new Set([
    'listing_rule_anchor', 'sehk_decision_seed', 'guidance_letter_seed',
    'practice_note_anchor', 'textbook_seed', 'enforcement_seed', 'sfc_material_seed',
  ]);

  const SUPPORT_RELATIONSHIPS = new Set([
    'statutory_anchor',
    'case_seed',
    'practice_direction_ref',
    'cross_reference',
    'listing_rule_anchor',
    'guidance_letter_seed',
    'sehk_decision_seed',
    'practice_note_anchor',
    'enforcement_seed',
    'sfc_material_seed',
  ]);

  const SECTION_PALETTES = [
    { accent: '#2563eb', soft: '#eff6ff', tint: '#dbeafe', ink: '#0f3b7a' },
    { accent: '#23844f', soft: '#f0fdf4', tint: '#dcfce7', ink: '#14532d' },
    { accent: '#d97706', soft: '#fff8eb', tint: '#fed7aa', ink: '#7c2d12' },
    { accent: '#7c3aed', soft: '#f6f0ff', tint: '#ede9fe', ink: '#4c1d95' },
    { accent: '#dc2626', soft: '#fff1f2', tint: '#fecdd3', ink: '#7f1d1d' },
    { accent: '#0f766e', soft: '#ecfeff', tint: '#ccfbf1', ink: '#134e4a' },
  ];

  const TYPE_ORDER = {
    section_header: 0,
    legal_issue: 1,
    restricted_nsl: 2,
    practice_direction: 3,
    listing_rule_anchor: 3,
    flow_group: 4,
    flow_step: 5,
    statute: 3,
    case_seed: 4,
    sehk_decision_seed: 4,
    guidance_letter_seed: 4,
    enforcement_seed: 4,
    sfc_material_seed: 4,
    practice_note_anchor: 3,
    textbook_seed: 5,
    cross_reference: 6,
    gap: 7,
    gap_node: 7,
  };

  let allNodes = [];
  let allEdges = [];
  let allFlows = [];
  let manifestSections = [];
  let nodeMap = {};
  let virtualNodeMap = {};
  let edgeFromMap = {};
  let primaryChildrenMap = {};
  let primaryParentMap = {};
  let supportParentMap = {};
  let treeParentMap = {};
  let renderedTreeIds = new Set();
  let treeModel = null;
  let expandedIds = new Set();
  let selectedId = null;
  let flowInterval = null;
  let currentFlowStep = -1;
  let activeFilters = new Set();
  let currentDepth = 2;
  let searchQuery = '';
  let evidenceFetchToken = 0;
  let evidenceSearchToken = 0;
  let pendingFocusId = null;

  let currentDomain = null;
  let domainRegistry = null;
  let availableDomains = [];
  let typeColors = {};
  let controlsBound = false;
  let loadToken = 0;

  function loadJSON(path) { return fetch(path).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  // ── Domain Registry ──

  function loadDomainRegistry() {
    return loadJSON(INDEX_PATH).then(registry => {
      domainRegistry = registry;
      return Promise.all(registry.domains.map(d =>
        loadJSON(DATA_BASE + d.path).then(domainData => ({ ...d, domainData }))
      ));
    }).then(domains => {
      availableDomains = domains;
      const sel = document.getElementById('domain-select');
      sel.innerHTML = '<option value="">Select a domain</option>';
      domains.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.domain_id;
        opt.textContent = d.title;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function() {
        const domain = domains.find(d => d.domain_id === this.value);
        if (domain) switchDomain(domain);
      });
      if (domains.length > 0) {
        sel.value = domains[0].domain_id;
        switchDomain(domains[0]);
      }
    });
  }

  function switchDomain(domain) {
    resetState();
    currentDomain = domain;
    const titleEl = document.getElementById('header-title-text');
    titleEl.textContent = domain.title;

    const badgeEl = document.getElementById('domain-badge-status');
    const verBadge = document.getElementById('domain-badge-verification');
    badgeEl.textContent = 'not_product_answer_layer';
    verBadge.textContent = 'needs_verification';

    typeColors = { ...TYPE_COLORS_DEFAULT, ...(domain.domainData.node_type_colors || {}) };
    updateHeaderBadges(domain);
    updateLegend(domain);

    const consolidatedPath = DATA_BASE + domain.path.replace('domain.json', 'consolidated.json');
    const token = ++loadToken;
    loadDomainData(consolidatedPath, token);
  }

  function updateHeaderBadges(domain) {
    const status = domain.status || domain.domainData.status || {};
    const badgeEl = document.getElementById('domain-badge-status');
    const verBadge = document.getElementById('domain-badge-verification');
    if (status.not_product_answer_layer) badgeEl.textContent = 'not_product_answer_layer';
    if (status.needs_hklii_verification) verBadge.textContent = 'needs_hklii_verification';
    else if (status.needs_official_source_verification) verBadge.textContent = 'needs_official_source_verification';

    const disclaimer = document.getElementById('disclaimer-box');
    const domainDisclaimer = domain.domainData.utterance_disclaimer;
    if (domainDisclaimer) {
      disclaimer.innerHTML = `<strong>Seed-layer map.</strong> ${domainDisclaimer}`;
    } else {
      disclaimer.innerHTML = '<strong>Seed-layer map.</strong> Not a product answer layer. Use verified paragraph proof before legal reliance.';
    }
    if (!selectedId) {
      document.getElementById('detail-content').innerHTML = getEmptyAuditMarkup();
    }
  }

  function updateLegend(domain) {
    const legend = document.getElementById('legend');
    legend.innerHTML = '';
    const colors = domain.domainData.node_type_colors || {};
    Object.entries(colors).forEach(([type, color]) => {
      if (type === 'domain') return;
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<span class="dot" style="background:${color}"></span>${type.replace(/_/g, ' ')}`;
      legend.appendChild(item);
    });
  }

  function resetState() {
    allNodes = [];
    allEdges = [];
    allFlows = [];
    manifestSections = [];
    nodeMap = {};
    virtualNodeMap = {};
    edgeFromMap = {};
    primaryChildrenMap = {};
    primaryParentMap = {};
    supportParentMap = {};
    treeParentMap = {};
    renderedTreeIds = new Set();
    treeModel = null;
    expandedIds = new Set();
    selectedId = null;
    evidenceFetchToken++;
    evidenceSearchToken++;
    if (flowInterval) { clearInterval(flowInterval); flowInterval = null; }
    currentFlowStep = -1;
    searchQuery = '';
    activeFilters.clear();

    document.getElementById('tree-root').innerHTML = '';
    document.getElementById('detail-content').innerHTML = getEmptyAuditMarkup();
    document.getElementById('section-list').innerHTML = '';
    document.getElementById('flow-select').innerHTML = '<option value="">Select a flow</option>';
    document.getElementById('flow-step-indicator').textContent = '0 / 0';
    document.getElementById('flow-step-info').textContent = '';
    document.getElementById('flow-prev').disabled = true;
    document.getElementById('flow-next').disabled = true;
    document.getElementById('flow-play').disabled = true;
    document.getElementById('flow-reset').disabled = true;
    document.getElementById('search-box').value = '';
    document.getElementById('ai-search-status').textContent = 'Type a question, then press Enter or Evidence Trail.';
    document.getElementById('evidence-search-results').innerHTML = '';
    document.getElementById('filter-list').innerHTML = '';
  }

  // ── Data Loading ──

  function loadDomainData(consolidatedPath, token) {
    document.getElementById('status-selected').textContent = 'Loading...';
    const dataBase = consolidatedPath.substring(0, consolidatedPath.lastIndexOf('/') + 1);

    return loadJSON(consolidatedPath).then(manifest => {
      const nextNodes = [];
      const nextEdges = [];
      const sectionPromises = manifest.sections.map(s => {
        const nodeP = loadJSON(dataBase + s.node_file).then(d => d.nodes || []);
        const edgeP = loadJSON(dataBase + s.edge_file).then(d => d.edges || []);
        return Promise.all([nodeP, edgeP]).then(([nodes, edges]) => {
          nextNodes.push(...nodes);
          nextEdges.push(...edges);
        });
      });
      const flowP = loadJSON(dataBase + manifest.flows_file).then(d => d.flows || []);
      return Promise.all([Promise.all(sectionPromises), flowP])
        .then(([, flows]) => ({ manifest, nodes: nextNodes, edges: nextEdges, flows }));
    }).then(payload => {
      if (token !== loadToken) return;
      manifestSections = payload.manifest.sections || [];
      allNodes = payload.nodes;
      allEdges = payload.edges;
      allFlows = payload.flows;
      allNodes.forEach(n => { nodeMap[n.id] = n; });
      allEdges.forEach(e => {
        if (!edgeFromMap[e.from]) edgeFromMap[e.from] = [];
        edgeFromMap[e.from].push(e);
        if (e.relationship === 'has_subtopic') {
          if (!primaryChildrenMap[e.from]) primaryChildrenMap[e.from] = [];
          primaryChildrenMap[e.from].push(e.to);
          primaryParentMap[e.to] = e.from;
        } else if (SUPPORT_RELATIONSHIPS.has(e.relationship)) {
          if (!supportParentMap[e.to]) supportParentMap[e.to] = [];
          supportParentMap[e.to].push(e.from);
        }
      });
      buildFilters();
      buildTreeModel();
      expandedIds.add(treeModel.id);
      treeModel.children.forEach(c => expandedIds.add(c.id));
      renderTree();
      applyTypeFilters();
      setupEventListeners();
      if (pendingFocusId && nodeMap[pendingFocusId]) {
        const focusId = pendingFocusId;
        pendingFocusId = null;
        setTimeout(() => focusDoctrineNode(focusId), 40);
      }
      document.getElementById('status-selected').textContent = 'Ready · Tree view';
    }).catch(err => {
      document.getElementById('status-selected').textContent = 'Error loading data';
      document.getElementById('detail-content').innerHTML =
        `<p style="color:#ef4444">Failed to load: ${err.message}<br>Try serving via HTTP:<br><code>python3 -m http.server 8080</code></p>`;
    });
  }

  function buildFilters() {
    const filterList = document.getElementById('filter-list');
    filterList.innerHTML = '';

    const seen = new Set();
    const types = [];

    allNodes.forEach(n => {
      if (!seen.has(n.type) && n.type !== 'domain' && n.type !== 'section_header' && n.type !== 'flow_group') {
        seen.add(n.type);
        types.push(n.type);
      }
    });

    types.sort();
    activeFilters.clear();
    types.forEach(t => activeFilters.add(t));

    types.forEach(type => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.type = type;
      cb.checked = true;
      cb.addEventListener('change', handleFilterChange);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + type.replace(/_/g, ' ')));
      filterList.appendChild(label);
    });
  }

  // ── Tree Model Builder ──

  function buildTreeModel() {
    const sectionHeaders = {};
    const flowSteps = {};
    virtualNodeMap = {};
    treeParentMap = {};
    renderedTreeIds = new Set();
    const domainId = currentDomain.domain_id;
    const domainTitle = currentDomain.title;

    allNodes.forEach(n => {
      if (n.type === 'section_header') {
        sectionHeaders[n.section] = n;
      } else if (n.type === 'flow_step') {
        if (!flowSteps[n.section]) flowSteps[n.section] = [];
        flowSteps[n.section].push(n);
      }
    });

    const children = [];

    manifestSections.forEach(section => {
      const sid = section.id;
      const header = sectionHeaders[sid];
      if (!header) return;

      const sectionChildren = buildPrimaryChildren(header.id, 2, new Set([header.id]));
      const sectionFlowSteps = getOrderedFlowStepsForSection(sid, flowSteps[sid] || []);

      if (sectionFlowSteps.length) {
        const groupId = `flow_group_${sid}`;
        const groupData = {
          id: groupId,
          label: 'Procedural Flow Steps',
          type: 'flow_group',
          section: sid,
          summary: 'Collapsible branch for procedural flow steps. These are hidden by default and highlighted by the flow player.',
        };
        virtualNodeMap[groupId] = groupData;
        sectionChildren.push(makeNode(groupData, 2, sectionFlowSteps.map(step => makeNode(step, 3))));
      }

      children.push(makeNode(header, 1, sectionChildren, `${domainId}_root`));
    });

    const rootData = {
      id: `${domainId}_root`,
      label: domainTitle,
      type: 'domain',
      summary: currentDomain.domainData.description || 'Legal doctrine tree map.',
      verification_status: 'not_product_answer_layer',
      answer_layer_status: 'not_product_answer_layer',
      authority_status: 'unverified_seed',
    };
    virtualNodeMap[rootData.id] = rootData;
    treeModel = {
      id: rootData.id,
      label: rootData.label,
      type: rootData.type,
      color: typeColors['domain'] || '#0b2245',
      depth: 0,
      children: children,
      data: rootData,
    };
    collectRenderedIds(treeModel);
  }

  function buildPrimaryChildren(parentId, depth, seen) {
    return (primaryChildrenMap[parentId] || [])
      .map(childId => nodeMap[childId])
      .filter(Boolean)
      .sort(compareTreeNodes)
      .map(child => {
        if (seen.has(child.id)) return null;
        const nextSeen = new Set(seen);
        nextSeen.add(child.id);
        return makeNode(child, depth, buildPrimaryChildren(child.id, depth + 1, nextSeen), parentId);
      })
      .filter(Boolean);
  }

  function getOrderedFlowStepsForSection(sectionId, steps) {
    const byId = new Map(steps.map(step => [step.id, step]));
    const orderedIds = [];
    allFlows.forEach(flow => {
      (flow.steps || []).forEach(stepId => {
        const step = byId.get(stepId);
        if (step && step.section === sectionId && !orderedIds.includes(stepId)) orderedIds.push(stepId);
      });
    });
    steps
      .map(step => step.id)
      .filter(stepId => !orderedIds.includes(stepId))
      .sort()
      .forEach(stepId => orderedIds.push(stepId));
    return orderedIds.map(stepId => byId.get(stepId)).filter(Boolean);
  }

  function compareTreeNodes(a, b) {
    const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (typeDiff) return typeDiff;
    return (a.subsection || a.subtopic || a.label || a.id).localeCompare(b.subsection || b.subtopic || b.label || b.id);
  }

  function makeNode(node, depth, children, parentId) {
    if (parentId) treeParentMap[node.id] = parentId;
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      color: typeColors[node.type] || '#6b7280',
      depth: depth,
      children: children || [],
      data: node,
    };
  }

  function collectRenderedIds(tNode) {
    if (nodeMap[tNode.id]) renderedTreeIds.add(tNode.id);
    (tNode.children || []).forEach(child => {
      treeParentMap[child.id] = tNode.id;
      collectRenderedIds(child);
    });
  }

  // ── Tree Renderer ──

  function renderTree() {
    const root = document.getElementById('tree-root');
    root.innerHTML = '';
    root.className = 'tree-root';

    const resultsEl = document.createElement('div');
    resultsEl.id = 'search-results';
    root.appendChild(resultsEl);

    const rootEl = renderTreeNode(treeModel, 0, true);
    root.appendChild(rootEl);

    updateStatusBar();
    populateSectionList();
    populateFlows();

    if (selectedId) {
      showNodeDetail(selectedId);
      highlightSelectedNode(selectedId);
    }

    applySearch();
  }

  function renderTreeNode(tNode, depth, isRoot) {
    const container = document.createElement('div');
    container.className = 'tree-node';
    container.dataset.nodeId = tNode.id;
    container.dataset.depth = depth;
    container.dataset.type = tNode.type;
    const palette = getPaletteForNode(tNode);
    container.style.setProperty('--branch-color', palette.accent);
    container.style.setProperty('--branch-soft', palette.soft);
    container.style.setProperty('--branch-tint', palette.tint);
    container.style.setProperty('--branch-ink', palette.ink);

    const isExpandable = tNode.children && tNode.children.length > 0;
    const isExpanded = expandedIds.has(tNode.id);

    if (!isRoot) {
      const branch = document.createElement('div');
      branch.className = 'tree-branch';
      container.appendChild(branch);
    }

    if (!isRoot) {
      const toggle = document.createElement('button');
      toggle.className = 'tree-toggle' + (isExpandable ? '' : ' leaf');
      toggle.innerHTML = isExpandable ? (isExpanded ? '−' : '+') : '·';
      if (isExpandable) {
        toggle.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleExpand(tNode.id);
        });
      }
      container.appendChild(toggle);
    }

    const card = document.createElement('div');
    card.className = 'tree-card';
    card.dataset.type = tNode.type;
    if (tNode.id === selectedId) card.classList.add('selected');
    card.addEventListener('click', function() {
      selectedId = tNode.id;
      document.querySelectorAll('.tree-card.selected').forEach(el => el.classList.remove('selected'));
      card.classList.add('selected');
      showNodeDetail(tNode.id);
    });

    const header = document.createElement('div');
    header.className = 'tree-card-header';

    const label = document.createElement('div');
    label.className = 'tree-card-label';
    label.textContent = tNode.label;
    header.appendChild(label);

    const badges = document.createElement('div');
    badges.className = 'tree-card-badges';
    const tb = document.createElement('span');
    tb.className = 'type-badge';
    tb.style.background = tNode.color;
    tb.textContent = tNode.type.replace(/_/g, ' ');
    badges.appendChild(tb);

    const nd = tNode.data;
    if (nd && nd.verification_status) {
      const vb = document.createElement('span');
      vb.className = 'status-badge';
      if (nd.verification_status === 'verified') { vb.className += ' verified'; vb.textContent = 'verified'; }
      else if (nd.verification_status === 'needs_official_source_verification' || nd.verification_status === 'needs_hklii_verification') { vb.className += ' needs-verification'; vb.textContent = 'needs verify'; }
      else { vb.className += ' unverified'; vb.textContent = nd.verification_status; }
      badges.appendChild(vb);
    }

    if (nd && nd.answer_layer_status === 'not_product_answer_layer') {
      const nb = document.createElement('span');
      nb.className = 'status-badge needs-verification';
      nb.textContent = 'seed';
      badges.appendChild(nb);
    }

    if (nd && nd.authority_status && nd.authority_status.startsWith('unverified')) {
      const ab = document.createElement('span');
      ab.className = 'status-badge unverified';
      ab.textContent = 'unverified';
      badges.appendChild(ab);
    }

    getCardCounts(tNode).forEach(item => {
      const cb = document.createElement('span');
      cb.className = 'depth-badge';
      cb.textContent = item;
      badges.appendChild(cb);
    });

    header.appendChild(badges);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tree-card-body';

    if (nd && nd.summary) {
      const summary = document.createElement('div');
      summary.className = 'tree-card-summary';
      summary.innerHTML = `<strong>${tNode.type === 'flow_step' ? 'Step' : 'Principle'}:</strong> ${esc(nd.summary)}`;
      body.appendChild(summary);
    }

    const auditPreview = getAuditPreview(nd);
    if (auditPreview) {
      const audit = document.createElement('div');
      audit.className = 'tree-card-audit';
      audit.innerHTML = auditPreview;
      body.appendChild(audit);
    }

    if (body.children.length) card.appendChild(body);

    container.appendChild(card);

    if (isExpandable) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children' + (isExpanded ? ' open' : '');
      childContainer.id = 'children-' + tNode.id;

      tNode.children.forEach(child => {
        const childEl = renderTreeNode(child, depth + 1, false);
        childContainer.appendChild(childEl);
      });

      container.appendChild(childContainer);
    }

    return container;
  }

  function getCardCounts(tNode) {
    const nd = tNode.data || {};
    const counts = [];
    const childCount = tNode.children ? tNode.children.length : 0;
    if (childCount > 0) counts.push(childCount + ' items');
    if ((nd.statute_refs || []).length) counts.push(nd.statute_refs.length + ' statutes');
    if ((nd.case_seeds || []).length) counts.push(nd.case_seeds.length + ' cases');
    if ((nd.listing_rule_refs || []).length) counts.push(nd.listing_rule_refs.length + ' rules');
    if ((nd.guidance_refs || []).length) counts.push(nd.guidance_refs.length + ' guidance');
    if ((nd.practice_direction_refs || []).length) counts.push(nd.practice_direction_refs.length + ' PDs');
    if (nd.type === 'gap') counts.push('gap');
    return counts;
  }

  function getPaletteForNode(tNode) {
    const section = (tNode.data && tNode.data.section) || inferSectionFromTree(tNode.id);
    const sectionNum = parseInt(section || '1', 10);
    if (!sectionNum || Number.isNaN(sectionNum)) return SECTION_PALETTES[0];
    return SECTION_PALETTES[(sectionNum - 1) % SECTION_PALETTES.length];
  }

  function inferSectionFromTree(nodeId) {
    let cursor = nodeId;
    while (cursor) {
      const node = nodeMap[cursor] || virtualNodeMap[cursor];
      if (node && node.section) return node.section;
      cursor = treeParentMap[cursor];
    }
    return null;
  }

  function getAuditPreview(nd) {
    if (!nd) return '';
    const chips = [];
    const statuteCount = (nd.statute_refs || []).length;
    const caseCount = (nd.case_seeds || []).length;
    const listingRuleCount = (nd.listing_rule_refs || []).length;
    const guidanceCount = (nd.guidance_refs || []).length;
    const pdCount = (nd.practice_direction_refs || []).length;
    const crossCount = (nd.cross_refs || []).length;
    if (listingRuleCount) chips.push(`<span><b>${listingRuleCount}</b> Listing Rule${listingRuleCount > 1 ? 's' : ''}</span>`);
    if (guidanceCount) chips.push(`<span><b>${guidanceCount}</b> guidance ref${guidanceCount > 1 ? 's' : ''}</span>`);
    if (statuteCount) chips.push(`<span><b>${statuteCount}</b> statute${statuteCount > 1 ? 's' : ''}</span>`);
    if (caseCount) chips.push(`<span><b>${caseCount}</b> case seed${caseCount > 1 ? 's' : ''}</span>`);
    if (pdCount) chips.push(`<span><b>${pdCount}</b> PD ref${pdCount > 1 ? 's' : ''}</span>`);
    if (crossCount) chips.push(`<span><b>${crossCount}</b> cross-ref${crossCount > 1 ? 's' : ''}</span>`);
    if (!chips.length && nd.type === 'case_seed') chips.push('<span>case audit seed</span>');
    if (!chips.length && nd.type === 'statute') chips.push('<span>statutory anchor</span>');
    if (!chips.length && REGULATORY_TYPES.has(nd.type)) chips.push('<span>regulatory anchor</span>');
    return chips.join('');
  }

  function toggleExpand(nodeId) {
    if (expandedIds.has(nodeId)) {
      expandedIds.delete(nodeId);
    } else {
      expandedIds.add(nodeId);
    }
    const container = document.getElementById('children-' + nodeId);
    if (container) {
      container.classList.toggle('open');
    }
    const toggleBtn = document.querySelector(`.tree-node[data-node-id="${nodeId}"] .tree-toggle`);
    if (toggleBtn && !toggleBtn.classList.contains('leaf')) {
      toggleBtn.innerHTML = expandedIds.has(nodeId) ? '−' : '+';
    }
  }

  function expandAll() {
    function collectIds(tNode) {
      expandedIds.add(tNode.id);
      tNode.children.forEach(collectIds);
    }
    expandedIds.clear();
    collectIds(treeModel);
    rerender();
  }

  function collapseToDepth(targetDepth) {
    expandedIds.clear();
    function collect(tNode, d) {
      if (d < targetDepth) {
        expandedIds.add(tNode.id);
        tNode.children.forEach(c => collect(c, d + 1));
      }
    }
    collect(treeModel, 0);
    rerender();
  }

  function collapseAll() {
    expandedIds.clear();
    expandedIds.add(treeModel.id);
    rerender();
  }

  function highlightSelectedNode(nodeId) {
    document.querySelectorAll('.tree-card.selected').forEach(el => el.classList.remove('selected'));
    const card = document.querySelector(`.tree-node[data-node-id="${nodeId}"] .tree-card`);
    if (card) {
      card.classList.add('selected');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function focusDoctrineNode(nodeId) {
    if (!nodeId) return;
    selectedId = nodeId;
    let parentId = treeParentMap[nodeId] || primaryParentMap[nodeId];
    while (parentId) {
      expandedIds.add(parentId);
      parentId = treeParentMap[parentId] || primaryParentMap[parentId];
    }
    renderTree();
    applyTypeFilters();
    showNodeDetail(nodeId);
    highlightSelectedNode(nodeId);
    document.getElementById('status-selected').textContent = 'Selected: ' + nodeId;
  }

  function rerender() { renderTree(); }

  // ── Detail Panel ──

  function showNodeDetail(nodeId) {
    const n = nodeMap[nodeId] || virtualNodeMap[nodeId];
    if (!n) {
      const el = document.getElementById('detail-content');
      el.innerHTML = '<p class="hint">Node data not found</p>';
      return;
    }

    const allRefs = collectNodeRefs(nodeId);
    const typeColor = typeColors[n.type] || '#6b7280';

    let html = '';

    html += '<div class="detail-header">';
    html += `<span class="type-badge" style="background:${typeColor}">${esc(n.type)}</span>`;
    html += `<h2>${esc(n.label)}</h2>`;
    if (n.neutral_citation) html += `<div class="subtitle">${esc(n.neutral_citation)}</div>`;
    html += '</div>';

    const statuses = [];
    if (n.verification_status) statuses.push({ label: n.verification_status, cls: n.verification_status === 'verified' ? 'success' : 'warn' });
    if (n.authority_status) statuses.push({ label: n.authority_status, cls: 'danger' });
    if (n.answer_layer_status) statuses.push({ label: n.answer_layer_status, cls: 'warn' });
    if (statuses.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Status</div><div class="detail-meta">';
      statuses.forEach(s => {
        html += `<div class="detail-meta-row"><span class="detail-meta-label">Status</span><span class="detail-meta-value ${s.cls}">${esc(s.label)}</span></div>`;
      });
      html += '</div></div>';
    }

    if (n.summary) {
      html += `<div class="detail-section"><div class="detail-summary">${esc(n.summary)}</div></div>`;
    }

    html += '<div class="detail-section"><div class="detail-section-title">Metadata</div><div class="detail-meta">';
    html += `<div class="detail-meta-row"><span class="detail-meta-label">ID</span><span class="detail-meta-value">${esc(n.id)}</span></div>`;
    if (n.section) html += `<div class="detail-meta-row"><span class="detail-meta-label">Section</span><span class="detail-meta-value">${esc(n.section)}</span></div>`;
    if (n.subtopic) html += `<div class="detail-meta-row"><span class="detail-meta-label">Subtopic</span><span class="detail-meta-value">${esc(n.subtopic)}</span></div>`;
    if (n.subsection) html += `<div class="detail-meta-row"><span class="detail-meta-label">Subsection</span><span class="detail-meta-value">${esc(n.subsection)}</span></div>`;
    if (n.rule_chapter) html += `<div class="detail-meta-row"><span class="detail-meta-label">Rule Chapter</span><span class="detail-meta-value">${esc(n.rule_chapter)}</span></div>`;
    if (n.rule_number) html += `<div class="detail-meta-row"><span class="detail-meta-label">Rule Number</span><span class="detail-meta-value">${esc(n.rule_number)}</span></div>`;
    if (n.effective_date) html += `<div class="detail-meta-row"><span class="detail-meta-label">Effective</span><span class="detail-meta-value">${esc(n.effective_date)}</span></div>`;
    if (n.source_url) html += `<div class="detail-meta-row"><span class="detail-meta-label">Source</span><span class="detail-meta-value">${esc(n.source_url)}</span></div>`;
    html += '</div></div>';

    if (allRefs.listingRules.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Listing Rules (' + allRefs.listingRules.length + ')</div><ul class="detail-ref-list">';
      allRefs.listingRules.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.rule_number || ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    if (allRefs.statutes.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Statute References (' + allRefs.statutes.length + ')</div><ul class="detail-ref-list">';
      allRefs.statutes.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    if (allRefs.cases.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Case Seeds (' + allRefs.cases.length + ')</div><ul class="detail-ref-list">';
      allRefs.cases.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}${ref.citation ? ' · ' + esc(ref.citation) : ''}</span></li>`;
      });
      html += '</ul></div>';
    }

    if (allRefs.guidance.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Guidance References (' + allRefs.guidance.length + ')</div><ul class="detail-ref-list">';
      allRefs.guidance.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    if (allRefs.pds.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Practice Directions (' + allRefs.pds.length + ')</div><ul class="detail-ref-list">';
      allRefs.pds.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    if (allRefs.crossRefs.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Cross-References (' + allRefs.crossRefs.length + ')</div><ul class="detail-ref-list">';
      allRefs.crossRefs.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    const evidenceTarget = getEvidenceTargetForNode(nodeId);
    html += '<div class="detail-section"><div class="detail-section-title">Case Audit / Source Proof</div>';
    html += `<div id="backend-evidence-panel" class="detail-audit-box loading" data-node-id="${escAttr(evidenceTarget.doctrineNodeId)}">`;
    html += '<strong>Loading backend evidence...</strong>';
    html += `<div class="audit-subline">${esc(evidenceTarget.loadingText)}</div>`;
    html += '</div></div>';

    document.getElementById('detail-content').innerHTML = html;
    fetchBackendEvidence(evidenceTarget.doctrineNodeId, evidenceTarget);
    document.querySelectorAll('.detail-ref-list li[data-ref-id]').forEach(item => {
      item.addEventListener('click', () => {
        const refId = item.dataset.refId;
        selectedId = refId;
        showNodeDetail(refId);
        highlightSelectedNode(refId);
      });
    });
    document.getElementById('status-selected').textContent = 'Selected: ' + n.id;
  }

  function getEvidenceTargetForNode(nodeId) {
    const n = nodeMap[nodeId] || virtualNodeMap[nodeId] || {};
    const ownDoctrineNodeId = n.doctrine_node_id || n.id || nodeId;
    const supportParents = supportParentMap[nodeId] || [];
    const parentId = supportParents[0] || primaryParentMap[nodeId] || null;
    const parent = parentId ? (nodeMap[parentId] || virtualNodeMap[parentId]) : null;
    const parentDoctrineNodeId = parent ? (parent.doctrine_node_id || parent.id) : null;
    const isSupportNode = SUPPORT_RELATIONSHIPS.has(n.type) || ['case_seed', 'statute', 'practice_direction', 'listing_rule'].includes(n.type);

    if (isSupportNode && parentDoctrineNodeId) {
      return {
        doctrineNodeId: parentDoctrineNodeId,
        selectedNodeId: nodeId,
        selectedLabel: n.label || nodeId,
        selectedCitation: n.neutral_citation || n.citation || '',
        selectedType: n.type || '',
        parentNodeId: parentId,
        parentLabel: parent.label || parentId,
        loadingText: `This is a ${String(n.type || 'support').replace(/_/g, ' ')} node. Checking paragraph evidence linked to parent doctrine node: ${parent.label || parentId}.`,
      };
    }

    return {
      doctrineNodeId: ownDoctrineNodeId,
      selectedNodeId: nodeId,
      selectedLabel: n.label || nodeId,
      selectedCitation: n.neutral_citation || n.citation || '',
      selectedType: n.type || '',
      parentNodeId: null,
      parentLabel: '',
      loadingText: 'Checking doctrine-linked case paragraphs and proposition cards.',
    };
  }

  function fetchBackendEvidence(doctrineNodeId, context) {
    const panel = document.getElementById('backend-evidence-panel');
    if (!panel || !doctrineNodeId) return;
    const token = ++evidenceFetchToken;

    fetch('/api/doctrine-evidence?node_id=' + encodeURIComponent(doctrineNodeId))
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (token !== evidenceFetchToken) return;
        if (response.status === 404) {
          renderBackendEvidence({
            doctrine_node_id: doctrineNodeId,
            coverage_status: 'no_evidence',
            warnings: ['doctrine_node_not_found', 'insufficient_authority'],
            evidence: [],
          }, context);
          return;
        }
        if (!response.ok) throw new Error(payload.error || 'backend_evidence_unavailable');
        renderBackendEvidence(payload, context);
      })
      .catch(() => {
        if (token !== evidenceFetchToken) return;
        renderBackendEvidence({
          doctrine_node_id: doctrineNodeId,
          coverage_status: 'no_evidence',
          warnings: ['backend_evidence_api_unavailable', 'insufficient_authority'],
          evidence: [],
        }, context);
      });
  }

  function renderBackendEvidence(payload, context) {
    const panel = document.getElementById('backend-evidence-panel');
    if (!panel) return;

    const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const coverage = payload.coverage_status || (evidence.length ? 'candidate_only' : 'no_evidence');
    const warningHtml = warnings.length
      ? `<div class="audit-warning-list">${warnings.map(w => `<span class="audit-warning">${esc(w)}</span>`).join('')}</div>`
      : '';

    let html = '<div class="audit-topline">';
    html += `<span class="coverage-badge ${escAttr(coverage)}">${esc(coverage)}</span>`;
    html += `<span class="audit-node-id">${esc(payload.doctrine_node_id || '')}</span>`;
    html += '</div>';
    if (context && context.parentNodeId) {
      html += '<div class="audit-context-note">';
      html += `<strong>${esc(context.selectedType.replace(/_/g, ' ') || 'support node')} selected:</strong> ${esc(context.selectedLabel)}. `;
      html += `Showing evidence linked to parent doctrine node <strong>${esc(context.parentLabel)}</strong>.`;
      html += '</div>';
    }
    html += warningHtml;

    if (!evidence.length) {
      html += '<div class="audit-empty">';
      html += '<strong>No verified paragraph proof yet.</strong>';
      html += '<p>This node is still a seed-layer doctrine node. Exact cases and paragraphs will appear here only after a validated proposition-node link exists in the backend.</p>';
      html += '</div>';
      panel.className = 'detail-audit-box';
      panel.innerHTML = html;
      return;
    }

    const focusedEvidence = getFocusedEvidence(evidence, context);
    if (context && context.parentNodeId && focusedEvidence.exactMatchCount === 0) {
      html += '<div class="audit-candidate-note">No backend paragraph proof is linked to this exact case seed yet. Showing the available evidence trail for its parent doctrine node.</div>';
    }
    const candidateCount = evidence.filter(item => item.answer_layer_status === 'candidate_only').length;
    if (candidateCount) {
      html += '<div class="audit-candidate-note">Candidate evidence only is not answer-safe and needs human review before legal reliance.</div>';
    }

    html += '<div class="evidence-list">';
    focusedEvidence.items.forEach(item => { html += renderEvidenceItem(item); });
    html += '</div>';

    panel.className = 'detail-audit-box has-evidence';
    panel.innerHTML = html;
  }

  function renderEvidenceItem(item) {
    const status = item.answer_layer_status || item.verification_status || 'candidate_only';
    const citation = [item.neutral_citation, item.court_level].filter(Boolean).join(' · ');
    const paraLabel = item.para_no ? `Paragraph ${item.para_no}` : 'Paragraph proof';
    let html = '<article class="evidence-card">';
    html += '<div class="evidence-card-header">';
    html += `<div><div class="evidence-case">${esc(item.case_name || item.case_id || 'Linked authority')}</div>`;
    if (citation) html += `<div class="evidence-meta">${esc(citation)}</div>`;
    html += '</div>';
    html += `<span class="coverage-badge ${escAttr(status)}">${esc(status)}</span>`;
    html += '</div>';
    html += `<div class="evidence-meta">${esc(paraLabel)} · ${esc(item.link_type || item.authority_role || 'candidate')}</div>`;
    if (item.proposition_text) {
      html += `<div class="evidence-proposition"><strong>Proposition:</strong> ${esc(item.proposition_text)}</div>`;
    }
    if (item.supporting_quote) {
      html += `<blockquote class="evidence-quote">${esc(item.supporting_quote)}</blockquote>`;
    } else if (item.paragraph_text) {
      html += `<blockquote class="evidence-quote">${esc(item.paragraph_text.slice(0, 360))}${item.paragraph_text.length > 360 ? '...' : ''}</blockquote>`;
    }
    if (item.source_url) {
      html += `<a class="evidence-link" href="${escAttr(item.source_url)}" target="_blank" rel="noopener">Open source paragraph</a>`;
    }
    html += '</article>';
    return html;
  }

  function getFocusedEvidence(evidence, context) {
    if (!context || context.selectedType !== 'case_seed') {
      return { items: evidence, exactMatchCount: evidence.length };
    }
    const selectedTerms = [
      context.selectedNodeId,
      context.selectedLabel,
      context.selectedCitation,
    ].filter(Boolean).map(normalizeEvidenceText);
    const matches = evidence.filter(item => {
      const haystack = normalizeEvidenceText([
        item.case_id,
        item.case_name,
        item.neutral_citation,
        item.proposition_id,
      ].filter(Boolean).join(' '));
      return selectedTerms.some(term => term && (haystack.includes(term) || term.includes(haystack)));
    });
    return { items: matches.length ? matches : evidence, exactMatchCount: matches.length };
  }

  function normalizeEvidenceText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
  }

  function collectNodeRefs(nodeId) {
    const result = { listingRules: [], statutes: [], cases: [], guidance: [], pds: [], crossRefs: [] };
    const n = nodeMap[nodeId] || virtualNodeMap[nodeId];
    if (!n) return result;

    function resolveRefs(refs) {
      return (refs || []).map(ref => {
        const rn = nodeMap[ref];
        return { id: ref, label: rn ? rn.label : ref, citation: rn ? rn.neutral_citation : null, rule_number: rn ? rn.rule_number : null };
      });
    }

    if (n.listing_rule_refs) result.listingRules = resolveRefs(n.listing_rule_refs);
    if (n.statute_refs) result.statutes = resolveRefs(n.statute_refs);
    if (n.case_seeds) result.cases = resolveRefs(n.case_seeds);
    if (n.guidance_refs) result.guidance = resolveRefs(n.guidance_refs);
    if (n.practice_direction_refs) result.pds = resolveRefs(n.practice_direction_refs);
    if (n.cross_refs) result.crossRefs = resolveRefs(n.cross_refs);

    return result;
  }

  function getAnyNode(nodeId) {
    return nodeMap[nodeId] || virtualNodeMap[nodeId] || null;
  }

  function isTypeVisible(n) {
    if (!n) return true;
    if (['domain', 'section_header', 'flow_group'].includes(n.type)) return true;
    return activeFilters.has(n.type);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '&#96;');
  }

  function getEmptyAuditMarkup() {
    const status = (currentDomain && (currentDomain.status || currentDomain.domainData.status)) || {};
    const verificationTag = status.needs_official_source_verification
      ? 'needs_official_source_verification'
      : 'needs_hklii_verification';
    return [
      '<div class="empty-audit">',
      '<div class="empty-audit-icon">Audit</div>',
      '<h2>Select a doctrine node</h2>',
      '<p>Open a section, principle, flow step, case seed, or source anchor to inspect status, support links, and paragraph-proof readiness.</p>',
      '<div class="empty-audit-tags">',
      '<span>not_product_answer_layer</span>',
      `<span>${verificationTag}</span>`,
      '<span>case audit pending</span>',
      '</div>',
      '</div>',
    ].join('');
  }

  // ── Search ──

  function handleSearch(query) {
    searchQuery = query.toLowerCase().trim();
    renderTree();
  }

  function applySearch() {
    const q = searchQuery;
    const allCards = document.querySelectorAll('.tree-card');
    const treeEls = document.querySelectorAll('.tree-node');

    allCards.forEach(card => {
      card.classList.remove('search-match', 'search-ancestor');
    });

    if (!q) {
      renderSearchResults([]);
      treeEls.forEach(el => {
        const node = getAnyNode(el.dataset.nodeId);
        el.style.display = isTypeVisible(node) ? '' : 'none';
      });
      return;
    }

    const matchingIds = new Set(allNodes.filter(n => isSearchMatch(n, q) && isTypeVisible(n)).map(n => n.id));
    const visibleTreeIds = new Set();
    const searchResults = [];

    matchingIds.forEach(id => {
      if (renderedTreeIds.has(id)) {
        addTreeMatchWithAncestors(id, visibleTreeIds);
      } else {
        const supportNode = nodeMap[id];
        if (supportNode) searchResults.push(supportNode);
        (supportParentMap[id] || []).forEach(parentId => addTreeMatchWithAncestors(parentId, visibleTreeIds, true));
      }
    });

    renderSearchResults(searchResults);

    treeEls.forEach(el => {
      const nid = el.dataset.nodeId;
      const node = getAnyNode(nid);
      const card = el.querySelector('.tree-card');
      const show = visibleTreeIds.has(nid) && isTypeVisible(node);
      el.style.display = show ? '' : 'none';
      if (!card) return;
      if (matchingIds.has(nid)) {
        card.classList.add('search-match');
      } else if (show) {
        card.classList.add('search-ancestor');
      }
    });

    visibleTreeIds.forEach(id => {
      let parentId = treeParentMap[id];
      while (parentId) {
        expandedIds.add(parentId);
        const childContainer = document.getElementById('children-' + parentId);
        if (childContainer) childContainer.classList.add('open');
        const toggleBtn = document.querySelector(`.tree-node[data-node-id="${parentId}"] .tree-toggle`);
        if (toggleBtn && !toggleBtn.classList.contains('leaf')) toggleBtn.innerHTML = '−';
        parentId = treeParentMap[parentId];
      }
    });
  }

  function isSearchMatch(n, q) {
    const fields = [
      n.id,
      n.label,
      n.summary,
      n.type,
      n.section,
      n.subsection,
      n.subtopic,
      n.neutral_citation,
      n.rule_number,
      n.rule_chapter,
      n.verification_status,
      n.authority_status,
      n.answer_layer_status,
      ...(n.statute_refs || []),
      ...(n.case_seeds || []),
      ...(n.listing_rule_refs || []),
      ...(n.guidance_refs || []),
      ...(n.practice_direction_refs || []),
      ...(n.cross_refs || []),
    ];
    return fields.some(field => String(field || '').toLowerCase().includes(q));
  }

  function addTreeMatchWithAncestors(id, visibleTreeIds) {
    if (!id) return;
    if (renderedTreeIds.has(id) || virtualNodeMap[id]) visibleTreeIds.add(id);
    let parentId = treeParentMap[id] || primaryParentMap[id];
    while (parentId) {
      visibleTreeIds.add(parentId);
      parentId = treeParentMap[parentId] || primaryParentMap[parentId];
    }
  }

  function renderSearchResults(nodes) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '';
    const safeNodes = (nodes || []).filter(Boolean);
    if (!searchQuery || safeNodes.length === 0) return;

    const title = document.createElement('div');
    title.className = 'search-results-title';
    title.textContent = `Support/Audit Matches (${safeNodes.length})`;
    resultsEl.appendChild(title);

    safeNodes.slice(0, 40).forEach(n => {
      const card = document.createElement('div');
      card.className = 'tree-card search-result-card search-match';
      card.dataset.nodeId = n.id;
      card.dataset.type = n.type;
      card.addEventListener('click', () => {
        selectedId = n.id;
        showNodeDetail(n.id);
        document.querySelectorAll('.tree-card.selected').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
      });

      const header = document.createElement('div');
      header.className = 'tree-card-header';
      const label = document.createElement('div');
      label.className = 'tree-card-label';
      label.textContent = n.label;
      header.appendChild(label);

      const badges = document.createElement('div');
      badges.className = 'tree-card-badges';
      const badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.style.background = typeColors[n.type] || '#6b7280';
      badge.textContent = n.type.replace(/_/g, ' ');
      badges.appendChild(badge);
      header.appendChild(badges);
      card.appendChild(header);

      const summary = document.createElement('div');
      summary.className = 'tree-card-summary';
      const linked = supportParentMap[n.id] || [];
      summary.innerHTML = `<strong>Audit:</strong> ${esc(n.summary || (linked.length ? 'Linked from: ' + linked.map(id => (nodeMap[id] || {}).label || id).join('; ') : 'Support/audit node.'))}`;
      card.appendChild(summary);
      resultsEl.appendChild(card);
    });

    if (safeNodes.length > 40) {
      const more = document.createElement('div');
      more.className = 'search-results-more';
      more.textContent = `${safeNodes.length - 40} more matches. Refine the search to narrow the audit list.`;
      resultsEl.appendChild(more);
    }
  }

  function runEvidenceSearch() {
    const input = document.getElementById('search-box');
    const statusEl = document.getElementById('ai-search-status');
    const resultsEl = document.getElementById('evidence-search-results');
    const query = (input.value || '').trim();
    if (!query) {
      statusEl.textContent = 'Enter a legal question or issue first.';
      resultsEl.innerHTML = '';
      return;
    }
    const token = ++evidenceSearchToken;
    statusEl.textContent = 'Searching graph nodes and backend evidence...';
    resultsEl.innerHTML = '<div class="evidence-search-loading">Building query → node → evidence trail...</div>';

    fetch('/api/search-evidence?q=' + encodeURIComponent(query))
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (token !== evidenceSearchToken) return;
        if (!response.ok) throw new Error(payload.error || 'search_failed');
        renderEvidenceSearchTrail(payload);
      })
      .catch(() => {
        if (token !== evidenceSearchToken) return;
        statusEl.textContent = 'Evidence search unavailable. Keyword tree search still works.';
        resultsEl.innerHTML = '<div class="evidence-search-empty">Backend search route is unavailable. The tree above is still filtered by keyword.</div>';
      });
  }

  function renderEvidenceSearchTrail(payload) {
    const statusEl = document.getElementById('ai-search-status');
    const resultsEl = document.getElementById('evidence-search-results');
    const matches = Array.isArray(payload.matched_doctrine_nodes) ? payload.matched_doctrine_nodes : [];
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const aiLabel = payload.ai_status === 'used' ? 'AI-ranked' : 'Fallback ranked';
    const analysisLabel = payload.analysis_status === 'used' ? 'analysis on' : 'analysis off';
    statusEl.textContent = `${aiLabel} · ${analysisLabel} · ${matches.length} node(s) · ${payload.evidence_count || 0} evidence item(s) · confidence: ${payload.answer_confidence || 'low'}`;

    let html = '<div class="evidence-search-summary">';
    html += `<span class="coverage-badge ${payload.ai_status === 'used' ? 'paragraph_verified' : 'candidate_only'}">${esc(aiLabel)}</span>`;
    if (payload.ai_provider) html += `<span class="coverage-badge paragraph_verified">${esc(payload.ai_provider)}</span>`;
    html += `<span class="coverage-badge ${escAttr(payload.backend_status || 'backend')}">${esc(payload.backend_status || 'backend')}</span>`;
    html += '</div>';
    if (warnings.length) {
      html += `<div class="audit-warning-list">${warnings.map(w => `<span class="audit-warning">${esc(w)}</span>`).join('')}</div>`;
    }
    if (payload.answer_note) {
      html += `<div class="evidence-search-note">${esc(payload.answer_note)}</div>`;
    }
    if (payload.inquiry_analysis) {
      html += renderInquiryAnalysis(payload.inquiry_analysis);
    }
    if (!matches.length) {
      html += '<div class="evidence-search-empty">No doctrine node matched this query. Try a more specific legal issue, statute, case name, or procedural stage.</div>';
      resultsEl.innerHTML = html;
      return;
    }

    html += '<div class="evidence-search-list">';
    matches.forEach(match => {
      html += '<article class="evidence-search-card">';
      html += '<div class="evidence-search-card-head">';
      html += `<div><div class="evidence-search-title">${esc(match.title || match.doctrine_node_id)}</div>`;
      html += `<div class="evidence-meta">${esc(match.domain_id || '')} · ${esc(match.node_type || '')} · score ${esc(match.match_score || '')}</div></div>`;
      html += `<span class="coverage-badge ${escAttr(match.coverage_status || 'no_evidence')}">${esc(match.coverage_status || 'no_evidence')}</span>`;
      html += '</div>';
      if (match.summary) html += `<div class="evidence-search-summary-text">${esc(match.summary)}</div>`;
      if (Array.isArray(match.matched_via) && match.matched_via.length) {
        html += `<div class="evidence-meta">Matched via: ${esc(match.matched_via.map(v => v.label || v.id).join('; '))}</div>`;
      }
      html += `<button class="open-node-btn" type="button" data-domain-id="${escAttr(match.domain_id)}" data-node-id="${escAttr(match.source_node_id)}">Open node in tree</button>`;
      const evidence = Array.isArray(match.evidence) ? match.evidence : [];
      if (!evidence.length) {
        html += '<div class="evidence-search-empty compact">No linked paragraph proof yet for this node.</div>';
      } else {
        html += '<div class="evidence-list">';
        evidence.slice(0, 3).forEach(item => { html += renderEvidenceItem(item); });
        html += '</div>';
      }
      html += '</article>';
    });
    html += '</div>';
    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll('.open-node-btn').forEach(btn => {
      btn.addEventListener('click', () => focusEvidenceSearchNode(btn.dataset.domainId, btn.dataset.nodeId));
    });
  }

  function renderInquiryAnalysis(analysis) {
    let html = '<section class="inquiry-analysis">';
    html += '<div class="inquiry-analysis-title">AI Analysis / Audit Summary</div>';
    if (analysis.abstain) html += '<div class="audit-candidate-note">The AI flagged this as insufficient for a reliable answer.</div>';
    if (analysis.summary) html += `<p><strong>Summary:</strong> ${esc(analysis.summary)}</p>`;
    if (analysis.legal_position) html += `<p><strong>Position:</strong> ${esc(analysis.legal_position)}</p>`;
    if (analysis.application) html += `<p><strong>Application:</strong> ${esc(analysis.application)}</p>`;
    if (Array.isArray(analysis.node_references) && analysis.node_references.length) {
      html += '<div class="analysis-chip-row">';
      analysis.node_references.slice(0, 6).forEach(ref => {
        html += `<span>${esc(ref.title || ref.doctrine_node_id || 'node')}</span>`;
      });
      html += '</div>';
    }
    if (Array.isArray(analysis.case_references) && analysis.case_references.length) {
      html += '<div class="analysis-case-list">';
      analysis.case_references.slice(0, 5).forEach(ref => {
        html += `<div>${esc([ref.case_name, ref.neutral_citation, ref.para_no, ref.status].filter(Boolean).join(' · '))}</div>`;
      });
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  function focusEvidenceSearchNode(domainId, nodeId) {
    if (!nodeId) return;
    if (currentDomain && currentDomain.domain_id === domainId && nodeMap[nodeId]) {
      focusDoctrineNode(nodeId);
      return;
    }
    const domain = availableDomains.find(d => d.domain_id === domainId);
    if (!domain) return;
    pendingFocusId = nodeId;
    const sel = document.getElementById('domain-select');
    sel.value = domainId;
    switchDomain(domain);
  }

  // ── Filters ──

  function handleFilterChange() {
    const checkboxes = document.querySelectorAll('#filter-list input[data-type]');
    activeFilters.clear();
    checkboxes.forEach(cb => {
      if (cb.checked) activeFilters.add(cb.dataset.type);
    });
    rerender();
  }

  function applyTypeFilters() {
    document.querySelectorAll('.tree-node').forEach(el => {
      const n = getAnyNode(el.dataset.nodeId);
      el.style.display = isTypeVisible(n) ? '' : 'none';
    });
  }

  // ── Depth Control ──

  function handleDepthChange(depth) {
    currentDepth = depth;
    document.querySelectorAll('.depth-buttons button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.depth-buttons button[data-depth="${depth}"]`)?.classList.add('active');
    if (depth === 99) {
      expandAll();
    } else {
      collapseToDepth(depth);
    }
  }

  // ── Section List ──

  function populateSectionList() {
    const list = document.getElementById('section-list');
    list.innerHTML = '';
    const sections = {};
    manifestSections.forEach(section => {
      sections[section.id] = { count: 0, title: section.title || ('Section ' + section.id) };
    });
    allNodes.forEach(n => {
      if (!n.section) return;
      if (!sections[n.section]) sections[n.section] = { count: 0, title: n.section_title || ('Section ' + n.section) };
      if (n.type !== 'section_header') sections[n.section].count++;
    });
    Object.keys(sections).sort().forEach(key => {
      const s = sections[key];
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = `${key}. ${s.title}`;
      li.appendChild(span);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${s.count} items`;
      li.appendChild(count);
      li.addEventListener('click', function() {
        document.querySelectorAll('#section-list li').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        navigateToSection(key);
      });
      list.appendChild(li);
    });
  }

  function navigateToSection(sectionId) {
    const headerNode = allNodes.find(n => n.section === sectionId && n.type === 'section_header');
    if (headerNode) {
      expandAll();
      selectedId = headerNode.id;
      rerender();
      setTimeout(() => {
        const card = document.querySelector(`.tree-node[data-node-id="${headerNode.id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  // ── Flow Player ──

  function populateFlows() {
    const sel = document.getElementById('flow-select');
    const selected = sel.value;
    sel.innerHTML = '<option value="">Select a flow</option>';
    allFlows.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.flow_id;
      opt.textContent = f.title;
      sel.appendChild(opt);
    });
    if (selected && allFlows.some(f => f.flow_id === selected)) sel.value = selected;
  }

  function getCurrentFlow() {
    const sel = document.getElementById('flow-select');
    return allFlows.find(f => f.flow_id === sel.value);
  }

  function resetFlow() {
    if (flowInterval) { clearInterval(flowInterval); flowInterval = null; }
    currentFlowStep = -1;
    document.getElementById('flow-step-indicator').textContent = '0 / 0';
    document.getElementById('flow-step-info').textContent = '';
    document.getElementById('flow-prev').disabled = true;
    document.getElementById('flow-next').disabled = true;
    document.getElementById('flow-play').disabled = true;
    document.getElementById('flow-reset').disabled = true;
    document.querySelectorAll('.tree-card.flow-highlight').forEach(el => el.classList.remove('flow-highlight'));
    const sel = document.getElementById('flow-select');
    if (sel.value) {
      document.getElementById('flow-next').disabled = false;
      document.getElementById('flow-play').disabled = false;
      document.getElementById('flow-reset').disabled = false;
    }
  }

  function highlightFlowStep(stepIdx) {
    const flow = getCurrentFlow();
    if (!flow) return;
    const stepId = flow.steps[stepIdx];
    const n = nodeMap[stepId];
    document.getElementById('flow-step-indicator').textContent = `${stepIdx + 1} / ${flow.steps.length}`;
    document.getElementById('flow-step-info').textContent = n ? `${stepIdx + 1}. ${n.label}` : stepId;
    document.getElementById('flow-prev').disabled = stepIdx === 0;

    document.querySelectorAll('.tree-card.flow-highlight').forEach(el => el.classList.remove('flow-highlight'));
    const card = document.querySelector(`.tree-node[data-node-id="${stepId}"] .tree-card`);
    if (card) {
      let parent = card.closest('.tree-children');
      while (parent) {
        parent.classList.add('open');
        if (parent.id && parent.id.startsWith('children-')) expandedIds.add(parent.id.replace('children-', ''));
        parent = parent.parentElement ? parent.parentElement.closest('.tree-children') : null;
      }
      card.classList.add('flow-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (n) {
      selectedId = stepId;
      document.querySelectorAll('.tree-card.selected').forEach(el => el.classList.remove('selected'));
      if (card) card.classList.add('selected');
      showNodeDetail(stepId);
    }
  }

  // ── Event Listeners Setup ──

  function setupEventListeners() {
    if (controlsBound) return;
    controlsBound = true;
    document.getElementById('expand-all-btn').addEventListener('click', expandAll);
    document.getElementById('collapse-btn').addEventListener('click', collapseAll);
    document.querySelectorAll('.depth-buttons button').forEach(btn => {
      btn.addEventListener('click', function() { handleDepthChange(parseInt(this.dataset.depth)); });
    });
    document.getElementById('search-box').addEventListener('input', function() { handleSearch(this.value); });
    document.getElementById('search-box').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runEvidenceSearch();
      }
    });
    document.getElementById('ai-search-btn').addEventListener('click', runEvidenceSearch);
    document.getElementById('flow-select').addEventListener('change', function() {
      resetFlow();
      const flow = getCurrentFlow();
      if (flow) {
        document.getElementById('flow-next').disabled = false;
        document.getElementById('flow-play').disabled = false;
        document.getElementById('flow-reset').disabled = false;
      }
    });
    document.getElementById('flow-next').addEventListener('click', function() {
      const flow = getCurrentFlow();
      if (!flow) return;
      if (currentFlowStep < flow.steps.length - 1) { currentFlowStep++; highlightFlowStep(currentFlowStep); }
    });
    document.getElementById('flow-prev').addEventListener('click', function() {
      if (currentFlowStep > 0) { currentFlowStep--; highlightFlowStep(currentFlowStep); }
    });
    document.getElementById('flow-play').addEventListener('click', function() {
      if (flowInterval) {
        clearInterval(flowInterval); flowInterval = null;
        this.textContent = '\u25b6 Play'; return;
      }
      const flow = getCurrentFlow();
      if (!flow) return;
      this.textContent = '\u23f8 Pause';
      flowInterval = setInterval(() => {
        if (currentFlowStep < flow.steps.length - 1) { currentFlowStep++; highlightFlowStep(currentFlowStep); }
        else { clearInterval(flowInterval); flowInterval = null; document.getElementById('flow-play').textContent = '\u25b6 Play'; }
      }, 2000);
    });
    document.getElementById('flow-reset').addEventListener('click', resetFlow);
  }

  // ── Status Bar ──

  function updateStatusBar() {
    document.getElementById('status-nodes').textContent = 'Nodes: ' + allNodes.length;
    document.getElementById('status-edges').textContent = 'Edges: ' + allEdges.length;
    document.getElementById('status-sections').textContent = 'Sections: ' + manifestSections.length;
    document.getElementById('status-flows').textContent = 'Flows: ' + allFlows.length;
  }

  // ── Init ──

  function init() {
    document.getElementById('status-selected').textContent = 'Loading registry...';
    loadDomainRegistry().catch(err => {
      document.getElementById('status-selected').textContent = 'Error loading registry';
      document.getElementById('detail-content').innerHTML =
        `<p style="color:#ef4444">Failed to load domain registry.<br>Try serving via HTTP:<br><code>python3 -m http.server 8080</code></p>`;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
