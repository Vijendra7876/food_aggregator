import type { Fresh, Listing, Priority } from "../types.js";

const PRIORITY_CANONICAL: Record<string, "best_value" | "cheapest" | "fastest" | "most_reliable" | "best_rated"> = {
  value: "best_value",
  best_value: "best_value",
  cheapest: "cheapest",
  fastest: "fastest",
  reliable: "most_reliable",
  most_reliable: "most_reliable",
  rated: "best_rated",
  best_rated: "best_rated",
};

const WEIGHTS: Record<"best_value" | "cheapest" | "fastest" | "most_reliable" | "best_rated", { cost: number; eta: number; reliability: number; rating: number }> = {
  best_value: { cost: 0.4, eta: 0.2, reliability: 0.25, rating: 0.15 },
  cheapest: { cost: 0.7, eta: 0.1, reliability: 0.1, rating: 0.1 },
  fastest: { cost: 0.1, eta: 0.7, reliability: 0.1, rating: 0.1 },
  most_reliable: { cost: 0.1, eta: 0.15, reliability: 0.65, rating: 0.1 },
  best_rated: { cost: 0.1, eta: 0.1, reliability: 0.2, rating: 0.6 },
};

const normLower = (v: number, min: number, max: number) => (max === min ? 0.5 : 1 - (v - min) / (max - min));

function toFresh(fetchedAt: string, status?: "fresh" | "aging" | "stale"): Fresh {
  const ageMin = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000));
  const st = status ?? (ageMin <= 30 ? "fresh" : ageMin <= 180 ? "aging" : "stale");
  return { ageMin, status: st };
}

export function rankOptions(
  options: Array<{ listing: Listing; pricing: any; reliability: number | null; rating: number | null }>,
  priorityInput: Priority | string,
  maxEta?: number | null
) {
  const canonPriority = PRIORITY_CANONICAL[priorityInput] ?? "best_value";
  const excluded: Array<{ providerId: string; providerName: string; reason: string }> = [];

  const eligible = options.filter((o) => {
    if (!o.pricing.available) {
      excluded.push({
        providerId: o.listing.providerId,
        providerName: o.listing.providerName,
        reason: `Cannot supply: ${(o.pricing.missingItems ?? []).join(", ") || "Unavailable items"}`,
      });
      return false;
    }
    if (maxEta && o.listing.etaMinutes !== null && o.listing.etaMinutes > maxEta) {
      excluded.push({
        providerId: o.listing.providerId,
        providerName: o.listing.providerName,
        reason: `ETA ${o.listing.etaMinutes} min exceeds ${maxEta} min limit`,
      });
      return false;
    }
    return true;
  });

  const costs = eligible.map((o) => o.pricing.total as number).filter((n): n is number => n !== null);
  const etas = eligible.map((o) => o.listing.etaMinutes).filter((n): n is number => n !== null);
  const weights = WEIGHTS[canonPriority];

  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;
  const minEta = etas.length ? Math.min(...etas) : 0;
  const maxEtaVal = etas.length ? Math.max(...etas) : 0;

  const intermediate = eligible.map((o) => {
    const costVal = o.pricing.total === null ? 0.5 : normLower(o.pricing.total, minCost, maxCost);
    const etaVal = o.listing.etaMinutes === null ? 0.5 : etas.length ? normLower(o.listing.etaMinutes, minEta, maxEtaVal) : 0.5;
    const relVal = o.reliability ?? 0.5;
    const ratVal = o.rating === null ? 0.5 : Math.max(0, Math.min(1, (o.rating - 1) / 4));

    const factorScores = {
      cost: costVal,
      eta: etaVal,
      reliability: relVal,
      rating: ratVal,
    };

    const freshnessPenalty = o.listing.freshness === "fresh" ? 0 : o.listing.freshness === "aging" ? 0.02 : 0.06;
    const score =
      weights.cost * costVal +
      weights.eta * etaVal +
      weights.reliability * relVal +
      weights.rating * ratVal -
      freshnessPenalty;

    const factorList = [
      { factor: "Cost", weight: weights.cost, value: Number(costVal.toFixed(2)), contribution: Number((costVal * weights.cost).toFixed(2)), known: o.pricing.total !== null },
      { factor: "Speed", weight: weights.eta, value: Number(etaVal.toFixed(2)), contribution: Number((etaVal * weights.eta).toFixed(2)), known: o.listing.etaMinutes !== null },
      { factor: "Reliability", weight: weights.reliability, value: Number(relVal.toFixed(2)), contribution: Number((relVal * weights.reliability).toFixed(2)), known: o.reliability !== null },
      { factor: "Rating", weight: weights.rating, value: Number(ratVal.toFixed(2)), contribution: Number((ratVal * weights.rating).toFixed(2)), known: o.rating !== null },
    ];

    const reasons = [
      `Cost: ${(costVal * 100).toFixed(0)}% score (weight ${(weights.cost * 100).toFixed(0)}%)`,
      `ETA: ${o.listing.etaMinutes !== null ? `${o.listing.etaMinutes}m` : "unknown"} (weight ${(weights.eta * 100).toFixed(0)}%)`,
      `Reliability: ${(relVal * 100).toFixed(0)}% (weight ${(weights.reliability * 100).toFixed(0)}%)`,
      `Rating: ${o.rating !== null ? o.rating.toFixed(1) : "unrated"} (weight ${(weights.rating * 100).toFixed(0)}%)`,
    ];

    return {
      listing: o.listing,
      providerId: o.listing.providerId,
      providerName: o.listing.providerName,
      url: o.listing.url,
      etaMin: o.listing.etaMinutes,
      etaMinutes: o.listing.etaMinutes,
      freshness: toFresh(o.listing.fetchedAt, o.listing.freshness),
      pricing: o.pricing,
      score: Number(score.toFixed(3)),
      factors: factorList,
      factorScores,
      weights,
      reasons,
      badges: [] as string[],
    };
  });

  intermediate.sort((a, b) => b.score - a.score);

  if (intermediate.length) {
    intermediate[0].badges.push("Top pick");
    const cheapest = [...intermediate].sort((a, b) => (a.pricing.total ?? Infinity) - (b.pricing.total ?? Infinity))[0];
    if (cheapest && !cheapest.badges.includes("Top pick")) cheapest.badges.push("Cheapest");
    const fastest = intermediate.filter((x) => x.etaMin !== null).sort((a, b) => (a.etaMin ?? Infinity) - (b.etaMin ?? Infinity))[0];
    if (fastest && !fastest.badges.includes("Top pick") && !fastest.badges.includes("Cheapest")) fastest.badges.push("Fastest");
  }

  const rankedOptions = intermediate.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));

  return {
    priority: canonPriority,
    weights,
    options: rankedOptions,
    ranked: rankedOptions,
    excluded,
    disclaimer: "Scores are explainable heuristics with unvalidated weights, not a guarantee of the best choice.",
  };
}
