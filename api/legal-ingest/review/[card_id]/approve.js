const { assertReviewAdmin, isSchemaMismatchError, json, supabaseConfig, supabaseRest } = require("../../../../src/api/legal-ingest/_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    assertReviewAdmin(req);
  } catch (error) {
    json(res, error.status || 401, { error: error.message });
    return;
  }

  const cardId = String(req.query.card_id || "").trim();
  if (!cardId) {
    json(res, 400, { error: "missing_card_id" });
    return;
  }

  const config = supabaseConfig();
  if (!config.configured) {
    json(res, 503, {
      error: "supabase_not_configured",
      message: "Approval mutates production review state and requires Supabase server-side credentials.",
    });
    return;
  }

  const reviewer = String(req.body?.reviewed_by || "api_review_admin");
  const approveAsAnswerSafe = req.body?.promote_answer_safe === true;
  const propositionPatch = approveAsAnswerSafe
    ? { review_status: "approved", verification_status: "verified", answer_layer_status: "answer_safe" }
    : { review_status: "approved", verification_status: "source_verified" };

  try {
    const encoded = encodeURIComponent(cardId);
    const propositionRows = await supabaseRest(`proposition_cards?proposition_id=eq.${encoded}`, {
      method: "PATCH",
      body: propositionPatch,
    });
    await supabaseRest(`human_review_queue?item_id=eq.${encoded}`, {
      method: "PATCH",
      body: {
        status: "approved",
        reviewed_at: new Date().toISOString(),
        notes: `Approved by ${reviewer}. promote_answer_safe=${approveAsAnswerSafe}`,
      },
    });
    json(res, 200, {
      status: "approved",
      card_id: cardId,
      promote_answer_safe: approveAsAnswerSafe,
      proposition_rows: propositionRows || [],
    });
  } catch (error) {
    if (isSchemaMismatchError(error)) {
      try {
        const encoded = encodeURIComponent(cardId);
        const existingReviewRows = await supabaseRest(`human_review_items?item_id=eq.${encoded}&select=item_id,payload_json&limit=1`).catch(() => []);
        const existingPayload = Array.isArray(existingReviewRows) && existingReviewRows[0]?.payload_json
          ? existingReviewRows[0].payload_json
          : {};
        const propositionRows = await supabaseRest(`proposition_cards?id=eq.${encoded}`, {
          method: "PATCH",
          body: { review_status: approveAsAnswerSafe ? "answer_safe" : "approved" },
        });
        await supabaseRest(`human_review_items?item_id=eq.${encoded}`, {
          method: "PATCH",
          body: {
            status: "approved",
            resolved_at: new Date().toISOString(),
            payload_json: {
              ...existingPayload,
              reviewed_by: reviewer,
              promote_answer_safe: approveAsAnswerSafe,
              legacy_schema: true,
            },
          },
        });
        json(res, 200, {
          status: "approved_legacy_schema",
          backend: "supabase_legacy",
          card_id: cardId,
          promote_answer_safe: approveAsAnswerSafe,
          proposition_rows: propositionRows || [],
          warnings: ["used_legacy_proposition_cards_and_human_review_items_tables"],
        });
        return;
      } catch (legacyError) {
        json(res, 502, {
          status: "approval_failed_legacy_schema",
          error: legacyError.message,
          details: legacyError.payload || null,
          original_error: error.payload || error.message,
        });
        return;
      }
    }
    json(res, 502, {
      status: "approval_failed",
      error: error.message,
      details: error.payload || null,
    });
  }
};
