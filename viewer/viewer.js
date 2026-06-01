(function() {
  'use strict';

  const TYPE_COLORS = {
    domain: '#1a1a2e',
    section_header: '#475569',
    legal_issue: '#2266cc',
    statute: '#2d8a4e',
    case_seed: '#7b2d8e',
    flow_step: '#d97706',
    flow_group: '#b45309',
    practice_direction: '#0e7490',
    gap: '#6b7280',
    restricted_nsl: '#dc2626',
  };

  const TYPE_ORDER = {
    section_header: 0,
    legal_issue: 1,
    restricted_nsl: 2,
    practice_direction: 3,
    flow_group: 4,
    flow_step: 5,
    statute: 3,
    case_seed: 4,
    gap: 7,
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
  let activeFilters = new Set(['legal_issue', 'flow_step', 'statute', 'case_seed', 'practice_direction', 'restricted_nsl']);
  let currentDepth = 2;
  let searchQuery = '';

  // ── Data Loading ──

  function loadJSON(path) { return fetch(path).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  function loadAllData() {
    return loadJSON(CONSOLIDATED_PATH).then(manifest => {
      manifestSections = manifest.sections || [];
      const sectionPromises = manifest.sections.map(s => {
        const nodeP = loadJSON(DATA_BASE + s.node_file).then(d => d.nodes || []);
        const edgeP = loadJSON(DATA_BASE + s.edge_file).then(d => d.edges || []);
        return Promise.all([nodeP, edgeP]).then(([nodes, edges]) => {
          allNodes = allNodes.concat(nodes);
          allEdges = allEdges.concat(edges);
        });
      });
      const flowP = loadJSON(DATA_BASE + manifest.flows_file).then(d => { allFlows = d.flows || []; });
      return Promise.all([Promise.all(sectionPromises), flowP]);
    }).then(() => {
      allNodes.forEach(n => { nodeMap[n.id] = n; });
      allEdges.forEach(e => {
        if (!edgeFromMap[e.from]) edgeFromMap[e.from] = [];
        edgeFromMap[e.from].push(e);
        if (e.relationship === 'has_subtopic') {
          if (!primaryChildrenMap[e.from]) primaryChildrenMap[e.from] = [];
          primaryChildrenMap[e.from].push(e.to);
          primaryParentMap[e.to] = e.from;
        } else if (['statutory_anchor', 'case_seed', 'practice_direction_ref', 'cross_reference'].includes(e.relationship)) {
          if (!supportParentMap[e.to]) supportParentMap[e.to] = [];
          supportParentMap[e.to].push(e.from);
        }
      });
    });
  }

  // ── Tree Model Builder ──

  function buildTreeModel() {
    const sectionHeaders = {};
    const flowSteps = {};
    virtualNodeMap = {};
    treeParentMap = {};
    renderedTreeIds = new Set();

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

      children.push(makeNode(header, 1, sectionChildren, 'criminal_procedure_hk_root'));
    });

    const rootData = {
      id: 'criminal_procedure_hk_root',
      label: 'Hong Kong Criminal Procedure',
      type: 'domain',
      summary: 'Complete principle-flow map covering every procedural stage from jurisdiction to final appeal.',
      verification_status: 'not_product_answer_layer',
      answer_layer_status: 'not_product_answer_layer',
      authority_status: 'unverified_case_seed',
    };
    virtualNodeMap[rootData.id] = rootData;
    treeModel = {
      id: rootData.id,
      label: rootData.label,
      type: rootData.type,
      color: '#1a1a2e',
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
      color: TYPE_COLORS[node.type] || '#6b7280',
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
    tb.textContent = tNode.type.replace('_', ' ');
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

    if (nd && nd.authority_status === 'unverified_case_seed') {
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

    if (nd && nd.summary) {
      const summary = document.createElement('div');
      summary.className = 'tree-card-summary';
      summary.textContent = nd.summary;
      card.appendChild(summary);
    }

    container.appendChild(card);

    if (isExpandable) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children' + (isExpanded ? ' open' : '');
      childContainer.id = 'children-' + tNode.id;

      tNode.children.forEach(child => {
        const childEl = renderTreeNode(child, depth + 1, false);
        childContainer.appendChild(childEl);
      });

      if (isRoot) {
        container.appendChild(childContainer);
      } else {
        container.appendChild(childContainer);
      }
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
    if ((nd.practice_direction_refs || []).length) counts.push(nd.practice_direction_refs.length + ' PDs');
    if (nd.type === 'gap') counts.push('gap');
    return counts;
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
    const colors = TYPE_COLORS;
    const typeColor = colors[n.type] || '#6b7280';

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += `<span class="type-badge" style="background:${typeColor}">${esc(n.type)}</span>`;
    html += `<h2>${esc(n.label)}</h2>`;
    if (n.neutral_citation) html += `<div class="subtitle">${esc(n.neutral_citation)}</div>`;
    html += '</div>';

    // Status badges
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

    // Summary
    if (n.summary) {
      html += `<div class="detail-section"><div class="detail-summary">${esc(n.summary)}</div></div>`;
    }

    // Metadata
    html += '<div class="detail-section"><div class="detail-section-title">Metadata</div><div class="detail-meta">';
    html += `<div class="detail-meta-row"><span class="detail-meta-label">ID</span><span class="detail-meta-value">${esc(n.id)}</span></div>`;
    if (n.section) html += `<div class="detail-meta-row"><span class="detail-meta-label">Section</span><span class="detail-meta-value">${esc(n.section)}</span></div>`;
    if (n.subtopic) html += `<div class="detail-meta-row"><span class="detail-meta-label">Subtopic</span><span class="detail-meta-value">${esc(n.subtopic)}</span></div>`;
    if (n.subsection) html += `<div class="detail-meta-row"><span class="detail-meta-label">Subsection</span><span class="detail-meta-value">${esc(n.subsection)}</span></div>`;
    html += '</div></div>';

    // Statute Refs
    if (allRefs.statutes.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Statute References (' + allRefs.statutes.length + ')</div><ul class="detail-ref-list">';
      allRefs.statutes.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    // Case Seeds
    if (allRefs.cases.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Case Seeds (' + allRefs.cases.length + ')</div><ul class="detail-ref-list">';
      allRefs.cases.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}${ref.citation ? ' · ' + esc(ref.citation) : ''}</span></li>`;
      });
      html += '</ul></div>';
    }

    // Practice Directions
    if (allRefs.pds.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Practice Directions (' + allRefs.pds.length + ')</div><ul class="detail-ref-list">';
      allRefs.pds.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    // Cross References
    if (allRefs.crossRefs.length) {
      html += '<div class="detail-section"><div class="detail-section-title">Cross-References (' + allRefs.crossRefs.length + ')</div><ul class="detail-ref-list">';
      allRefs.crossRefs.forEach(ref => {
        html += `<li data-ref-id="${escAttr(ref.id)}"><span class="ref-label">${esc(ref.label)}</span><span class="ref-type">${esc(ref.id)}</span></li>`;
      });
      html += '</ul></div>';
    }

    // Case Audit / Source Proof (future-proof placeholder)
    html += '<div class="detail-section"><div class="detail-section-title">Case Audit / Source Proof</div>';
    html += '<div class="detail-audit-box">';
    html += '<strong>No verified paragraph proof yet.</strong> This is a seed-layer node requiring HKLII / official-source verification.';
    html += '<div style="margin-top:6px;font-size:9px;color:#71717a">Fields pending: paragraph_anchors · source_proofs · treatment_edges · retrieval_hooks · human_review_status · expansion_status</div>';
    html += '</div></div>';

    document.getElementById('detail-content').innerHTML = html;
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

  function collectNodeRefs(nodeId) {
    const result = { statutes: [], cases: [], pds: [], crossRefs: [] };
    const n = nodeMap[nodeId] || virtualNodeMap[nodeId];
    if (!n) return result;

    function resolveRefs(refs) {
      return (refs || []).map(ref => {
        const rn = nodeMap[ref];
        return { id: ref, label: rn ? rn.label : ref, citation: rn ? rn.neutral_citation : null };
      });
    }

    if (n.statute_refs) result.statutes = resolveRefs(n.statute_refs);
    if (n.case_seeds) result.cases = resolveRefs(n.case_seeds);
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
        searchResults.push(nodeMap[id]);
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
      n.verification_status,
      n.authority_status,
      n.answer_layer_status,
      ...(n.statute_refs || []),
      ...(n.case_seeds || []),
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
    if (!searchQuery || nodes.length === 0) return;

    const title = document.createElement('div');
    title.className = 'search-results-title';
    title.textContent = `Support/Audit Matches (${nodes.length})`;
    resultsEl.appendChild(title);

    nodes.slice(0, 40).forEach(n => {
      const card = document.createElement('div');
      card.className = 'tree-card search-result-card search-match';
      card.dataset.nodeId = n.id;
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
      badge.style.background = TYPE_COLORS[n.type] || '#6b7280';
      badge.textContent = n.type.replace('_', ' ');
      badges.appendChild(badge);
      header.appendChild(badges);
      card.appendChild(header);

      const summary = document.createElement('div');
      summary.className = 'tree-card-summary';
      const linked = supportParentMap[n.id] || [];
      summary.textContent = n.summary || (linked.length ? 'Linked from: ' + linked.map(id => (nodeMap[id] || {}).label || id).join('; ') : 'Support/audit node.');
      card.appendChild(summary);
      resultsEl.appendChild(card);
    });

    if (nodes.length > 40) {
      const more = document.createElement('div');
      more.className = 'search-results-more';
      more.textContent = `${nodes.length - 40} more matches. Refine the search to narrow the audit list.`;
      resultsEl.appendChild(more);
    }
  }

  // ── Filters ──

  function handleFilterChange() {
    const checkboxes = document.querySelectorAll('#filter-box input[data-type]');
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
    sel.innerHTML = '<option value="">— Select a flow —</option>';
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

  // ── Status Bar ──

  function updateStatusBar() {
    document.getElementById('status-nodes').textContent = 'Nodes: ' + allNodes.length;
    document.getElementById('status-edges').textContent = 'Edges: ' + allEdges.length;
    document.getElementById('status-sections').textContent = 'Sections: ' + manifestSections.length;
    document.getElementById('status-flows').textContent = 'Flows: ' + allFlows.length;
  }

  // ── Init ──

  function init() {
    document.getElementById('status-selected').textContent = 'Loading...';

    loadAllData().then(() => {
      buildTreeModel();

      expandedIds.add(treeModel.id);
      treeModel.children.forEach(c => expandedIds.add(c.id));

      renderTree();
      applyTypeFilters();

      document.getElementById('expand-all-btn').addEventListener('click', expandAll);
      document.getElementById('collapse-btn').addEventListener('click', collapseAll);
      document.querySelectorAll('.depth-buttons button').forEach(btn => {
        btn.addEventListener('click', function() { handleDepthChange(parseInt(this.dataset.depth)); });
      });
      document.querySelectorAll('#filter-box input[data-type]').forEach(cb => {
        cb.addEventListener('change', handleFilterChange);
      });
      document.getElementById('search-box').addEventListener('input', function() { handleSearch(this.value); });

      document.getElementById('status-selected').textContent = 'Ready · Tree view';
    }).catch(err => {
      document.getElementById('status-selected').textContent = 'Error loading data';
      document.getElementById('detail-content').innerHTML =
        `<p style="color:#ef4444">Failed to load map data.<br>Try serving via HTTP:<br><code>python3 -m http.server 8080</code></p>`;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
