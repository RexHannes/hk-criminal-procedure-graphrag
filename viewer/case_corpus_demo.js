(function () {
  const DEMO_ARTIFACTS = {
    freezeReport: "../artifacts/demo_freeze_report.json",
    queryPack: "../artifacts/demo_outputs/demo_query_pack.json",
    demos: [
      {
        id: "A",
        slug: "theft-dishonesty",
        label: "Theft/dishonesty",
        artifact: "../artifacts/demo_outputs/theft_dishonesty_research_memo.md",
      },
      {
        id: "B",
        slug: "intention-permanently-deprive",
        label: "Intention permanently to deprive",
        artifact: "../artifacts/demo_outputs/intention_permanently_deprive_research_memo.md",
      },
      {
        id: "C",
        slug: "belonging-to-another",
        label: "Belonging to another",
        artifact: "../artifacts/demo_outputs/belonging_to_another_research_memo.md",
      },
      {
        id: "D",
        slug: "bail",
        label: "Bail",
        artifact: "../artifacts/demo_outputs/bail_research_memo.md",
      },
      {
        id: "E",
        slug: "unsupported-landlord",
        label: "Unsupported landlord/rent",
        artifact: "../artifacts/demo_outputs/unsupported_landlord_query.md",
      },
    ],
  };

  const FALLBACK_QUERIES = {
    A: "If I forgot to pay at a shop, what are the dishonesty issues?",
    B: "What does intention permanently to deprive mean in theft?",
    C: "How does Hong Kong theft law handle property belonging to another?",
    D: "What bail factors matter in a theft or dishonesty-related case?",
    E: "My landlord increased my rent. What should I do?",
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function productCopy(value) {
    return String(value == null ? "" : value)
      .replace(/answer[_-]?safe=false/gi, "professional_advice_certified=false")
      .replace(/not[_\s-]?yet[_\s-]?answer[_\s-]?safe/gi, "not yet professionally certified")
      .replace(/answer[_\s-]?safe/gi, "professionally certified")
      .replace(/research[_\s-]?only/gi, "research-prototype")
      .replace(/lawyer[-\s]?review[-\s]?required/gi, "professional certification later")
      .replace(/lawyer[-\s]?review/gi, "professional certification")
      .replace(/human\s+review\s+required/gi, "professional certification later")
      .replace(/human review/gi, "professional certification")
      .replace(/partner review/gi, "professional certification")
      .replace(/current-treatment review/gi, "current-treatment check")
      .replace(/Current\s+treatment\s+unchecked/gi, "Current-treatment check later")
      .replace(/verification\s+pending/gi, "source proof unavailable")
      .replace(/source\s+check\s+pending/gi, "source proof unavailable")
      .replace(/case\s+audit\s+required/gi, "source proof required");
  }

  function linkify(value) {
    return escapeHtml(productCopy(value)).replace(/https?:\/\/[^\s<>"')]+/g, url => {
      const cleanUrl = url.replace(/[.,;:]+$/, "");
      const tail = url.slice(cleanUrl.length);
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${escapeHtml(tail)}`;
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function primaryMemo(markdown) {
    return String(markdown || "").split(/\n## Full Answer Markdown\b/i)[0];
  }

  function sectionText(markdown, title) {
    const re = new RegExp(`(?:^|\\n)## ${escapeRegExp(title)}\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`, "i");
    const match = primaryMemo(markdown).match(re);
    return match ? match[1].trim() : "";
  }

  function listItems(text) {
    const items = [];
    let current = "";
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("- ")) {
        if (current) items.push(current.trim());
        current = line.slice(2).trim();
      } else if (current && line) {
        current += ` ${line}`;
      }
    }
    if (current) items.push(current.trim());
    return items;
  }

  function between(text, start, end) {
    const i = text.indexOf(start);
    if (i < 0) return "";
    const from = i + start.length;
    const j = text.indexOf(end, from);
    return (j < 0 ? text.slice(from) : text.slice(from, j)).trim();
  }

  function trimText(value, max = 420) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trim()}...`;
  }

  function renderList(items = [], empty = "No source-backed item is attached.") {
    const clean = items.map(item => trimText(item, 520)).filter(Boolean);
    if (!clean.length) return `<p class="empty-copy">${escapeHtml(empty)}</p>`;
    return `<ul class="memo-list">${clean.map(item => `<li>${linkify(item)}</li>`).join("")}</ul>`;
  }

  function parseAuthority(item) {
    const source = item.match(/Source URL:\s*(https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)[^\s)"]*#p\d+)/i)
      || item.match(/(https?:\/\/(?:www\.)?(?:hklii\.hk|legalref\.judiciary\.hk)[^\s)"]*#p\d+)/i);
    const para = item.match(/Key paragraph:\s*para\.?\s*([^-\s]+)\s*-/i);
    const quote = item.match(/Exact quote:\s*"([^"]+)"/i);
    const title = trimText(item.split(" Facts:")[0] || item.split(" Key paragraph:")[0] || "Case authority", 160);
    return {
      title,
      paragraph: para ? para[1] : "",
      sourceUrl: source ? source[1] : "",
      quote: quote ? quote[1] : "",
      principle: productCopy(trimText(between(item, " Principle: ", " Why relevant:"), 360)),
      relevance: productCopy(trimText(between(item, " Why relevant: ", " How distinguishable:"), 300)),
      distinguishable: productCopy(trimText(between(item, " How distinguishable: ", " Source URL:"), 300)),
    };
  }

  function renderAuthorityCard(authority, index) {
    return `<article class="authority-card">
      <div class="authority-top">
        <span class="authority-index">${index + 1}</span>
        <h3>${escapeHtml(authority.title)}</h3>
      </div>
      <div class="authority-meta">
        ${authority.paragraph ? `<span>para. ${escapeHtml(authority.paragraph)}</span>` : ""}
        <span>Source-linked</span>
        <span>Research prototype</span>
      </div>
      ${authority.quote ? `<blockquote class="quote-card"><span>Exact quote</span>${escapeHtml(authority.quote)}</blockquote>` : ""}
      ${authority.principle ? `<p class="authority-principle"><strong>Principle candidate:</strong> ${escapeHtml(productCopy(authority.principle))}</p>` : ""}
      ${authority.relevance ? `<p class="authority-note"><strong>Why relevant:</strong> ${escapeHtml(productCopy(authority.relevance))}</p>` : ""}
      ${authority.distinguishable ? `<p class="authority-note"><strong>Limits:</strong> ${escapeHtml(productCopy(authority.distinguishable))}</p>` : ""}
      ${authority.sourceUrl ? `<a class="source-link" href="${escapeHtml(authority.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open HKLII/LegalRef paragraph</a>` : ""}
    </article>`;
  }

  function renderMemo(markdown, query) {
    const shortAnswer = listItems(sectionText(markdown, "Short Answer"));
    const issues = listItems(sectionText(markdown, "Issues"));
    const governing = listItems(sectionText(markdown, "Governing Law / Elements"));
    const authorities = listItems(sectionText(markdown, "Case-by-Case Authorities")).map(parseAuthority).filter(item => item.title || item.sourceUrl || item.quote);
    const principles = listItems(sectionText(markdown, "Extracted Legal Principles"));
    const application = listItems(sectionText(markdown, "Application to User Facts"));
    const evidence = listItems(sectionText(markdown, "Evidence Analysis"));
    const missing = listItems(sectionText(markdown, "Missing Facts"));
    const nextSteps = listItems(sectionText(markdown, "Practical Next Steps"));
    const audit = listItems(sectionText(markdown, "Source Audit"));
    const unsupported = query?.should_abstain || /unsupported_general_query|No case-by-case authority is attached/i.test(markdown);

    return `<div class="demo-grid">
      <section class="memo-panel">
        <article class="memo-card short-answer">
          <div class="section-label">Answer-first memo</div>
          <h3>Short answer</h3>
          ${renderList(shortAnswer)}
        </article>
        <article class="memo-card">
          <h3>Issues</h3>
          <div class="issue-pills">
            ${issues.length ? issues.map(item => `<span>${escapeHtml(item.replace(/^Issue mapped:\s*/i, ""))}</span>`).join("") : "<span>No supported issue id attached</span>"}
          </div>
        </article>
        <article class="memo-card">
          <h3>Governing law / elements</h3>
          ${renderList(governing)}
        </article>
        <article class="memo-card">
          <h3>Application to user facts</h3>
          ${renderList(application)}
        </article>
        <div class="memo-two">
          <article class="memo-card">
            <h3>Evidence analysis</h3>
            ${renderList(evidence)}
          </article>
          <article class="memo-card">
            <h3>Missing decisive facts</h3>
            ${renderList(missing)}
          </article>
        </div>
        <article class="memo-card">
          <h3>Next steps</h3>
          ${renderList(nextSteps)}
        </article>
        <details class="audit-drawer">
          <summary>Audit details and limitations</summary>
          <div class="audit-grid">
            <div>
              <h4>Source audit</h4>
              ${renderList(audit)}
            </div>
            <div>
              <h4>Prototype boundary</h4>
              ${renderList([
                "Public paragraph proof is mandatory",
                "Research prototype output",
                "lawyer_review_status=unreviewed",
                "professional_advice_certified=false",
              ])}
            </div>
          </div>
        </details>
      </section>
      <aside class="source-panel">
        <div class="source-panel-head">
          <span class="section-label">Source panel</span>
          <h3>${unsupported ? "Unsupported query abstention" : "Case authorities"}</h3>
        </div>
        ${unsupported ? `<article class="authority-card abstention-card">
          <div class="authority-top"><span class="authority-index">!</span><h3>No criminal-law authority attached</h3></div>
          <p class="authority-note">The landlord/rent question is outside this criminal-law demo pack. The system abstains instead of borrowing theft or dishonesty authorities.</p>
          <div class="authority-meta"><span>unsupported_general_query</span><span>wrong_domain_leak_rate=0</span></div>
        </article>` : ""}
        ${authorities.length ? authorities.slice(0, 8).map(renderAuthorityCard).join("") : (!unsupported ? `<p class="empty-copy">No case authority card is attached for this query.</p>` : "")}
        ${principles.length ? `<details class="audit-drawer compact"><summary>Principle candidates</summary>${renderList(principles.slice(0, 8))}</details>` : ""}
      </aside>
    </div>`;
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
  }

  async function fetchJson(path) {
    return JSON.parse(await fetchText(path));
  }

  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value;
  }

  function numberValue(value, fallback = "0") {
    if (Number.isFinite(value)) return String(value);
    return fallback;
  }

  function percentValue(value) {
    if (!Number.isFinite(value)) return "0";
    return `${Math.round(value * 100)}%`;
  }

  function renderMetrics(report) {
    const counts = report.corpus_counts || {};
    const proof = report.source_proof_metrics || {};
    setText("[data-metric='cases']", numberValue(counts.registry_case_count));
    setText("[data-metric='paragraphs']", numberValue(counts.paragraph_card_count));
    setText("[data-metric='propositions']", numberValue(counts.proposition_card_count));
    setText("[data-metric='principles']", numberValue(counts.principle_card_count));
    setText("[data-metric='usable']", numberValue(counts.usable_principle_count));
    setText("[data-metric='demoted']", numberValue(counts.demoted_principle_count));
    setText("[data-metric='advice-certified']", numberValue(report.professional_advice_certified === true ? 1 : 0));
    setText("[data-metric='source-proof']", percentValue(proof.source_proof_rate));
    setText("[data-metric='wrong-domain']", numberValue(proof.wrong_domain_leak_rate));
    setText("[data-metric='abstention']", percentValue(report.unsupported_query_abstention));
  }

  function boundaryBadges(query) {
    const supported = query && !query.should_abstain;
    const abstain = query && query.should_abstain;
    return [
      `<span class="badge strong">${supported ? "source_grounded_research_only" : "unsupported_general_query"}</span>`,
      '<span class="badge">Research prototype</span>',
      '<span class="badge">professional_advice_certified=false</span>',
      abstain ? '<span class="badge danger">abstention: no criminal-law authority</span>' : '<span class="badge">public paragraph proof only</span>',
    ].join("");
  }

  function renderTabs(queryPack) {
    const queriesById = new Map((queryPack.queries || []).map(query => [query.id, query]));
    const tabs = $("#demo-tabs");
    const panels = $("#demo-panels");
    if (!tabs || !panels) return;

    tabs.innerHTML = "";
    panels.innerHTML = "";

    for (const demo of DEMO_ARTIFACTS.demos) {
      const query = queriesById.get(demo.id) || { id: demo.id, label: demo.label, query: FALLBACK_QUERIES[demo.id] };
      const button = document.createElement("button");
      button.className = "tab";
      button.type = "button";
      button.id = `tab-${demo.slug}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `panel-${demo.slug}`);
      button.setAttribute("aria-selected", demo.id === "A" ? "true" : "false");
      button.textContent = `${demo.id}. ${demo.label}`;
      tabs.appendChild(button);

      const panel = document.createElement("article");
      panel.className = `panel${demo.id === "A" ? " active" : ""}`;
      panel.id = `panel-${demo.slug}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      panel.dataset.artifact = demo.artifact;
      panel.innerHTML = [
        '<div class="panel-header">',
        "<div>",
        `<h2>${escapeHtml(demo.label)}</h2>`,
        `<p class="query">${escapeHtml(query.query || FALLBACK_QUERIES[demo.id])}</p>`,
        "</div>",
        `<div class="boundary">${boundaryBadges(query)}</div>`,
        "</div>",
        '<div class="demo-body" data-demo-body>Loading frozen demo output...</div>',
      ].join("");
      panels.appendChild(panel);

      button.addEventListener("click", () => {
        for (const el of tabs.querySelectorAll(".tab")) el.setAttribute("aria-selected", "false");
        for (const el of panels.querySelectorAll(".panel")) el.classList.remove("active");
        button.setAttribute("aria-selected", "true");
        panel.classList.add("active");
      });
    }
  }

  async function renderDemoArtifacts() {
    const panels = Array.from(document.querySelectorAll("[data-artifact]"));
    await Promise.all(panels.map(async panel => {
      const target = panel.querySelector("[data-demo-body]");
      const tabId = panel.id.replace(/^panel-/, "");
      const demo = DEMO_ARTIFACTS.demos.find(item => item.slug === tabId);
      const query = (window.PR6_CASE_CORPUS_QUERY_MAP || new Map()).get(demo?.id);
      try {
        const markdown = await fetchText(panel.dataset.artifact);
        target.innerHTML = renderMemo(markdown, query);
      } catch (error) {
        target.innerHTML = `<p>Could not load frozen demo artifact: ${escapeHtml(error.message)}</p>`;
      }
    }));
  }

  async function init() {
    try {
      const [report, queryPack] = await Promise.all([
        fetchJson(DEMO_ARTIFACTS.freezeReport),
        fetchJson(DEMO_ARTIFACTS.queryPack),
      ]);
      renderMetrics(report);
      window.PR6_CASE_CORPUS_QUERY_MAP = new Map((queryPack.queries || []).map(query => [query.id, query]));
      renderTabs(queryPack);
      await renderDemoArtifacts();
      setText("#load-status", "Frozen PR #6 artifacts loaded.");
    } catch (error) {
      setText("#load-status", `Could not load all frozen artifacts: ${error.message}`);
    }
  }

  window.PR6_CASE_CORPUS_DEMO_ARTIFACTS = DEMO_ARTIFACTS;
  document.addEventListener("DOMContentLoaded", init);
})();
