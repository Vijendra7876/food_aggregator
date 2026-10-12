import type { Pricing } from './pricing';
import { round2 } from '../pipeline/text';

export type Priority = 'cheapest' | 'fastest' | 'reliable' | 'rated' | 'value';
/** HYPOTHESES to test with real users, not established facts. Keep configurable. */
export const WEIGHTS: Record<Priority, { cost: number; eta: number; reliability: number; rating: number }> = {
  cheapest: { cost: .7, eta: .1, reliability: .1, rating: .1 }, fastest: { cost: .1, eta: .7, reliability: .1, rating: .1 },
  reliable: { cost: .1, eta: .15, reliability: .65, rating: .1 }, rated: { cost: .1, eta: .1, reliability: .2, rating: .6 },
  value: { cost: .4, eta: .2, reliability: .25, rating: .15 },
};
export const STALE_PENALTY = { fresh: 0, aging: 0.02, stale: 0.06 } as const;
type Fresh = { ageMin: number; status: 'fresh' | 'aging' | 'stale' };
export interface Cand { providerId: string; providerName: string; pricing: Pricing; etaMin: number | null; reliability: number | null; reliabilityMentions: number; rating: number | null; freshness: Fresh; url: string }

const minmax = (v: number, lo: number, hi: number, invert: boolean) => hi === lo ? 1 : invert ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function score(cands: Cand[], w: (typeof WEIGHTS)[Priority]) {
  const totals = cands.map(c => c.pricing.total as number), etas = cands.map(c => c.etaMin).filter((x): x is number => x != null);
  return cands.map(c => {
    const f = {
      cost: { v: minmax(c.pricing.total as number, Math.min(...totals), Math.max(...totals), true), known: true },
      eta: c.etaMin == null || !etas.length ? { v: .5, known: false } : { v: minmax(c.etaMin, Math.min(...etas), Math.max(...etas), true), known: true },
      reliability: c.reliability == null ? { v: .5, known: false } : { v: c.reliability, known: true },
      rating: c.rating == null ? { v: .5, known: false } : { v: (c.rating - 1) / 4, known: true },
    };
    const penalty = STALE_PENALTY[c.freshness.status];
    const total = (Object.keys(f) as (keyof typeof f)[]).reduce((a, k) => a + w[k] * f[k].v, 0) - penalty;
    return { c, f, penalty, total: round2(total) };
  });
}

export function rank(cands: Cand[], priority: Priority, maxEta?: number) {
  const excluded: { providerId: string; providerName: string; reason: string }[] = [];
  const ok: Cand[] = [];
  for (const c of cands) {
    if (!c.pricing.available) excluded.push({ providerId: c.providerId, providerName: c.providerName, reason: `Not available here: ${(c.pricing as { missing: string[] }).missing.join(', ')}` });
    else if (maxEta != null && c.etaMin != null && c.etaMin > maxEta) excluded.push({ providerId: c.providerId, providerName: c.providerName, reason: `Estimated ${c.etaMin} min exceeds your ${maxEta} min limit` });
    else ok.push(c);
  }
  const scored = score(ok, WEIGHTS[priority]).sort((a, b) => b.total - a.total);
  const valueWinner = score(ok, WEIGHTS.value).sort((a, b) => b.total - a.total)[0]?.c.providerId;
  const cheapest = [...ok].sort((a, b) => (a.pricing.total as number) - (b.pricing.total as number));
  const fastest = ok.filter(c => c.etaMin != null).sort((a, b) => (a.etaMin as number) - (b.etaMin as number));
  const reliable = ok.filter(c => c.reliability != null && c.reliabilityMentions >= 3).sort((a, b) => (b.reliability as number) - (a.reliability as number));
  const rated = ok.filter(c => c.rating != null).sort((a, b) => (b.rating as number) - (a.rating as number));

  const options = scored.map((s, i) => {
    const c = s.c, p = c.pricing as Extract<Pricing, { available: true }>;
    const badges = [cheapest[0]?.providerId === c.providerId && 'Cheapest', fastest[0]?.providerId === c.providerId && 'Fastest', valueWinner === c.providerId && 'Best overall value',
      reliable[0]?.providerId === c.providerId && (reliable[0].reliability as number) >= 0.55 && 'Most reliable', rated[0]?.providerId === c.providerId && 'Best rated'].filter(Boolean) as string[];
    const next = cheapest.find(x => x.providerId !== cheapest[0].providerId);
    const reasons: string[] = [];
    if (cheapest[0].providerId === c.providerId) reasons.push(next ? `Lowest estimated total (${inr(p.total)}), ${inr((next.pricing.total as number) - p.total)} below the next cheapest` : `Estimated total ${inr(p.total)}`);
    else reasons.push(`${inr(p.total - (cheapest[0].pricing.total as number))} more than the cheapest option`);
    reasons.push(c.etaMin == null ? 'Delivery time unknown: neutral value assumed' : `Delivery estimate ${c.etaMin} min${maxEta ? ` (within your ${maxEta} min limit)` : ''}`);
    reasons.push(c.reliability == null ? `Not enough delivery reviews on this provider (${c.reliabilityMentions}): neutral value assumed` : `Delivery sentiment ${Math.round(c.reliability * 100)}/100 from ${c.reliabilityMentions} review mentions`);
    if (c.rating != null) reasons.push(`Source rating ${c.rating.toFixed(2)}/5 (confidence-adjusted)`);
    if (p.isLowerBound) reasons.push(`Total is "at least": ${p.unknowns.join(' and ')} unknown`);
    if (s.penalty) reasons.push(`Data is ${c.freshness.status} (${c.freshness.ageMin} min old): score reduced by ${s.penalty}`);
    const w = WEIGHTS[priority];
    return {
      rank: i + 1, providerId: c.providerId, providerName: c.providerName, url: c.url, etaMin: c.etaMin, freshness: c.freshness, pricing: p,
      score: s.total, badges, reasons,
      factors: (Object.keys(s.f) as (keyof typeof s.f)[]).map(k => ({ factor: k, weight: w[k], value: round2(s.f[k].v), contribution: round2(w[k] * s.f[k].v), known: s.f[k].known })),
    };
  });
  return { options, excluded };
}
