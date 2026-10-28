import type { CanonicalRestaurant, Listing, Aspect } from "../types.js";

const positive = ["excellent", "great", "good", "tasty", "delicious", "fresh", "quick", "friendly", "value"];
const negative = ["late", "slow", "cold", "poor", "bad", "stale", "rude", "expensive", "wrong"];
const aspectWords: Record<Aspect, string[]> = {
  food: ["biryani", "food", "flavour", "taste", "tasty", "dish", "meal"],
  delivery: ["delivery", "driver", "arrived", "late", "packaging"],
  value: ["value", "price", "expensive", "cost", "money", "cheap"],
  service: ["service", "staff", "rude", "friendly", "support"],
};

function normal(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function analyseReview(text: string) {
  const clauses = text.split(/\bbut\b|\bhowever\b|[.!?;,]/i).filter(Boolean);
  const result: Array<{ aspect: Aspect; sentiment: number; clause: string }> = [];
  for (const raw of clauses) {
    const clause = normal(raw),
      words = clause.split(" ");
    const pos = words.filter((w) => positive.includes(w)).length,
      neg = words.filter((w) => negative.includes(w)).length;
    let sentiment = Math.sign(pos - neg);
    if (words.some((w) => ["not", "never", "no"].includes(w))) sentiment *= -1;
    if (!sentiment) continue;
    for (const aspect of Object.keys(aspectWords) as Aspect[]) {
      if (aspectWords[aspect].some((w) => clause.includes(w))) {
        result.push({ aspect, sentiment, clause: raw.trim() });
      }
    }
  }
  return result;
}

export function reputation(restaurant: CanonicalRestaurant, listings: Listing[]) {
  const relevant = listings.filter((l) => restaurant.listingIds.includes(l.id));
  const seen = new Set<string>();
  let duplicateReviewsRemoved = 0;
  let totalReviewsAnalyzed = 0;

  const byAspect: Record<Aspect, { sum: number; count: number }> = {
    food: { sum: 0, count: 0 },
    delivery: { sum: 0, count: 0 },
    value: { sum: 0, count: 0 },
    service: { sum: 0, count: 0 },
  };

  const providerDelivery: Record<string, { sum: number; count: number }> = {};
  const positiveHighlights: Array<{ aspect: string; snippet: string; providerId: string }> = [];
  const negativeHighlights: Array<{ aspect: string; snippet: string; providerId: string }> = [];

  for (const listing of [...relevant].sort((a, b) => b.providerTrust - a.providerTrust)) {
    for (const review of listing.reviews) {
      totalReviewsAnalyzed++;
      const key = normal(review.text);
      if (seen.has(key)) {
        duplicateReviewsRemoved++;
        continue;
      }
      seen.add(key);

      const ageDays = Math.max(0, (Date.now() - new Date(review.createdAt).getTime()) / 86400000);
      const weight = Math.pow(0.5, ageDays / 90);

      for (const hit of analyseReview(review.text)) {
        byAspect[hit.aspect].sum += hit.sentiment * weight;
        byAspect[hit.aspect].count++;

        if (hit.aspect === "delivery") {
          providerDelivery[listing.providerId] ??= { sum: 0, count: 0 };
          providerDelivery[listing.providerId].sum += hit.sentiment * weight;
          providerDelivery[listing.providerId].count++;
        }

        if (hit.sentiment > 0 && positiveHighlights.length < 5) {
          positiveHighlights.push({ aspect: hit.aspect, snippet: hit.clause, providerId: listing.providerId });
        } else if (hit.sentiment < 0 && negativeHighlights.length < 5) {
          negativeHighlights.push({ aspect: hit.aspect, snippet: hit.clause, providerId: listing.providerId });
        }
      }
    }
  }

  const aspects = Object.fromEntries(
    (Object.keys(byAspect) as Aspect[]).map((a) => {
      const mentions = byAspect[a].count;
      const enough = mentions >= 3;
      const score = mentions > 0 ? (1 + byAspect[a].sum / (mentions + 1)) / 2 : null;
      return [a, { score, mentions, enough, sufficientEvidence: enough }];
    })
  ) as Record<Aspect, { score: number | null; mentions: number; enough: boolean; sufficientEvidence: boolean }>;

  const sources = relevant.map((l) => ({
    providerId: l.providerId,
    providerName: l.providerName,
    rawRating: l.rating,
    ratingCount: l.ratingCount,
    adjustedRating: l.rating === null ? null : (l.rating * l.ratingCount + 3.9 * 30) / (l.ratingCount + 30),
  }));

  const perSource = sources.map((s) => ({
    providerId: s.providerId,
    raw: s.rawRating ?? 0,
    count: s.ratingCount,
    adjusted: Number((s.adjustedRating ?? 0).toFixed(2)),
  }));

  const weighted = sources
    .filter((s) => s.adjustedRating !== null)
    .reduce(
      (acc, s) => ({
        sum: acc.sum + s.adjustedRating! * Math.log1p(s.ratingCount),
        weight: acc.weight + Math.log1p(s.ratingCount),
      }),
      { sum: 0, weight: 0 }
    );

  const combined = weighted.weight ? Number((weighted.sum / weighted.weight).toFixed(2)) : null;

  const providerDeliveryRecord = Object.fromEntries(
    Object.entries(providerDelivery).map(([id, v]) => {
      const enough = v.count >= 3;
      const score = v.count > 0 ? (1 + v.sum / (v.count + 1)) / 2 : null;
      return [id, { score, mentions: v.count, enough, sufficientEvidence: enough }];
    })
  );

  const evidence = totalReviewsAnalyzed >= 10 ? "High" : totalReviewsAnalyzed >= 3 ? "Moderate" : "Low";
  const foodQuality =
    aspects.food.score !== null
      ? { value: Number((aspects.food.score * 5).toFixed(2)), basis: "Aspect sentiment score over food reviews" }
      : null;

  return {
    method: "lexicon-baseline-v0",
    disclaimer: "Heuristic word-list baseline; not a validated sentiment model or verified fact.",
    evidence,
    reviewsAnalyzed: totalReviewsAnalyzed,
    duplicatesRemoved: duplicateReviewsRemoved,
    duplicateReviewsRemoved,
    combinedRating: combined,
    rating: {
      combined,
      perSource,
    },
    foodQuality,
    sources,
    aspects,
    providerDelivery: providerDeliveryRecord,
    highlights: {
      positive: positiveHighlights,
      negative: negativeHighlights,
    },
  };
}
