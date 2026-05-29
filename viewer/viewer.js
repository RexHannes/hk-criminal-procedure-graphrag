(function() {
  'use strict';

  const CONSOLIDATED_PATH = '../data/legal_domain_packs/demo_maps/criminal_procedure_hk/consolidated.json';
  const DATA_BASE = '../data/legal_domain_packs/demo_maps/criminal_procedure_hk/';

  const NODE_COLORS = {
    domain:         { background: '#1a1a2e', border: '#2d2d4e' },
    section_header: { background: '#6b7280', border: '#9ca3af' },
    legal_issue:    { background: '#2266cc', border: '#3b82f6' },
    statute:        { background: '#2d8a4e', border: '#22c55e' },
    case_seed:      { background: '#7b2d8e', border: '#a855f7' },
    flow_step:      { background: '#d97706', border: '#f59e0b' },
    practice_direction: { background: '#0e7490', border: '#06b6d4' },
    gap:            { background: '#6b7280', border: '#9ca3af' },
    restricted_nsl: { background: '#dc2626', border: '#ef4444' },
  };

  const NODE_SHAPES = {
    domain:         'hexagon',
    section_header: 'box',
    legal_issue:    'ellipse',
    statute:        'diamond',
    case_seed:      'star',
    flow_step:      'ellipse',
    practice_direction: 'square',
    gap:            'triangle',
    restricted_nsl: 'octagon',
  };

  let allNodes = [];
  let allEdges = [];
  let allFlows = [];
  let network = null;
  let flowInterval = null;
  let currentFlowStep = -1;

  const nodeMap = {};

  // --- Data Loading ---

  function loadJSON(path) {
    return fetch(path).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadAllData() {
    return loadJSON(CONSOLIDATED_PATH).then(manifest => {
      const sectionPromises = manifest.sections.map(s => {
        const nodeP = loadJSON(DATA_BASE + s.node_file).then(d => d.nodes || []);
        const edgeP = loadJSON(DATA_BASE + s.edge_file).then(d => d.edges || []);
        return Promise.all([nodeP, edgeP]).then(([nodes, edges]) => {
          allNodes = allNodes.concat(nodes);
          allEdges = allEdges.concat(edges);
        });
      });
      const flowP = loadJSON(DATA_BASE + manifest.flows_file).then(d => {
        allFlows = d.flows || [];
      });
      return Promise.all([Promise.all(sectionPromises), flowP]);
    });
  }

  // --- Graph Building ---

  function buildGraph() {
    allNodes.forEach(n => { nodeMap[n.id] = n; });

    const visNodes = allNodes.map(n => {
      const colors = NODE_COLORS[n.type] || NODE_COLORS.legal_issue;
      const size = n.type === 'section_header' ? 30 : n.type === 'flow_step' ? 20 : 25;
      return {
        id: n.id,
        label: n.label.length > 40 ? n.label.substring(0, 38) + '...' : n.label,
        title: n.label,
        color: colors,
        shape: NODE_SHAPES[n.type] || 'ellipse',
        size: size,
        font: { color: '#e2e8f0', size: n.type === 'section_header' ? 11 : 10 },
        borderWidth: 1,
      };
    });

    const visEdges = allEdges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.relationship,
      color: { color: '#475569', highlight: '#3b82f6' },
      font: { size: 8, color: '#64748b', strokeWidth: 0 },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      smooth: { type: 'curvedCW', roundness: 0.1 },
      width: 1,
    }));

    const container = document.getElementById('graph-container');
    const data = {
      nodes: new vis.DataSet(visNodes),
      edges: new vis.DataSet(visEdges),
    };
    const options = {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.005, springLength: 180, springConstant: 0.02, damping: 0.4 },
        stabilization: { iterations: 200 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        navigationButtons: true,
        keyboard: true,
      },
      edges: { smooth: { type: 'curvedCW', roundness: 0.1 } },
    };

    network = new vis.Network(container, data, options);
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        showNodeDetail(params.nodes[0]);
      }
    });

    updateStatusBar();
    populateSectionTree();
    populateFlows();
  }

  // --- Detail Panel ---

  function showNodeDetail(nodeId) {
    const n = nodeMap[nodeId];
    if (!n) return;
    const colors = NODE_COLORS[n.type] || NODE_COLORS.legal_issue;
    const el = document.getElementById('detail-content');
    let html = `<div class="type-badge" style="background:${colors.background}">${n.type}</div>`;
    html += `<h2>${n.label}</h2>`;
    if (n.summary) html += `<p style="margin:6px 0 12px;color:#cbd5e1;">${n.summary}</p>`;
    html += `<div class="meta"><span class="meta-label">ID: </span><span class="meta-value">${n.id}</span></div>`;
    if (n.section) html += `<div class="meta"><span class="meta-label">Section: </span><span class="meta-value">${n.section}</span></div>`;
    if (n.subtopic) html += `<div class="meta"><span class="meta-label">Subtopic: </span><span class="meta-value">${n.subtopic}</span></div>`;
    if (n.verification_status) html += `<div class="meta"><span class="meta-label">Verification: </span><span class="meta-value" style="color:${n.verification_status === 'needs_official_source_verification' ? '#f59e0b' : '#ef4444'}">${n.verification_status}</span></div>`;
    if (n.authority_status) html += `<div class="meta"><span class="meta-label">Authority: </span><span class="meta-value" style="color:#ef4444">${n.authority_status}</span></div>`;
    if (n.answer_layer_status) html += `<div class="meta"><span class="meta-label">Answer Layer: </span><span class="meta-value" style="color:#ef4444">${n.answer_layer_status}</span></div>`;
    if (n.neutral_citation) html += `<div class="meta"><span class="meta-label">Citation: </span><span class="meta-value">${n.neutral_citation}</span></div>`;

    if (n.statute_refs && n.statute_refs.length) {
      html += `<div class="meta"><span class="meta-label">Statute Refs:</span><ul class="ref-list">`;
      n.statute_refs.forEach(ref => {
        const refNode = nodeMap[ref];
        html += `<li>${refNode ? refNode.label : ref}</li>`;
      });
      html += `</ul></div>`;
    }
    if (n.case_seeds && n.case_seeds.length) {
      html += `<div class="meta"><span class="meta-label">Case Seeds:</span><ul class="ref-list">`;
      n.case_seeds.forEach(ref => {
        const refNode = nodeMap[ref];
        html += `<li>${refNode ? refNode.label : ref}</li>`;
      });
      html += `</ul></div>`;
    }
    if (n.practice_direction_refs && n.practice_direction_refs.length) {
      html += `<div class="meta"><span class="meta-label">PD Refs:</span><ul class="ref-list">`;
      n.practice_direction_refs.forEach(ref => {
        const refNode = nodeMap[ref];
        html += `<li>${refNode ? refNode.label : ref}</li>`;
      });
      html += `</ul></div>`;
    }
    if (n.cross_refs && n.cross_refs.length) {
      html += `<div class="meta"><span class="meta-label">Cross Refs:</span><ul class="ref-list">`;
      n.cross_refs.forEach(ref => html += `<li>${ref}</li>`);
      html += `</ul></div>`;
    }

    el.innerHTML = html;
    document.getElementById('status-selected').textContent = 'Selected: ' + n.id;
  }

  // --- Section Tree ---

  function populateSectionTree() {
    const list = document.getElementById('section-list');
    const sections = {};
    allNodes.forEach(n => {
      if (!n.section) return;
      if (!sections[n.section]) sections[n.section] = { count: 0, label: n.section_title || ('Section ' + n.section) };
      if (n.type !== 'section_header') sections[n.section].count++;
    });
    Object.keys(sections).sort().forEach(key => {
      const s = sections[key];
      const li = document.createElement('li');
      li.textContent = `${key}. ${s.label}`;
      const span = document.createElement('span');
      span.className = 'count';
      span.textContent = `${s.count} nodes`;
      li.appendChild(span);
      li.addEventListener('click', function() {
        document.querySelectorAll('#section-list li').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        filterBySection(key);
      });
      list.appendChild(li);
    });
  }

  function filterBySection(sectionId) {
    const ids = allNodes.filter(n => n.section === sectionId && n.type !== 'section_header').map(n => n.id);
    const edgeIds = allEdges.filter(e => ids.includes(e.from) || ids.includes(e.to)).map((e, i) => i);
    network.selectNodes(ids, false);
    if (ids.length > 0) {
      network.focus(ids[0], { scale: 1.5, animation: true });
    }
  }

  // --- Search ---

  document.getElementById('search-box').addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    if (!q) {
      network.selectNodes([], false);
      return;
    }
    const matchingIds = allNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.summary && n.summary.toLowerCase().includes(q)) ||
      n.id.toLowerCase().includes(q)
    ).map(n => n.id);
    network.selectNodes(matchingIds, false);
    if (matchingIds.length > 0) {
      network.focus(matchingIds[0], { scale: 2.0, animation: true });
    }
  });

  // --- Flow Player ---

  function populateFlows() {
    const sel = document.getElementById('flow-select');
    allFlows.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.flow_id;
      opt.textContent = f.title;
      sel.appendChild(opt);
    });
  }

  function getCurrentFlow() {
    const sel = document.getElementById('flow-select');
    return allFlows.find(f => f.flow_id === sel.value);
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
    if (currentFlowStep < flow.steps.length - 1) {
      currentFlowStep++;
      highlightFlowStep(currentFlowStep);
    }
  });

  document.getElementById('flow-prev').addEventListener('click', function() {
    if (currentFlowStep > 0) {
      currentFlowStep--;
      highlightFlowStep(currentFlowStep);
    }
  });

  document.getElementById('flow-play').addEventListener('click', function() {
    if (flowInterval) {
      clearInterval(flowInterval);
      flowInterval = null;
      this.textContent = '\u25b6 Play';
      return;
    }
    const flow = getCurrentFlow();
    if (!flow) return;
    this.textContent = '\u23f8 Pause';
    flowInterval = setInterval(() => {
      if (currentFlowStep < flow.steps.length - 1) {
        currentFlowStep++;
        highlightFlowStep(currentFlowStep);
      } else {
        clearInterval(flowInterval);
        flowInterval = null;
        document.getElementById('flow-play').textContent = '\u25b6 Play';
      }
    }, 2000);
  });

  document.getElementById('flow-reset').addEventListener('click', resetFlow);

  function resetFlow() {
    if (flowInterval) {
      clearInterval(flowInterval);
      flowInterval = null;
      document.getElementById('flow-play').textContent = '\u25b6 Play';
    }
    currentFlowStep = -1;
    document.getElementById('flow-step-indicator').textContent = '0 / 0';
    document.getElementById('flow-step-info').textContent = '';
    document.getElementById('flow-prev').disabled = true;
    document.getElementById('flow-next').disabled = true;
    document.getElementById('flow-play').disabled = true;
    document.getElementById('flow-reset').disabled = true;
    const sel = document.getElementById('flow-select');
    if (sel.value) {
      document.getElementById('flow-next').disabled = false;
      document.getElementById('flow-play').disabled = false;
      document.getElementById('flow-reset').disabled = false;
    }
    network.selectNodes([], false);
    network.setOptions({ physics: { enabled: true } });
  }

  function highlightFlowStep(stepIdx) {
    const flow = getCurrentFlow();
    if (!flow) return;
    const stepId = flow.steps[stepIdx];
    const node = nodeMap[stepId];
    document.getElementById('flow-step-indicator').textContent = `${stepIdx + 1} / ${flow.steps.length}`;
    document.getElementById('flow-step-info').textContent = node ? `${stepIdx + 1}. ${node.label}` : stepId;
    document.getElementById('flow-prev').disabled = stepIdx === 0;

    network.selectNodes([stepId], false);
    network.focus(stepId, { scale: 2.5, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    showNodeDetail(stepId);

    const connectedEdges = network.getConnectedEdges(stepId);
    const allEdgeIds = [];
    for (let i = 0; i <= stepIdx; i++) {
      const prevId = flow.steps[i];
      const nextId = flow.steps[i + 1];
      if (!nextId) break;
      const edgeIds = network.getConnectedEdges(prevId);
      edgeIds.forEach(eid => {
        const edge = allEdges[eid];
        if (edge && edge.from === prevId && edge.to === nextId) allEdgeIds.push(eid);
      });
    }
  }

  // --- Status Bar ---

  function updateStatusBar() {
    const totalNodes = allNodes.length;
    const totalEdges = allEdges.length;
    const verified = allNodes.filter(n => n.verification_status === 'verified').length;
    const unverified = allNodes.filter(n => n.verification_status && n.verification_status !== 'verified').length;
    document.getElementById('status-nodes').textContent = 'Nodes: ' + totalNodes;
    document.getElementById('status-edges').textContent = 'Edges: ' + totalEdges;
    document.getElementById('status-verified').textContent = 'Verified: ' + verified;
    document.getElementById('status-unverified').textContent = 'Unverified: ' + unverified;
  }

  // --- Init ---

  function init() {
    const statusEl = document.getElementById('status-selected');
    statusEl.textContent = 'Loading...';
    loadAllData().then(() => {
      buildGraph();
      statusEl.textContent = 'Ready';
    }).catch(err => {
      statusEl.textContent = 'Error loading data: ' + err.message;
      document.getElementById('detail-content').innerHTML =
        `<p style="color:#ef4444">Failed to load map data.<br>Try serving via HTTP:<br><code>python3 -m http.server 8080</code><br>Then open http://localhost:8080/viewer/</p>`;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
