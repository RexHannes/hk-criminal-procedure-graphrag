#!/usr/bin/env node
/* eslint-disable no-console */

const {
  exactJsonHeaders,
  isJsonContentType,
  normalizeContentType,
} = require("../src/api/json_content_type");

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(normalizeContentType("application/json; charset=utf-8") === "application/json", "charset JSON should normalize");
assert(isJsonContentType("application/json"), "plain JSON should be accepted");
assert(isJsonContentType("application/json; charset=utf-8"), "charset JSON should be accepted inbound");
assert(!isJsonContentType("multipart/form-data"), "multipart should not be treated as JSON");

const headers = exactJsonHeaders({
  "content-type": "application/json; charset=utf-8",
  Authorization: "Bearer test",
});
assert(headers["Content-Type"] === "application/json", "outbound JSON header must be exact");
assert(!Object.prototype.hasOwnProperty.call(headers, "content-type"), "lowercase content-type should be stripped");
assert(headers.Authorization === "Bearer test", "other headers should be preserved");

if (errors.length) {
  console.error("JSON content type policy validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("JSON content type policy validation passed.");
