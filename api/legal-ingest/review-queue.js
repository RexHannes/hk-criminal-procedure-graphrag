const {
  isMissingTableError,
  json,
  localReviewQueue,
  normalizeLegacyReviewItem,
  supabaseConfig,
  supabaseRest,
} = require("../../src/api/legal-ingest/_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const config = supabaseConfig();
  if (!config.configured) {
    json(res, 200, {
      backend: "local_json",
      status: "supabase_not_configured",
      items: localReviewQueue(),
    });
    return;
  }

  try {
    const status = encodeURIComponent(req.query.status || "open");
    const rows = await supabaseRest(`human_review_queue?status=eq.${status}&select=*&order=created_at.desc`);
    json(res, 200, { backend: "supabase", status: "ok", items: rows || [] });
  } catch (error) {
    if (isMissingTableError(error, "human_review_queue")) {
      try {
        const status = encodeURIComponent(req.query.status || "open");
        const rows = await supabaseRest(`human_review_items?status=eq.${status}&select=*&order=created_at.desc`);
        json(res, 200, {
          backend: "supabase_legacy",
          status: "ok_legacy_schema",
          items: (rows || []).map(normalizeLegacyReviewItem),
          warnings: ["using_legacy_human_review_items_table"],
        });
        return;
      } catch (legacyError) {
        json(res, 200, {
          backend: "local_json",
          status: "supabase_legacy_query_failed_fallback_local",
          items: localReviewQueue(),
          error: legacyError.message,
          details: legacyError.payload || null,
          original_error: error.payload || error.message,
        });
        return;
      }
    }
    json(res, 200, {
      backend: "local_json",
      status: "supabase_query_failed_fallback_local",
      items: localReviewQueue(),
      error: error.message,
      details: error.payload || null,
    });
  }
};
