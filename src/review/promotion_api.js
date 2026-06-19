const { promoteCard } = require("../legal_answer/review/promotion");
const { findReviewItem, readReviewStore, upsertReviewItem, writeReviewStore } = require("./review_store");

function promoteReviewItem({ itemId, toStatus, reviewer, reason, sourceText = "", storePath } = {}) {
  if (!itemId) throw new Error("itemId required");
  if (!toStatus) throw new Error("toStatus required");
  const store = readReviewStore(storePath);
  const item = findReviewItem(store, itemId);
  if (!item) throw new Error(`review_item_not_found:${itemId}`);
  const promoted = promoteCard(
    {
      ...item,
      verification_status: item.review_state,
      answer_layer_status: item.review_state,
      review_status: item.review_status,
      promotion_audit: item.audit || [],
    },
    toStatus,
    {
      sourceText,
      reviewer,
      note: reason,
    },
  );
  const nextItem = {
    ...item,
    review_state: toStatus,
    review_status: promoted.review_status,
    reviewed_by: promoted.reviewed_by,
    reviewed_at: promoted.reviewed_at,
    review_note: promoted.review_note,
    audit: promoted.promotion_audit,
  };
  writeReviewStore(upsertReviewItem(store, nextItem), storePath);
  return nextItem;
}

module.exports = { promoteReviewItem };
