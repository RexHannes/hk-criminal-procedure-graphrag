const { buildClassificationReview } = require("./form_classification_review");

function buildCourtFormReviewQueue(templates = [], docsByTemplateId = new Map()) {
  return templates.map(template => {
    const review = buildClassificationReview(template, docsByTemplateId.get(template.id) || {});
    return {
      ...review,
      practiceLane: template.practiceLane || template.practiceArea || "unknown",
      reviewLaneStatus: "pending_private_review",
      privateTextCommitted: false,
      activationEligible: false,
    };
  });
}

function reviewQueueSummary(reviews = []) {
  return reviews.reduce((acc, review) => {
    const lane = review.practiceLane || "unknown";
    acc.total += 1;
    acc.byLane[lane] = (acc.byLane[lane] || 0) + 1;
    acc.byReviewStatus[review.reviewStatus] = (acc.byReviewStatus[review.reviewStatus] || 0) + 1;
    acc.byClassificationStatus[review.classificationStatus] = (acc.byClassificationStatus[review.classificationStatus] || 0) + 1;
    return acc;
  }, { total: 0, byLane: {}, byReviewStatus: {}, byClassificationStatus: {} });
}

module.exports = {
  buildCourtFormReviewQueue,
  reviewQueueSummary,
};
