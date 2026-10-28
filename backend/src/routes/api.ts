import { Router } from "express";
import type { Request, Response } from "express";
import type { Priority } from "../types.js";
import { reputation } from "../intelligence/reputation.js";
import { priceBasket } from "../intelligence/pricing.js";
import { rankOptions } from "../intelligence/ranking.js";
import type { FoodLensStore } from "../pipeline/store.js";

const VALID_PRIORITIES = [
  "best_value",
  "cheapest",
  "fastest",
  "most_reliable",
  "best_rated",
  "value",
  "reliable",
  "rated",
];

const error = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

function toFresh(fetchedAt: string, status?: "fresh" | "aging" | "stale") {
  const ageMin = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000));
  const st = status ?? (ageMin <= 30 ? "fresh" : ageMin <= 180 ? "aging" : "stale");
  return { ageMin, status: st };
}

export function createApi(store: FoodLensStore) {
  const router = Router();

  router.get("/meta", (_req, res) =>
    res.json({
      name: "FoodLens",
      dataMode: store.mode,
      synthetic: store.mode === "synthetic",
      notice: "Demo data only. No real provider data or ordering.",
      providers: [
        { id: "foodhub", name: "FoodHub" },
        { id: "quickbite", name: "QuickBite" },
        { id: "dinedash", name: "DineDash" },
      ],
      priorities: VALID_PRIORITIES,
    })
  );

  router.get("/health", (_req, res) =>
    res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) })
  );

  router.get("/search", (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const cuisine = String(req.query.cuisine ?? "").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
    const minRating = req.query.minRating === undefined ? null : Number(req.query.minRating);
    const maxEta = req.query.maxEta === undefined ? null : Number(req.query.maxEta);

    let items = store.restaurants
      .map((r) => {
        const listings = store.listings.filter((l) => r.listingIds.includes(l.id));
        const queryText = [r.name, ...r.cuisines, ...r.menu.map((m) => m.name)].join(" ").toLowerCase();
        const ratings = listings.filter((l) => l.rating !== null).map((l) => l.rating as number);
        const avgRating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : null;

        const matchedItems = r.menu
          .filter((m) => !q || m.name.toLowerCase().includes(q))
          .slice(0, 3)
          .map((item) => {
            const knownPrices = item.offers
              .filter((offer) => offer.price !== null)
              .map((offer) => offer.price as number);
            return {
              name: item.name,
              minPrice: knownPrices.length ? Math.min(...knownPrices) : null,
              maxPrice: knownPrices.length ? Math.max(...knownPrices) : null,
              providers: item.offers.filter((offer) => offer.available).length,
            };
          });

        const fallbackItems =
          matchedItems.length > 0
            ? matchedItems
            : r.menu.slice(0, 2).map((item) => {
                const knownPrices = item.offers
                  .filter((offer) => offer.price !== null)
                  .map((offer) => offer.price as number);
                return {
                  name: item.name,
                  minPrice: knownPrices.length ? Math.min(...knownPrices) : null,
                  maxPrice: knownPrices.length ? Math.max(...knownPrices) : null,
                  providers: item.offers.filter((offer) => offer.available).length,
                };
              });

        const providers = listings.map((l) => ({
          id: l.providerId,
          name: l.providerName,
          etaMin: l.etaMinutes,
          etaMinutes: l.etaMinutes,
          freshness: toFresh(l.fetchedAt, l.freshness),
        }));

        const totalReviews = listings.reduce((sum, l) => sum + (l.reviews?.length ?? 0), 0);
        const evidence = totalReviews >= 10 ? "High" : totalReviews >= 3 ? "Moderate" : "Low";

        return {
          id: r.id,
          name: r.name,
          area: r.area,
          cuisines: r.cuisines,
          listingCount: listings.length,
          rating: {
            combined: avgRating,
            evidence,
          },
          matchedItems: fallbackItems,
          providers,
          _rawRating: avgRating,
          _queryText: queryText,
        };
      })
      .filter(
        (r) =>
          (!q || q.split(/\s+/).every((token) => r._queryText.includes(token))) &&
          (!cuisine || r.cuisines.some((c) => c.toLowerCase().includes(cuisine))) &&
          (minRating === null || (r._rawRating !== null && r._rawRating >= minRating)) &&
          (maxEta === null || r.providers.some((p) => p.etaMin !== null && p.etaMin <= maxEta))
      );

    const total = items.length;
    items = items.slice((page - 1) * pageSize, page * pageSize);
    const cleanResults = items.map(({ _queryText, _rawRating, ...r }) => r);

    res.json({
      results: cleanResults,
      items: cleanResults,
      page,
      pageSize,
      total,
    });
  });

  router.get("/restaurants/:id", (req, res) => {
    const restaurant = store.restaurants.find((r) => r.id === req.params.id);
    if (!restaurant) return error(res, 404, "NOT_FOUND", "Restaurant not found");

    const listings = store.listings.filter((l) => restaurant.listingIds.includes(l.id));
    const rep = reputation(restaurant, listings);

    const items = restaurant.menu.map((m) => ({
      id: m.id,
      name: m.name,
      veg: m.vegetarian,
      vegetarian: m.vegetarian,
      portion: m.portion ?? "regular",
      available: m.available,
      offers: m.offers.map((offer) => ({
        providerId: offer.providerId,
        providerName: offer.providerName,
        providerItemName: offer.sourceItemName ?? m.name,
        sourceItemName: offer.sourceItemName ?? m.name,
        sourceItemId: offer.sourceItemId,
        price: offer.price,
        available: offer.available,
      })),
    }));

    const conflicts = restaurant.conflicts.map((c) => ({
      attribute: c.attribute,
      severity: c.severity,
      detail: c.description,
      description: c.description,
      policy: c.policy,
    }));

    const observations = listings.flatMap((l) => [
      { providerId: l.providerId, attribute: "rating", value: l.rating, observedAt: l.fetchedAt, confidence: l.providerTrust },
      { providerId: l.providerId, attribute: "etaMinutes", value: l.etaMinutes, observedAt: l.fetchedAt, confidence: l.providerTrust },
      { providerId: l.providerId, attribute: "deliveryFee", value: l.deliveryFee, observedAt: l.fetchedAt, confidence: l.providerTrust },
    ]);

    const formattedListings = listings.map((l) => ({
      id: l.id,
      providerId: l.providerId,
      providerName: l.providerName,
      recordId: l.recordId,
      providerListingName: l.name,
      name: l.name,
      address: l.address,
      url: l.url,
      etaMin: l.etaMinutes,
      etaMinutes: l.etaMinutes,
      deliveryFee: l.deliveryFee,
      platformFee: l.platformFee,
      rating: l.rating,
      ratingCount: l.ratingCount,
      freshness: toFresh(l.fetchedAt, l.freshness),
      menu: l.menu,
      offer: l.offer,
      fetchedAt: l.fetchedAt,
    }));

    res.json({
      id: restaurant.id,
      name: restaurant.name,
      area: restaurant.area,
      lat: restaurant.lat,
      lng: restaurant.lng,
      phone: restaurant.phone,
      cuisines: restaurant.cuisines,
      listingIds: restaurant.listingIds,
      listings: formattedListings,
      items,
      menu: items,
      reputation: rep,
      conflicts,
      observations,
    });
  });

  router.post("/compare", (req, res) => {
    const { restaurantId, selections, priority = "best_value", maxEta } = req.body ?? {};

    if (typeof restaurantId !== "string") {
      return error(res, 400, "BAD_REQUEST", "restaurantId is required");
    }

    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.some((s: any) => {
        const qty = s.quantity ?? s.qty;
        return typeof s.itemId !== "string" || !Number.isInteger(qty) || qty < 1 || qty > 20;
      })
    ) {
      return error(
        res,
        400,
        "BAD_REQUEST",
        "selections must contain itemId and integer quantity (or qty) from 1 to 20"
      );
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      return error(
        res,
        400,
        "BAD_REQUEST",
        `priority must be one of: ${VALID_PRIORITIES.join(", ")}`
      );
    }

    if (maxEta !== undefined && maxEta !== null && (!Number.isFinite(maxEta) || maxEta <= 0)) {
      return error(res, 400, "BAD_REQUEST", "maxEta must be a positive number");
    }

    const restaurant = store.restaurants.find((r) => r.id === restaurantId);
    if (!restaurant) return error(res, 404, "NOT_FOUND", "Restaurant not found");

    const listings = store.listings.filter((l) => restaurant.listingIds.includes(l.id));
    const rep = reputation(restaurant, listings);

    const options = listings.map((listing) => {
      const providerSelections = selections.map((selection: any) => {
        const qty = selection.quantity ?? selection.qty ?? 1;
        const canonicalItem = restaurant.menu.find((item) => item.id === selection.itemId);
        const providerOffer = canonicalItem?.offers.find((offer) => offer.providerId === listing.providerId);
        return {
          itemId: providerOffer?.sourceItemId ?? selection.itemId,
          quantity: qty,
          qty,
        };
      });

      const p = priceBasket(listing, providerSelections);
      const delivery = (rep.providerDelivery as any)[listing.providerId];
      const source = rep.sources.find((s) => s.providerId === listing.providerId);
      return {
        listing,
        pricing: p,
        reliability: delivery?.enough ? delivery.score : null,
        rating: source?.adjustedRating ?? null,
      };
    });

    const ranked = rankOptions(options, priority, maxEta ?? null);

    res.json({
      ...ranked,
      restaurantId,
      method: {
        reputation: rep.method,
        pricing: "estimate-v1",
        ranking: "weighted-heuristic-v1",
      },
    });
  });

  router.get("/admin/review-queue", (_req, res) => {
    const pending = store.candidates
      .filter((c) => c.status === "pending")
      .map((c) => {
        const left = store.listings.find((l) => l.id === c.leftListingId);
        const right = store.listings.find((l) => l.id === c.rightListingId);
        return {
          id: c.id,
          score: c.score,
          signals: c.signals,
          parts: {
            name: c.signals.name,
            geo: c.signals.geography ?? 0.5,
            address: c.signals.address,
            phone: c.signals.phone,
            distanceM: Math.round(c.signals.distanceMetres ?? 0),
          },
          a: {
            providerName: left?.providerName ?? "",
            name: left?.name ?? "",
            address: left?.address ?? "",
          },
          b: {
            providerName: right?.providerName ?? "",
            name: right?.name ?? "",
            address: right?.address ?? "",
          },
          leftListingId: c.leftListingId,
          rightListingId: c.rightListingId,
          left,
          right,
        };
      });

    res.json({
      pending,
      items: pending,
    });
  });

  router.post("/admin/review-queue/:id/decision", (req, res) => {
    const verdict = req.body?.verdict;
    if (verdict !== "merge" && verdict !== "reject") {
      return error(res, 400, "BAD_REQUEST", "verdict must be merge or reject");
    }

    const ok = store.decide(req.params.id, verdict);
    if (!ok) return error(res, 404, "NOT_FOUND", "Review candidate not found");

    const remaining = store.candidates.filter((c) => c.status === "pending").length;
    res.json({
      ok: true,
      decision: { candidateId: req.params.id, verdict },
      remaining,
      notice: "Decision is in-memory for this MVP and resets on restart.",
    });
  });

  router.get("/admin/pipeline", (_req, res) => {
    const pendingReviews = store.candidates.filter((c) => c.status === "pending").length;
    res.json({
      rawListings: store.listings.length,
      canonicalRestaurants: store.restaurants.length,
      pendingReviews,
      counts: {
        raw: store.listings.length,
        validated: store.listings.length,
        canonicalRestaurants: store.restaurants.length,
        pendingCandidates: pendingReviews,
        issues: store.issues.length,
      },
      issues: store.issues,
    });
  });

  return router;
}
