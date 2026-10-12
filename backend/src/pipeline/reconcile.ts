import crypto from 'node:crypto';
import type { Listing, Provider } from '../types';
import { haversineKm, digits10, norm, round2 } from './text';
import { matchMenus, type CanonicalItem } from './menu';

export type FreshStatus = 'fresh' | 'aging' | 'stale';
export const freshness = (iso: string, now = Date.now()) => {
  const ageMin = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  const status: FreshStatus = ageMin <= 30 ? 'fresh' : ageMin <= 180 ? 'aging' : 'stale';
  return { ageMin, status };
};

export interface Observation { canonicalId: string; attribute: string; value: string | number | null; providerId: string; recordId: string; observedAt: string; confidence: number; validation: 'valid' }
export interface Conflict { attribute: string; severity: 'info' | 'warn'; detail: string; policy: string }
export interface CanonicalRestaurant {
  id: string; name: string; area: string; lat: number; lng: number; phone: string | null; cuisines: string[];
  listings: Listing[]; items: CanonicalItem[]; observations: Observation[]; conflicts: Conflict[];
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtPhone = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;

/**
 * Attribute-specific reconciliation policies:
 *  name      -> from highest-trust source      | location -> median of sources
 *  phone     -> majority vote, trust tie-break | cuisines -> union
 *  price/eta/fees/offers/ratings -> NEVER merged: kept per provider (they legitimately differ)
 */
export function buildRestaurant(group: Listing[], providers: Provider[]): CanonicalRestaurant {
  const trust = (id: string) => providers.find(p => p.id === id)?.trust ?? 0.5;
  const pname = (id: string) => providers.find(p => p.id === id)?.name ?? id;
  const listings = [...group].sort((a, b) => trust(b.providerId) - trust(a.providerId));
  const id = 'r_' + crypto.createHash('sha1').update(group.map(l => l.id).sort()[0]).digest('hex').slice(0, 8);
  const top = listings[0];
  const lat = median(listings.map(l => l.lat)), lng = median(listings.map(l => l.lng));

  const votes = new Map<string, number>();
  for (const l of listings) { const d = digits10(l.phone); if (d.length === 10) votes.set(d, (votes.get(d) ?? 0) + 1 + trust(l.providerId) / 10); }
  const phoneD = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const cuisines = [...new Map(listings.flatMap(l => l.cuisines).map(c => [c.toLowerCase(), c])).values()];
  const parts = top.address.split(',').map(s => s.trim());
  const conflicts: Conflict[] = [];
  const phones = new Set(listings.map(l => digits10(l.phone)).filter(d => d.length === 10));
  if (phones.size > 1) conflicts.push({ attribute: 'phone', severity: 'warn', detail: `Providers report ${phones.size} different phone numbers`, policy: 'Majority vote, trust as tie-break' });
  for (const l of listings) { const m = Math.round(haversineKm(l, { lat, lng }) * 1000); if (m > 150) conflicts.push({ attribute: 'location', severity: 'warn', detail: `${pname(l.providerId)} pin is ${m} m from the median location`, policy: 'Median of source coordinates' }); }
  if (new Set(listings.map(l => norm(l.name))).size > 1) conflicts.push({ attribute: 'name', severity: 'info', detail: 'Names differ: ' + listings.map(l => `"${l.name}" (${pname(l.providerId)})`).join(', '), policy: 'Canonical name taken from highest-trust source' });

  const items = matchMenus(id, listings);
  for (const it of items) {
    const p = it.offers.filter(o => o.price != null).map(o => o.price as number);
    if (p.length > 1 && Math.max(...p) / Math.min(...p) > 1.1)
      conflicts.push({ attribute: `price:${it.name}`, severity: 'info', detail: `${it.name}: ₹${Math.min(...p)}–₹${Math.max(...p)} across providers`, policy: 'Provider-specific offers: kept separate, never averaged' });
  }

  const observations: Observation[] = [];
  for (const l of listings) {
    const f = freshness(l.fetchedAt).status;
    const confidence = round2(trust(l.providerId) * (f === 'fresh' ? 1 : f === 'aging' ? 0.8 : 0.5));
    const obs = (attribute: string, value: string | number | null) => observations.push({ canonicalId: id, attribute, value, providerId: l.providerId, recordId: l.recordId, observedAt: l.fetchedAt, confidence, validation: 'valid' });
    obs('rating', l.rating); obs('etaMin', l.etaMin); obs('deliveryFee', l.deliveryFee); obs('platformFee', l.platformFee); obs('phone', digits10(l.phone) || null);
    for (const it of l.menu) obs(`price:${it.name}`, it.price);
  }
  return { id, name: top.name.split(/\s[-–]\s|\(/)[0].trim(), area: parts.length >= 2 ? parts[parts.length - 2] : parts[0], lat, lng, phone: phoneD ? fmtPhone(phoneD) : null, cuisines, listings, items, observations, conflicts };
}
