const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_STORE_PATH = path.join(ROOT, "data", "legal_ingest", "review_store", "review_items.sample.json");

function readReviewStore(storePath = DEFAULT_STORE_PATH) {
  if (!fs.existsSync(storePath)) return { items: [] };
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeReviewStore(store, storePath = DEFAULT_STORE_PATH) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function findReviewItem(store, itemId) {
  return (store.items || []).find(item => item.item_id === itemId);
}

function upsertReviewItem(store, item) {
  const items = store.items || [];
  const index = items.findIndex(current => current.item_id === item.item_id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  return { ...store, items };
}

module.exports = {
  DEFAULT_STORE_PATH,
  findReviewItem,
  readReviewStore,
  upsertReviewItem,
  writeReviewStore,
};
