function normalizeContentType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function isJsonContentType(value) {
  const normalized = normalizeContentType(value);
  return !normalized || normalized === "application/json";
}

function exactJsonHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() !== "content-type") out[key] = value;
  }
  return {
    "Content-Type": "application/json",
    ...out,
  };
}

function rejectUnsupportedJsonContentType(req, res) {
  const contentType = req?.headers?.["content-type"] || req?.headers?.["Content-Type"] || "";
  if (req?.method !== "POST" || isJsonContentType(contentType)) return false;
  res.status(415).json({
    error: "unsupported_content_type",
    message: "Use Content-Type: application/json for JSON API requests.",
  });
  return true;
}

module.exports = {
  exactJsonHeaders,
  isJsonContentType,
  normalizeContentType,
  rejectUnsupportedJsonContentType,
};
