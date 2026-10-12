import type { CanonicalRestaurant } from '../pipeline/reconcile';
import { norm, round2 } from '../pipeline/text';

// ---- Heuristic baseline: lexicon + aspect keywords. A *heuristic score*, not a validated model. ----
const POS = new Set('excellent great good amazing delicious tasty flavourful flavorful fresh best fast quick polite friendly generous worth yummy perfect hot superb nice awesome'.split(' '));
const NEG = new Set('bad cold stale bland late slow rude terrible worst expensive overpriced delayed delay awful poor tiny soggy greasy hour missing spilled'.split(' '));
const NEGATE = new Set(['not', 'never', 'no', 'dont', 'didnt', 'wasnt', 'isnt']);
export type Aspect = 'food' | 'delivery' | 'value' | 'service';
const ASPECT_WORDS: Record<Aspect, string[]> = {
  food: 'food taste tasty biryani pizza flavour flavourful flavor flavourful crust cheese crust bread chicken paneer fresh stale bland soggy delicious'.split(' '),
  delivery: 'delivery delivered rider arrived arrive late delay delayed hour packaging fast quick slow'.split(' '),
  value: 'price priced expensive overpriced cheap value portion worth'.split(' '),
  service: 'staff service support rude polite refund behaviour'.split(' '),
};
const ASPECTS = Object.keys(ASPECT_WORDS) as Aspect[];
const stem = (t: string) => t.replace(/s$/, '');
const inSet = (s: Set<string>, t: string) => s.has(t) || s.has(stem(t));
const HALF_LIFE_DAYS = 90, MIN_MENTIONS = 3, PRIOR_MEAN = 3.9, PRIOR_STRENGTH = 30;

interface Mention { aspect: Aspect; sentiment: -1 | 1; w: number; snippet: string; providerId: string }

export function analyzeReview(text: string): { aspect: Aspect; sentiment: -1 | 1; snippet: string }[] {
  const out: { aspect: Aspect; sentiment: -1 | 1; snippet: string }[] = [];
  for (const clause of text.split(/[.!?;,]|\bbut\b|\bhowever\b/i)) {
    const t = norm(clause).split(' ').filter(Boolean);
    if (!t.length) continue;
    let s = 0;
    t.forEach((w, i) => {
      const flip = t.slice(Math.max(0, i - 2), i).some(x => NEGATE.has(x)) ? -1 : 1;
      if (inSet(POS, w)) s += flip; else if (inSet(NEG, w)) s -= flip;
    });
    if (s === 0) continue;
    for (const a of ASPECTS) if (t.some(w => ASPECT_WORDS[a].includes(w) || ASPECT_WORDS[a].includes(stem(w))))
      out.push({ aspect: a, sentiment: s > 0 ? 1 : -1, snippet: clause.trim() });
  }
  return out;
}
const agg = (ms: Mention[]) => {
  const W = ms.reduce((a, x) => a + x.w, 0);
  // shrink toward neutral with 1 pseudo-observation, then map [-1,1] -> [0,1]
  return { score: ms.length ? round2(((ms.reduce((a, x) => a + x.w * x.sentiment, 0) / (W + 1)) + 1) / 2) : null, mentions: ms.length, enough: ms.length >= MIN_MENTIONS };
};

export function reputation(r: CanonicalRestaurant, calibration: Record<string, number> = {}) {
  // 1) de-duplicate syndicated/duplicated reviews (same normalised text); listings are trust-ordered so the best source keeps it
  const seen = new Set<string>(); let duplicatesRemoved = 0;
  const reviews = r.listings.flatMap(l => l.reviews.map(rev => ({ ...rev, providerId: l.providerId }))).filter(rev => {
    const k = norm(rev.text); if (seen.has(k)) { duplicatesRemoved++; return false; } seen.add(k); return true;
  });
  // 2) aspect mentions, recency-weighted
  const mentions: Mention[] = reviews.flatMap(rev => analyzeReview(rev.text).map(a => ({ ...a, w: Math.pow(0.5, rev.daysAgo / HALF_LIFE_DAYS), providerId: rev.providerId })));
  const aspects = Object.fromEntries(ASPECTS.map(a => [a, agg(mentions.filter(x => x.aspect === a))])) as Record<Aspect, ReturnType<typeof agg>>;
  const deliveryMentions = mentions.filter(x => x.aspect === 'delivery');
  const providerDelivery = Object.fromEntries(r.listings.map(l => [l.providerId, agg(deliveryMentions.filter(x => x.providerId === l.providerId))]));

  // 3) per-source Bayesian-shrunk ratings, confidence-weighted by log(count); NOT a plain average of stars
  const perSource = r.listings.filter(l => l.rating != null && l.ratingCount).map(l => {
    const n = l.ratingCount as number, raw = l.rating as number;
    const adjusted = round2((n * raw + PRIOR_STRENGTH * PRIOR_MEAN) / (n + PRIOR_STRENGTH) + (calibration[l.providerId] ?? 0));
    return { providerId: l.providerId, raw, count: n, adjusted, weight: Math.log(1 + n) };
  });
  const W = perSource.reduce((a, x) => a + x.weight, 0);
  const combined = W ? round2(perSource.reduce((a, x) => a + x.weight * x.adjusted, 0) / W) : null;

  const food = aspects.food;
  const foodQuality = combined == null ? null
    : food.enough ? { value: round2(0.7 * combined + 0.3 * (1 + 4 * (food.score as number))), basis: 'ratings blended with food-aspect sentiment' }
    : { value: combined, basis: 'ratings only (not enough food-aspect mentions)' };

  const totalRatings = perSource.reduce((a, x) => a + x.count, 0);
  const evidence = totalRatings >= 500 && reviews.length >= 10 ? 'high' : totalRatings >= 100 ? 'medium' : 'low';
  const top = (sent: 1 | -1) => mentions.filter(x => x.sentiment === sent).sort((a, b) => b.w - a.w).slice(0, 3).map(x => ({ aspect: x.aspect, snippet: x.snippet, providerId: x.providerId }));
  return {
    method: 'lexicon-baseline-v0', evidence, reviewsAnalyzed: reviews.length, duplicatesRemoved,
    rating: { combined, perSource }, foodQuality, aspects, providerDelivery, highlights: { positive: top(1), negative: top(-1) },
    disclaimer: 'Heuristic scores from a small review sample; not verified facts and not a validated model. Delivery reliability is provider-specific, food quality is restaurant-level.',
  };
}
export type Reputation = ReturnType<typeof reputation>;
