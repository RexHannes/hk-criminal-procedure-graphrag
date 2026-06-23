const fs = require("fs");
const path = require("path");
const { exactJsonHeaders } = require("../api/json_content_type");
const {
  extractNumberedParagraph,
  stripHtmlToText,
} = require("./build_public_bail_batch");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function deepseekChat({ env = process.env, messages, model } = {}) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY required");
  const response = await fetch(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: exactJsonHeaders({
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    }),
    body: JSON.stringify({
      model: model || env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`deepseek_http_${response.status}`);
    error.payload = payload;
    throw error;
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("deepseek_missing_content");
  return JSON.parse(content);
}

function buildPrompt({ source, paragraphNo, paragraphText, allowedDoctrineNodeIds }) {
  return [
    {
      role: "system",
      content: [
        "You propose candidate legal proposition extraction rules for a Hong Kong legal RAG system.",
        "Return JSON only.",
        "Do not invent quotes. exact_quote must be copied verbatim from the paragraph text.",
        "Do not mark anything approved or answer_safe.",
        "Use only doctrine node IDs from the provided allowed list.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        required_shape: {
          proposals: [
            {
              proposal_id: "proposal_short_id",
              source_id: source.source_id,
              paragraph_no: String(paragraphNo),
              exact_quote: "verbatim quote from paragraph",
              proposition_text: "short cautious proposition",
              candidate_doctrine_node_ids: ["criminal_procedure_hk..."],
              significance_label: "states_rule | applies_rule | illustrates_fact_pattern | limits_rule",
              authority_role: "ratio | application | obiter | party_argument | procedural_history",
              confidence: "low | medium | high",
              confidence_score: 0.55,
              review_state: "machine_candidate",
            },
          ],
        },
        source,
        paragraph_no: String(paragraphNo),
        paragraph_text: paragraphText,
        allowed_doctrine_node_ids: allowedDoctrineNodeIds,
      }),
    },
  ];
}

async function proposeRulesWithDeepSeek({
  source,
  paragraphNo,
  paragraphText,
  allowedDoctrineNodeIds,
  env = process.env,
} = {}) {
  const payload = await deepseekChat({
    env,
    messages: buildPrompt({ source, paragraphNo, paragraphText, allowedDoctrineNodeIds }),
  });
  return payload.proposals || [];
}

function extractParagraphFromHtmlFile({ htmlPath, paragraphNo }) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const text = stripHtmlToText(html);
  return extractNumberedParagraph(text, String(paragraphNo));
}

function loadAllowedDoctrineNodeIds(filePath) {
  const payload = readJson(filePath);
  return payload.allowed_doctrine_node_ids || payload.target_doctrine_node_ids || [];
}

function writeProposalSet({ outputPath, proposalSetId, proposals, source }) {
  const payload = {
    proposal_set_id: proposalSetId,
    version: "0.1.0",
    generator: "deepseek_candidate_proposal_loop",
    source_id: source.source_id,
    policy: {
      validator_must_verify_exact_quote: true,
      validator_must_verify_known_doctrine_node: true,
      outputs_remain_machine_candidate: true,
    },
    proposals,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

module.exports = {
  buildPrompt,
  deepseekChat,
  extractParagraphFromHtmlFile,
  loadAllowedDoctrineNodeIds,
  proposeRulesWithDeepSeek,
  writeProposalSet,
};
