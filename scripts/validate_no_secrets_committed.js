#!/usr/bin/env node
/* eslint-disable no-console */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];

function trackedFiles() {
  return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

for (const file of trackedFiles()) {
  const base = path.basename(file);
  if ([".env", ".env.local", ".env.runtime", ".env.demo.runtime", ".doppler.env"].includes(base)) {
    errors.push(`runtime secret file is tracked: ${file}`);
    continue;
  }
  if (file.includes("private_vault") || file.includes("data/legal_ingest/private/")) {
    errors.push(`private source path is tracked: ${file}`);
    continue;
  }
  if (!/\.(js|py|md|json|yml|yaml|example|sh|txt|html|css)$/i.test(file)) continue;
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) continue;
  const text = fs.readFileSync(fullPath, "utf8");
  const secretPatterns = [
    /sk-live-[A-Za-z0-9_\\-]{12,}/,
    /sk-ant-[A-Za-z0-9_\\-]{12,}/,
    /dpl_[A-Za-z0-9_\\-]{12,}/,
    /clerk_secret_[A-Za-z0-9_\\-]{12,}/,
    /supabase_service_role_[A-Za-z0-9_\\-]{12,}/,
  ];
  if (secretPatterns.some(pattern => pattern.test(text))) {
    errors.push(`possible committed secret in ${file}`);
  }
}

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
for (const token of [".env.runtime", ".env.demo.runtime", ".doppler.env", "!.env.example", "!infra/digitalocean/.env.demo.example"]) {
  if (!gitignore.includes(token)) errors.push(`.gitignore missing ${token}`);
}

if (errors.length) {
  console.error("No-secrets validation failed:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("No secrets committed.");
