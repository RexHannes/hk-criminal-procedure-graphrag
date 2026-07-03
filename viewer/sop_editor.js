/* SOP editing prototype — local HITL wiki workflow.
   Proposals are seeded from data/firm_overlay/demo_firm_sop_reviews.json and
   persisted to localStorage. No production auth; this proves the editable
   SOP / review-queue workflow: propose -> compare -> approve/reject -> changelog. */

(function () {
  'use strict';

  const STORAGE_KEY = 'hk_graphrag_sop_proposals_v1';
  const state = { proposals: [], seeded: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function nowIso() { return new Date().toISOString(); }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) { return []; }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.proposals)); } catch (err) { /* demo only */ }
    document.dispatchEvent(new CustomEvent('sop-proposals-changed'));
  }

  function init(seedUrl) {
    const stored = loadStored();
    return fetch(seedUrl).then(r => (r.ok ? r.json() : { proposals: [] })).catch(() => ({ proposals: [] }))
      .then(seed => {
        const seedProposals = seed.proposals || [];
        const byId = new Map(seedProposals.map(p => [p.proposal_id, p]));
        for (const p of stored) byId.set(p.proposal_id, p);
        state.proposals = [...byId.values()];
        state.seeded = true;
        return state.proposals;
      });
  }

  function proposals() { return state.proposals.slice(); }
  function proposalsForSop(sopId) { return state.proposals.filter(p => p.sop_id === sopId); }

  function saveProposal({ sop, block, newText, reviewer, authorities, note }) {
    const proposal = {
      proposal_id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sop_id: sop.sop_id,
      sop_title: sop.title,
      block_id: block.block_id,
      block_title: block.title,
      base_version: block.version || sop.version || '1.0',
      old_text: block.instruction,
      new_text: newText,
      status: 'proposed',
      proposed_by: reviewer || 'demo user',
      reviewer: null,
      linked_authorities: authorities || [],
      note: note || '',
      created_at: nowIso(),
      changelog: [{ at: nowIso(), by: reviewer || 'demo user', action: 'proposed', note: note || 'Edit proposed via viewer.' }],
    };
    state.proposals.unshift(proposal);
    persist();
    return proposal;
  }

  function setStatus(proposalId, status, reviewer, note) {
    const proposal = state.proposals.find(p => p.proposal_id === proposalId);
    if (!proposal) return null;
    proposal.status = status;
    proposal.reviewer = reviewer || 'demo partner';
    proposal.changelog.push({ at: nowIso(), by: proposal.reviewer, action: status, note: note || '' });
    persist();
    return proposal;
  }

  function exportQueue() {
    const payload = { exported_at: nowIso(), proposals: state.proposals };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sop_review_queue_export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Word-level diff (LCS) for compare view.
  function diffWords(oldText, newText) {
    const a = String(oldText || '').split(/\s+/);
    const b = String(newText || '').split(/\s+/);
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { out.push({ t: 'same', w: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', w: a[i] }); i++; }
      else { out.push({ t: 'add', w: b[j] }); j++; }
    }
    while (i < m) { out.push({ t: 'del', w: a[i++] }); }
    while (j < n) { out.push({ t: 'add', w: b[j++] }); }
    return out;
  }

  function renderDiffHtml(oldText, newText) {
    return diffWords(oldText, newText).map(part => {
      if (part.t === 'same') return esc(part.w);
      if (part.t === 'del') return `<del>${esc(part.w)}</del>`;
      return `<ins>${esc(part.w)}</ins>`;
    }).join(' ');
  }

  function closeModal() {
    const existing = document.getElementById('sop-modal-backdrop');
    if (existing) existing.remove();
  }

  function modalShell(title, bodyHtml) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.id = 'sop-modal-backdrop';
    backdrop.className = 'sop-modal-backdrop';
    backdrop.innerHTML = `
      <div class="sop-modal" role="dialog" aria-modal="true">
        <div class="sop-modal-head">
          <strong>${esc(title)}</strong>
          <button class="ghost-btn" data-sop-close>Close</button>
        </div>
        <div class="sop-modal-body">${bodyHtml}</div>
      </div>`;
    backdrop.addEventListener('click', evt => {
      if (evt.target === backdrop || evt.target.hasAttribute('data-sop-close')) closeModal();
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openProposeModal(sop, block, authorityOptions, onSaved) {
    const options = (authorityOptions || []).map((auth, idx) =>
      `<label class="sop-auth-option"><input type="checkbox" value="${idx}"> ${esc(auth.case_name)} ${esc(auth.citation || '')} · para ${esc(auth.paragraph_number || '')}</label>`).join('');
    const backdrop = modalShell(`Propose edit — ${block.title}`, `
      <div class="sop-field"><span>Current text (v${esc(block.version || sop.version || '1.0')})</span>
        <div class="sop-current">${esc(block.instruction)}</div></div>
      <div class="sop-field"><span>Proposed text</span>
        <textarea id="sop-new-text" rows="6">${esc(block.instruction)}</textarea></div>
      <div class="sop-field"><span>Your name (reviewer identity)</span>
        <input id="sop-reviewer" type="text" placeholder="e.g. Associate T. Wong" value="demo associate"></div>
      <div class="sop-field"><span>Reason for change</span>
        <input id="sop-note" type="text" placeholder="Why this edit?"></div>
      <div class="sop-field"><span>Attach supporting paragraph-linked authority</span>
        <div class="sop-auth-list">${options || '<em>No verified authorities loaded.</em>'}</div></div>
      <div class="sop-modal-actions">
        <button class="inq-button" id="sop-save-proposal">Save proposal</button>
      </div>`);
    backdrop.querySelector('#sop-save-proposal').addEventListener('click', () => {
      const newText = backdrop.querySelector('#sop-new-text').value.trim();
      const reviewer = backdrop.querySelector('#sop-reviewer').value.trim();
      const note = backdrop.querySelector('#sop-note').value.trim();
      if (!newText || newText === block.instruction) {
        alert('Edit the text before saving a proposal.');
        return;
      }
      const chosen = [...backdrop.querySelectorAll('.sop-auth-list input:checked')]
        .map(input => authorityOptions[Number(input.value)])
        .map(auth => ({
          case_name: auth.case_name,
          citation: auth.citation || '',
          paragraph_number: auth.paragraph_number || '',
          source_url: auth.source_url || '',
        }));
      const proposal = saveProposal({ sop, block, newText, reviewer, authorities: chosen, note });
      closeModal();
      if (onSaved) onSaved(proposal);
    });
  }

  function openCompareModal(sop, block) {
    const related = state.proposals.filter(p => p.sop_id === sop.sop_id && p.block_id === block.block_id);
    const body = related.length
      ? related.map(p => `
          <div class="sop-compare-item">
            <div class="sop-compare-meta">
              <span class="badge badge-${p.status === 'approved' ? 'approved' : p.status === 'rejected' ? 'nsl' : 'draft'}">${esc(p.status)}</span>
              <span>${esc(p.proposed_by)} · ${esc((p.created_at || '').slice(0, 10))}</span>
            </div>
            <div class="sop-diff">${renderDiffHtml(p.old_text, p.new_text)}</div>
            ${(p.linked_authorities || []).length ? `<div class="sop-compare-auth">Authorities: ${p.linked_authorities.map(a => `${esc(a.case_name)} ${esc(a.citation)} para ${esc(a.paragraph_number)}`).join('; ')}</div>` : ''}
          </div>`).join('')
      : '<p>No proposals for this block yet. Use “Propose edit” first.</p>';
    modalShell(`Compare versions — ${block.title}`, body);
  }

  window.SopEditor = {
    init,
    proposals,
    proposalsForSop,
    saveProposal,
    setStatus,
    exportQueue,
    openProposeModal,
    openCompareModal,
    renderDiffHtml,
  };
})();
