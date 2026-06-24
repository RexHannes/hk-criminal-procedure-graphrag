const fs = require("fs");
const path = require("path");

const VERTICALS_DIR = path.join(process.cwd(), "data", "legal_ingest", "verticals");

function json(res, status, payload) {
  res.status(status).json(payload);
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key, configured: !!(url && key) };
}

async function supabaseRest(pathAndQuery, { method = "GET", body } = {}) {
  const { url, key, configured } = supabaseConfig();
  if (!configured) throw new Error("supabase_not_configured");
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = text;
  }
  if (!response.ok) {
    const err = new Error(`supabase_rest_failed_${response.status}`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

function isMissingTableError(error, tableName) {
  const payload = error?.payload || {};
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes(`'public.${tableName}'`) ||
    text.includes(`public.${tableName}`) ||
    text.includes("schema cache") ||
    text.includes("could not find the table");
}

function isSchemaMismatchError(error) {
  const payload = error?.payload || {};
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes("schema cache") ||
    text.includes("could not find the table") ||
    text.includes("could not find") && text.includes("column") ||
    text.includes("column") && text.includes("does not exist");
}

function normalizeLegacyReviewItem(row) {
  const payload = row.payload_json || {};
  return {
    review_item_id: payload.review_item_id || `legacy_review_${row.item_id || row.id}`,
    item_type: row.item_type,
    item_id: row.item_id,
    priority: payload.priority || "normal",
    reason: row.reason,
    status: row.status,
    notes: row.payload_json?.notes || "",
    created_at: row.created_at,
    reviewed_at: row.resolved_at || null,
    vertical_id: payload.vertical_id,
    backend: "supabase_legacy",
  };
}

function loadLocalVerticals() {
  if (!fs.existsSync(VERTICALS_DIR)) return [];
  return fs.readdirSync(VERTICALS_DIR)
    .filter(name => name.endsWith(".json"))
    .map(name => {
      try {
        return JSON.parse(fs.readFileSync(path.join(VERTICALS_DIR, name), "utf8"));
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function localReviewQueue() {
  const items = [];
  for (const vertical of loadLocalVerticals()) {
    for (const item of vertical.human_review_queue || []) {
      items.push({
        ...item,
        vertical_id: vertical.vertical_id,
        backend: "local_json",
      });
    }
    for (const card of vertical.proposition_cards || []) {
      if (card.review_status !== "approved") {
        items.push({
          review_item_id: `review_${card.proposition_id}`,
          item_type: "proposition_card",
          item_id: card.proposition_id,
          priority: card.verification_status === "quote_verified" ? "normal" : "high",
          reason: `Review ${card.citation || "source"} ${card.pinpoint || ""}: ${card.proposition_text}`,
          status: "open",
          vertical_id: vertical.vertical_id,
          backend: "local_json",
        });
      }
    }
  }
  return items;
}

function assertReviewAdmin(req) {
  const configured = (process.env.LEGAL_REVIEW_ADMIN_TOKEN || "").trim();
  if (!configured) {
    const err = new Error("review_admin_token_not_configured");
    err.status = 503;
    throw err;
  }
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerToken = req.headers["x-legal-review-token"] || "";
  if (bearer !== configured && headerToken !== configured) {
    const err = new Error("unauthorized_review_admin");
    err.status = 401;
    throw err;
  }
}

module.exports = {
  assertReviewAdmin,
  isMissingTableError,
  isSchemaMismatchError,
  json,
  localReviewQueue,
  normalizeLegacyReviewItem,
  supabaseConfig,
  supabaseRest,
};
