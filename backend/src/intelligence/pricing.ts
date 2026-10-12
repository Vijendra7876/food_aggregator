import type { CanonicalRestaurant } from '../pipeline/reconcile';
import type { Listing } from '../types';
import { round2 } from '../pipeline/text';

export const FOOD_GST = 0.05, FEE_GST = 0.18; // ASSUMED rates, labelled as assumptions in every response
export interface Selection { itemId: string; qty: number }

export function priceBasket(r: CanonicalRestaurant, l: Listing, sel: Selection[]) {
  const missing: string[] = []; let subtotal = 0;
  for (const s of sel) {
    const item = r.items.find(i => i.id === s.itemId);
    const offer = item?.offers.find(o => o.providerId === l.providerId);
    if (!item || !offer || !offer.available || offer.price == null) { missing.push(item?.name ?? s.itemId); continue; }
    subtotal += offer.price * s.qty;
  }
  if (missing.length) return { providerId: l.providerId, available: false as const, missing, total: null, verified: false as const };

  const unknowns: string[] = [];
  if (l.deliveryFee == null) unknowns.push('delivery fee');
  if (l.platformFee == null) unknowns.push('platform fee');
  const delivery = l.deliveryFee ?? 0, platform = l.platformFee ?? 0; // unknown contributes 0 to the SUM only; flagged below, total becomes "at least"
  const o = l.offer;
  const discount = o && subtotal >= o.minOrder ? Math.min(o.cap, round2(subtotal * o.pct / 100)) : 0;
  const foodTax = round2(subtotal * FOOD_GST), feeTax = round2((delivery + platform) * FEE_GST);
  return {
    providerId: l.providerId, available: true as const, missing: [] as string[],
    subtotal: round2(subtotal), foodTax, deliveryFee: l.deliveryFee, platformFee: l.platformFee, feeTax, discount,
    discountNote: o ? (discount ? `${o.label} applied` : `${o.label} (not met: add ₹${round2(o.minOrder - subtotal)} more)`) : null,
    total: round2(subtotal + foodTax + delivery + platform + feeTax - discount),
    isLowerBound: unknowns.length > 0, unknowns,
    verified: false as const, // flips to true ONLY if an official integration confirms the checkout total
    assumptions: [`Food GST assumed ${FOOD_GST * 100}%`, `GST on fees assumed ${FEE_GST * 100}%`, 'Estimate from listing data, not a verified checkout total'],
  };
}
export type Pricing = ReturnType<typeof priceBasket>;
