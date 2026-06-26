const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const RULE_CARD_DIR = path.join(ROOT, "data", "legal_ingest", "applied_answer", "rule_cards");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadRuleDecks(dir = RULE_CARD_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith(".json"))
    .map(file => readJson(path.join(dir, file)));
}

function findRuleDeck({ domain, scenario, subscenario }) {
  return loadRuleDecks().find(deck => (
    deck.domain === domain &&
    deck.scenario === scenario &&
    (deck.subscenario || null) === (subscenario || null)
  )) || null;
}

module.exports = {
  RULE_CARD_DIR,
  findRuleDeck,
  loadRuleDecks,
};
