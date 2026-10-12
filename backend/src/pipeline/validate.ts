import type { Listing, RawListing } from '../types';

export interface Issue { providerId: string; recordId: string; level: 'listing' | 'item' | 'field'; reason: string }

/** Rejects unusable records, nulls out impossible fields. Never silently turns "bad" into 0. */
export function validate(raw: RawListing[]): { valid: Listing[]; issues: Issue[] } {
  const valid: Listing[] = [], issues: Issue[] = [];
  for (const r of raw) {
    const bad = (level: Issue['level'], reason: string) => issues.push({ providerId: r.providerId, recordId: r.recordId, level, reason });
    if (!r.name?.trim()) { bad('listing', 'missing name'); continue; }
    if (!(Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180)) { bad('listing', `invalid coordinates (${r.lat}, ${r.lng})`); continue; }
    const l: Listing = { ...r, id: `${r.providerId}:${r.recordId}` };
    if (l.rating != null && !(l.rating >= 0 && l.rating <= 5)) { bad('field', `rating ${l.rating} out of range -> unknown`); l.rating = null; }
    if (l.etaMin != null && !(l.etaMin > 0 && l.etaMin < 300)) { bad('field', `eta ${l.etaMin} implausible -> unknown`); l.etaMin = null; }
    l.menu = l.menu.filter(it => {
      if (it.price == null || it.price > 0) return true; // null stays "unknown"
      bad('item', `"${it.name}" has non-positive price ${it.price}, dropped`); return false;
    });
    valid.push(l);
  }
  return { valid, issues };
}
