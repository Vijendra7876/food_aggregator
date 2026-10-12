import type { Listing } from '../types';
import { tokens, dice } from './text';

const STOP = new Set(['full', 'regular', 'plate', 'dum']); // configurable noise words
export interface ItemOffer { providerId: string; providerItemName: string; price: number | null; available: boolean }
export interface CanonicalItem { id: string; name: string; veg: boolean; portion: 'half' | 'full'; offers: ItemOffer[] }

export function parseItem(name: string) {
  const t = tokens(name);
  return { core: t.filter(x => !STOP.has(x) && x !== 'half'), portion: (t.includes('half') ? 'half' : 'full') as 'half' | 'full' };
}

/** Match menu items across providers INSIDE one canonical restaurant. Portion and veg must agree. */
export function matchMenus(restaurantId: string, listings: Listing[]): CanonicalItem[] {
  const items: (CanonicalItem & { core: string[] })[] = [];
  for (const l of listings) for (const it of l.menu) {
    const { core, portion } = parseItem(it.name);
    const offer: ItemOffer = { providerId: l.providerId, providerItemName: it.name, price: it.price, available: it.available !== false && it.price != null };
    const hit = items.find(c => c.portion === portion && c.veg === it.veg && !c.offers.some(o => o.providerId === l.providerId) && dice(c.core, core) >= 0.75);
    if (hit) hit.offers.push(offer);
    else items.push({
      id: `${restaurantId}:${core.join('-')}${portion === 'half' ? '-half' : ''}${it.veg ? '' : '-nv'}`,
      name: it.name.replace(/\s*\((full|half|regular)\)/i, '').replace(/\s+regular$/i, '') + (portion === 'half' ? ' (Half)' : ''),
      veg: it.veg, portion, offers: [offer], core,
    });
  }
  return items.map(({ core, ...rest }) => rest);
}
