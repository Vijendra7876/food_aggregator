import crypto from 'node:crypto';
import type { Listing } from '../types';
import { tokens, levSim, jaccard, containment, haversineKm, digits10 } from './text';

export const AUTO_MERGE = 0.85; // >= : merge automatically
export const REVIEW = 0.6;      // >= and < AUTO_MERGE : human review queue
export const MAX_KM = 0.5;      // hard gate: further apart than this can never be the same outlet

export interface Parts { name: number; geo: number; address: number; phone: number | null; distanceM: number }
export interface Candidate { id: string; a: string; b: string; score: number; parts: Parts }
export interface Decision { a: string; b: string; verdict: 'merge' | 'reject' }

export function scorePair(a: Listing, b: Listing): { score: number; parts: Parts; blocked?: string } {
  const km = haversineKm(a, b);
  const parts: Parts = { name: 0, geo: 0, address: 0, phone: null, distanceM: Math.round(km * 1000) };
  if (km > MAX_KM) return { score: 0, parts, blocked: 'too far apart: different branch' };

  const ta = tokens(a.name), tb = tokens(b.name);
  parts.name = Math.max(levSim(ta.join(' '), tb.join(' ')), Math.min(ta.length, tb.length) >= 2 ? containment(ta, tb) : 0);
  parts.geo = km <= 0.1 ? 1 : Math.max(0, 1 - (km - 0.1) / 0.4);
  parts.address = jaccard(tokens(a.address), tokens(b.address));
  const pa = digits10(a.phone), pb = digits10(b.phone);
  if (pa.length === 10 && pb.length === 10) parts.phone = pa === pb ? 1 : 0;

  let score = parts.phone === null
    ? 0.4 * parts.name + 0.35 * parts.geo + 0.25 * parts.address
    : 0.3 * parts.name + 0.25 * parts.geo + 0.2 * parts.address + 0.25 * parts.phone;
  if (parts.phone === 0) score = Math.min(score, AUTO_MERGE - 0.01); // differing phones can never auto-merge
  return { score: Math.round(score * 1000) / 1000, parts };
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export function resolveEntities(listings: Listing[], decisions: Decision[] = []) {
  const verdicts = new Map(decisions.map(d => [pairKey(d.a, d.b), d.verdict]));
  const groups: Listing[][] = [];
  const candidates = new Map<string, Candidate>();

  for (const l of [...listings].sort((x, y) => x.id.localeCompare(y.id))) {
    let best: { g: Listing[]; score: number; other: Listing; parts: Parts } | null = null;
    for (const g of groups) {
      if (g.some(m => m.providerId === l.providerId)) continue; // one provider can't list the same outlet twice
      for (const m of g) {
        let { score, parts } = scorePair(l, m);
        const v = verdicts.get(pairKey(l.id, m.id));
        if (v === 'merge') score = 1; else if (v === 'reject') score = 0; // human decision wins
        if (!best || score > best.score) best = { g, score, other: m, parts };
      }
    }
    if (best && best.score >= AUTO_MERGE) best.g.push(l);
    else {
      if (best && best.score >= REVIEW) {
        const id = crypto.createHash('sha1').update(pairKey(l.id, best.other.id)).digest('hex').slice(0, 10);
        candidates.set(id, { id, a: l.id, b: best.other.id, score: best.score, parts: best.parts });
      }
      groups.push([l]); // uncertain => stays separate until a human approves. Never merge on a guess.
    }
  }
  return { groups, candidates: [...candidates.values()] };
}
