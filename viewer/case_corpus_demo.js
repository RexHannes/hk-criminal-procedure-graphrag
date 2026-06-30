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

  function linkify(value) {
    return escapeHtml(value).replace(/https?:\/\/[^\s<>"')]+/g, url => {
      const cleanUrl = url.replace(/[.,;:]+$/, "");
      const tail = url.slice(cleanUrl.length);
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${escapeHtml(tail)}`;
    });
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const out = [];
    let inList = false;

    function closeList() {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    }

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        closeList();
        continue;
      }
      if (line.startsWith("### ")) {
        closeList();
        out.push(`<h3>${linkify(line.slice(4))}</h3>`);
      } else if (line.startsWith("## ")) {
        closeList();
        out.push(`<h2>${linkify(line.slice(3))}</h2>`);
      } else if (line.startsWith("# ")) {
        closeList();
        out.push(`<h1>${linkify(line.slice(2))}</h1>`);
      } else if (line.startsWith("- ")) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(`<li>${linkify(line.slice(2))}</li>`);
      } else if (line.startsWith("```")) {
        closeList();
      } else {
        closeList();
        out.push(`<p>${linkify(line)}</p>`);
      }
    }
    closeList();
    return out.join("\n");
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
    setText("[data-metric='answer-safe']", numberValue(report.answer_safe_count));
    setText("[data-metric='source-proof']", percentValue(proof.source_proof_rate));
    setText("[data-metric='wrong-domain']", numberValue(proof.wrong_domain_leak_rate));
    setText("[data-metric='abstention']", percentValue(report.unsupported_query_abstention));
  }

  function boundaryBadges(query) {
    const supported = query && !query.should_abstain;
    const abstain = query && query.should_abstain;
    return [
      `<span class="badge strong">${supported ? "source_grounded_research_only" : "unsupported_general_query"}</span>`,
      '<span class="badge danger">answer_safe=false</span>',
      '<span class="badge warn">lawyer-review-required</span>',
      '<span class="badge">needs_lawyer_review=true</span>',
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
        '<div class="markdown" data-demo-markdown>Loading frozen demo output...</div>',
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
      const target = panel.querySelector("[data-demo-markdown]");
      try {
        const markdown = await fetchText(panel.dataset.artifact);
        target.innerHTML = markdownToHtml(markdown);
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
