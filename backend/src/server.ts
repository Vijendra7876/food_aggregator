import express from 'express';
import cors from 'cors';
import { Store } from './pipeline/store';
import { syntheticAdapters } from './data/synthetic';
import { freshness } from './pipeline/reconcile';
import { tokens } from './pipeline/text';
import { reputation } from './intelligence/reputation';
import { priceBasket } from './intelligence/pricing';
import { rank, WEIGHTS, type Priority, type Cand } from './intelligence/ranking';

export const store = new Store(syntheticAdapters);
const app = express();
app.use(cors()); app.use(express.json());
const bad = (res: express.Response, message: string, code = 400) => res.status(code).json({ error: { code: code === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message } });

app.get('/api/meta', (_q, res) => res.json({ dataMode: 'synthetic', notice: 'All providers, prices, ratings and reviews are synthetic demo data.', providers: store.providers, priorities: WEIGHTS }));

app.post('/api/auth/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return bad(res, 'Google sign-in is not configured on the server', 503);

  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length === 0 || credential.length > 10000) {
    return bad(res, 'A valid Google credential is required');
  }

  try {
    const verification = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: credential }),
    });
    if (!verification.ok) return bad(res, 'Google could not verify this sign-in', 401);

    const claims: unknown = await verification.json();
    if (!claims || typeof claims !== 'object') return bad(res, 'Google returned an invalid sign-in response', 401);
    const identity = claims as Record<string, unknown>;
    const expiresIn = Number(identity.expires_in);
    const validIssuer = identity.iss === 'accounts.google.com' || identity.iss === 'https://accounts.google.com';
    if (identity.aud !== clientId || !validIssuer || !Number.isFinite(expiresIn) || expiresIn <= 0 ||
      identity.email_verified !== 'true' || typeof identity.sub !== 'string' ||
      typeof identity.email !== 'string' || typeof identity.name !== 'string') {
      return bad(res, 'Google sign-in could not be validated for this application', 401);
    }

    return res.json({
      user: {
        id: identity.sub,
        email: identity.email,
        name: identity.name,
        ...(typeof identity.picture === 'string' ? { picture: identity.picture } : {}),
      },
    });
  } catch {
    return bad(res, 'Unable to verify sign-in with Google right now', 502);
  }
});

app.get('/api/search', (req, res) => {
  const qt = tokens(String(req.query.q ?? ''));
  const cuisine = String(req.query.cuisine ?? '').toLowerCase();
  const maxEta = req.query.maxEta ? Number(req.query.maxEta) : undefined, minRating = req.query.minRating ? Number(req.query.minRating) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(50, Number(req.query.pageSize) || 20);
  const rows = store.restaurants.map(r => {
    const nameT = new Set(tokens(r.name + ' ' + r.area)), cuisT = new Set(r.cuisines.flatMap(c => tokens(c)));
    const itemT = r.items.map(i => ({ i, t: new Set(tokens(i.name)) }));
    let relevance = 0;
    const allHit = qt.every(t => { const h = nameT.has(t) ? 3 : cuisT.has(t) ? 2 : itemT.some(x => x.t.has(t)) ? 1 : 0; relevance += h; return h > 0; });
    const rep = reputation(r);
    const matchedItems = qt.length ? itemT.filter(x => qt.some(t => x.t.has(t) && !nameT.has(t))).slice(0, 3).map(({ i }) => {
      const p = i.offers.filter(o => o.available && o.price != null).map(o => o.price as number);
      return { name: i.name, minPrice: p.length ? Math.min(...p) : null, maxPrice: p.length ? Math.max(...p) : null, providers: p.length };
    }) : [];
    return { allHit, relevance, r, rep, matchedItems };
  }).filter(x => x.allHit && (!cuisine || x.r.cuisines.some(c => c.toLowerCase() === cuisine))
    && (maxEta == null || x.r.listings.some(l => l.etaMin != null && l.etaMin <= maxEta))
    && (minRating == null || (x.rep.rating.combined ?? 0) >= minRating))
    .sort((a, b) => b.relevance - a.relevance || (b.rep.rating.combined ?? 0) - (a.rep.rating.combined ?? 0));
  res.json({
    total: rows.length, page, pageSize,
    results: rows.slice((page - 1) * pageSize, page * pageSize).map(({ r, rep, matchedItems }) => ({
      id: r.id, name: r.name, area: r.area, cuisines: r.cuisines, matchedItems,
      rating: { combined: rep.rating.combined, evidence: rep.evidence },
      providers: r.listings.map(l => ({ id: l.providerId, name: store.providerName(l.providerId), etaMin: l.etaMin, freshness: freshness(l.fetchedAt) })),
    })),
  });
});

