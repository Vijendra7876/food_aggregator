import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../pipeline/store';
import { syntheticAdapters } from '../data/synthetic';
import { priceBasket } from '../intelligence/pricing';
import { analyzeReview } from '../intelligence/reputation';

const store = new Store(syntheticAdapters);
await store.init();
const find = (n: string, area: string) => store.restaurants.find(r => r.name === n && r.area === area)!;

test('same restaurant with messy names merges across 3 providers', () => {
  const r = find('Biryani House', 'Vesu');
  assert.equal(r.listings.length, 3);
});
test('different branches and similarly named restaurants are NOT merged', () => {
  assert.equal(find('Biryani House', 'Adajan').listings.length, 2);
  assert.equal(store.restaurants.filter(r => r.name === 'Biryani Hub').length, 1);
});
test('uncertain match goes to review queue and is not merged', () => {
  assert.equal(store.candidates.length, 1);
  assert.equal(store.restaurants.filter(r => r.name === 'Pizza Palace').length, 2);
});
test('approving a candidate merges, and the queue empties', () => {
  const s2 = new Store(syntheticAdapters); return s2.init().then(() => {
    s2.decide(s2.candidates[0].id, 'merge');
    assert.equal(s2.restaurants.filter(r => r.name === 'Pizza Palace').length, 1);
    assert.equal(s2.candidates.length, 0);
  });
});
test('invalid records are rejected / dropped with reasons', () => {
  const reasons = store.issues.map(i => i.reason).join('|');
  assert.match(reasons, /invalid coordinates/); assert.match(reasons, /non-positive price/);
});
test('menu matching handles spelling and size variants; half portion is separate', () => {
  const r = find('Biryani House', 'Vesu');
  const full = r.items.find(i => i.name.startsWith('Chicken') && i.portion === 'full')!;
  assert.equal(full.offers.length, 3);
  assert.ok(r.items.some(i => i.portion === 'half'));
});
test('pricing: unknown fee => lower bound, never zero-as-fact; offer threshold respected', () => {
  const r = find('Biryani House', 'Vesu'); const item = r.items.find(i => i.name === 'Chicken Dum Biryani')!;
  const dd = r.listings.find(l => l.providerId === 'dd')!;
  const p = priceBasket(r, dd, [{ itemId: item.id, qty: 1 }]) as any;
  assert.equal(p.isLowerBound, true); assert.deepEqual(p.unknowns, ['platform fee']); assert.equal(p.verified, false);
  const fh = priceBasket(r, r.listings.find(l => l.providerId === 'fh')!, [{ itemId: item.id, qty: 2 }]) as any;
  assert.equal(fh.discount, 96); // 20% of 480, under the 100 cap
});
test('aspect sentiment splits a mixed review', () => {
  const a = analyzeReview('The biryani was excellent, but the delivery took almost an hour.');
  assert.ok(a.some(x => x.aspect === 'food' && x.sentiment === 1)); assert.ok(a.some(x => x.aspect === 'delivery' && x.sentiment === -1));
});
