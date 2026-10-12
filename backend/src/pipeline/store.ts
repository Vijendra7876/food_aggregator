import type { Adapter, Listing } from '../types';
import { validate, type Issue } from './validate';
import { resolveEntities, type Candidate, type Decision } from './resolve';
import { buildRestaurant, type CanonicalRestaurant } from './reconcile';

/** In-memory canonical store. Swap for PostgreSQL later (see db/schema.sql) - the pipeline functions stay the same. */
export class Store {
  listings: Listing[] = []; issues: Issue[] = []; decisions: Decision[] = [];
  restaurants: CanonicalRestaurant[] = []; candidates: Candidate[] = [];
  constructor(private adapters: Adapter[]) {}
  get providers() { return this.adapters.map(a => a.provider); }
  providerName = (id: string) => this.providers.find(p => p.id === id)?.name ?? id;

  async init() {
    const settled = await Promise.allSettled(this.adapters.map(a => a.fetch()));
    const raw = settled.flatMap((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      this.issues.push({ providerId: this.adapters[i].provider.id, recordId: '-', level: 'listing', reason: 'adapter failed: provider unavailable' });
      return [];
    });
    const { valid, issues } = validate(raw);
    this.listings = valid; this.issues.push(...issues);
    this.rebuild();
  }
  rebuild() {
    const { groups, candidates } = resolveEntities(this.listings, this.decisions);
    this.restaurants = groups.map(g => buildRestaurant(g, this.providers));
    this.candidates = candidates;
  }
  decide(id: string, verdict: 'merge' | 'reject') {
    const c = this.candidates.find(x => x.id === id);
    if (!c) return false;
    this.decisions.push({ a: c.a, b: c.b, verdict });
    this.rebuild();
    return true;
  }
}
