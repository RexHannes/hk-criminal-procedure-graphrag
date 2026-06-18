function provider() {
  return (process.env.LLM_PROVIDER || "none").trim().toLowerCase();
}

function sourceGatedSystemPrompt() {
  return [
    "You are a cautious Hong Kong legal research assistant.",
    "Use only the supplied evidence pack.",
    "Cite every legal claim using supplied source/chunk IDs.",
    "If unsupported, say: not verified from current database.",
    "Do not use general model memory for law.",
    "Do not invent case names, citations, sections, forms, dates, or facts.",
    "Label proposition-card-only support as proposition-card based.",
    "Label private precedent-only support as precedent-based, not legal authority.",
  ].join(" ");
}

async function generateWithLlmIfEnabled({ evidencePack }) {
  const selected = provider();
  if (selected === "none") {
    return {
      provider: "none",
      status: "disabled",
      prompt_policy: sourceGatedSystemPrompt(),
      result: null,
    };
  }
  return {
    provider: selected,
    status: "interface_only_not_configured",
    prompt_policy: sourceGatedSystemPrompt(),
    evidence_pack_preview: {
      query: evidencePack?.query,
      chunk_count: evidencePack?.evidence_chunks?.length || 0,
      source_count: evidencePack?.sources?.length || 0,
    },
    result: null,
    warning: "LLM adapters are intentionally disabled until provider-specific keys and source-gated verification are reviewed.",
  };
}

module.exports = {
  generateWithLlmIfEnabled,
  provider,
  sourceGatedSystemPrompt,
};