app.get('/api/restaurants/:id', (req, res) => {
  const r = store.restaurants.find(x => x.id === req.params.id);
  if (!r) return bad(res, 'Restaurant not found', 404);
  const listings = r.listings.map(l => ({ providerId: l.providerId, providerName: store.providerName(l.providerId), recordId: l.recordId, providerListingName: l.name, etaMin: l.etaMin, deliveryFee: l.deliveryFee, platformFee: l.platformFee,
    rating: l.rating, ratingCount: l.ratingCount, offer: l.offer ?? null, url: l.url, fetchedAt: l.fetchedAt, freshness: freshness(l.fetchedAt) }));
  const staleConflicts = listings.filter(l => l.freshness.status !== 'fresh').map(l => ({ attribute: 'freshness', severity: l.freshness.status === 'stale' ? 'warn' : 'info', detail: `${l.providerName} data is ${l.freshness.ageMin} min old (${l.freshness.status})`, policy: 'Shown with badge; ranking score reduced' }));
  res.json({ id: r.id, name: r.name, area: r.area, lat: r.lat, lng: r.lng, phone: r.phone, cuisines: r.cuisines, listings, reputation: reputation(r),
    items: r.items.map(i => ({ ...i, offers: i.offers.map(o => ({ ...o, providerName: store.providerName(o.providerId) })) })),
    conflicts: [...r.conflicts, ...staleConflicts], observations: r.observations });
});

app.post('/api/compare', (req, res) => {
  const { restaurantId, selections, priority = 'value', maxEta } = req.body ?? {};
  const r = store.restaurants.find(x => x.id === restaurantId);
  if (!r) return bad(res, 'Unknown restaurantId', 404);
  if (!Array.isArray(selections) || !selections.length || !selections.every((s: any) => typeof s?.itemId === 'string' && Number.isInteger(s?.qty) && s.qty >= 1 && s.qty <= 20)) return bad(res, 'selections must be a non-empty array of { itemId, qty (1-20) }');
  if (!(priority in WEIGHTS)) return bad(res, `priority must be one of ${Object.keys(WEIGHTS).join(', ')}`);
  if (maxEta != null && !(Number(maxEta) > 0)) return bad(res, 'maxEta must be a positive number');
  const rep = reputation(r);
  const cands: Cand[] = r.listings.map(l => ({
    providerId: l.providerId, providerName: store.providerName(l.providerId), pricing: priceBasket(r, l, selections), etaMin: l.etaMin,
    reliability: rep.providerDelivery[l.providerId]?.enough ? rep.providerDelivery[l.providerId].score : null, reliabilityMentions: rep.providerDelivery[l.providerId]?.mentions ?? 0,
    rating: rep.rating.perSource.find(s => s.providerId === l.providerId)?.adjusted ?? null, freshness: freshness(l.fetchedAt), url: l.url }));
  res.json({ priority, weights: WEIGHTS[priority as Priority], ...rank(cands, priority as Priority, maxEta != null ? Number(maxEta) : undefined),
    disclaimer: 'Estimates from listing data. Provider checkout totals may differ. Nothing has been ordered.' });
});

app.get('/api/admin/review-queue', (_q, res) => {
  const find = (id: string) => store.listings.find(l => l.id === id)!;
  res.json({ pending: store.candidates.map(c => ({ ...c, a: { id: c.a, providerName: store.providerName(find(c.a).providerId), name: find(c.a).name, address: find(c.a).address }, b: { id: c.b, providerName: store.providerName(find(c.b).providerId), name: find(c.b).name, address: find(c.b).address } })), decisions: store.decisions });
});
app.post('/api/admin/review-queue/:id/decision', (req, res) => {
  const verdict = req.body?.verdict;
  if (verdict !== 'merge' && verdict !== 'reject') return bad(res, "verdict must be 'merge' or 'reject'");
  return store.decide(req.params.id, verdict) ? res.json({ ok: true, restaurants: store.restaurants.length }) : bad(res, 'Candidate not found', 404);
});
app.get('/api/admin/pipeline', (_q, res) => res.json({ providers: store.providers, rawListings: store.listings.length, canonicalRestaurants: store.restaurants.length, pendingReviews: store.candidates.length, issues: store.issues }));

const PORT = Number(process.env.PORT) || 4000;
if (process.env.NODE_ENV !== 'test') store.init().then(() => app.listen(PORT, () => console.log(`FoodLens API on http://localhost:${PORT} (${store.restaurants.length} canonical restaurants)`)));
