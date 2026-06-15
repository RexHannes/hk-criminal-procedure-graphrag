const { json, localReviewQueue, supabaseConfig, supabaseRest } = require("./_utils");

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
    json(res, 200, {
      backend: "local_json",
      status: "supabase_query_failed_fallback_local",
      items: localReviewQueue(),
      error: error.message,
      details: error.payload || null,
    });
  }
};
