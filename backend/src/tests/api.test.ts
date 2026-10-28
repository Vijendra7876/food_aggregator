import test from "node:test";
import assert from "node:assert/strict";
import { FoodLensStore } from "../pipeline/store.js";
import { reputation } from "../intelligence/reputation.js";
import { priceBasket } from "../intelligence/pricing.js";
import { rankOptions } from "../intelligence/ranking.js";

test("store initialises canonical restaurants and menu items correctly", async () => {
  const store = new FoodLensStore();
  await store.init();

  assert.ok(store.listings.length > 0, "Listings should be loaded");
  assert.ok(store.restaurants.length > 0, "Canonical restaurants should be formed");

  const r = store.restaurants[0];
  assert.ok(r.menu.length > 0, "Restaurant should have menu items");
  assert.ok(r.items && r.items.length > 0, "Restaurant should expose items alias");
  assert.ok(typeof r.items![0].veg === "boolean", "Item should have veg boolean");
});

test("reputation produces frontend-compatible aggregates and highlights", async () => {
  const store = new FoodLensStore();
  await store.init();
  const r = store.restaurants[0];
  const listings = store.listings.filter((l) => r.listingIds.includes(l.id));

  const rep = reputation(r, listings);
  assert.ok(typeof rep.evidence === "string", "evidence should be string");
  assert.ok(typeof rep.reviewsAnalyzed === "number", "reviewsAnalyzed should be number");
  assert.ok(typeof rep.duplicatesRemoved === "number", "duplicatesRemoved should be number");
  assert.ok(rep.rating && Array.isArray(rep.rating.perSource), "rating.perSource should be array");
  assert.ok(Array.isArray(rep.highlights.positive), "positive highlights should be array");
  assert.ok(Array.isArray(rep.highlights.negative), "negative highlights should be array");
  assert.ok(rep.aspects.food && typeof rep.aspects.food.enough === "boolean");
});

test("priceBasket and rankOptions support 'qty', 'value' priority, and factor objects", async () => {
  const store = new FoodLensStore();
  await store.init();
  const r = store.restaurants[0];
  const item = r.menu[0];
  const offer = item.offers[0];
  const listing = store.listings.find((l) => l.providerId === offer.providerId)!;
  const sourceItemId = offer.sourceItemId;

  const pricing = priceBasket(listing, [{ itemId: sourceItemId, qty: 2 }]);
  assert.equal(pricing.available, true);
  assert.ok(typeof pricing.foodTax === "number", "pricing should have foodTax");
  assert.ok(typeof pricing.feeTax === "number", "pricing should have feeTax");
  assert.ok(Array.isArray(pricing.unknowns), "pricing should have unknowns");
  assert.ok(Array.isArray(pricing.assumptions), "pricing should have assumptions");

  const ranked = rankOptions([{ listing, pricing, reliability: 0.8, rating: 4.5 }], "value", 45);
  assert.ok(Array.isArray(ranked.options), "options should be an array");
  assert.equal(ranked.options.length, 1);
  const opt = ranked.options[0];
  assert.equal(opt.rank, 1);
  assert.ok(Array.isArray(opt.factors), "factors should be an array");
  assert.ok(opt.factors[0].factor && typeof opt.factors[0].weight === "number");
  assert.ok(opt.freshness && typeof opt.freshness.ageMin === "number");
});

test("store decision updates candidate status and rebuilds groups", async () => {
  const store = new FoodLensStore();
  await store.init();
  if (store.candidates.length > 0) {
    const candidateId = store.candidates[0].id;
    const ok = store.decide(candidateId, "reject");
    assert.equal(ok, true);
    const candidate = store.candidates.find((c) => c.id === candidateId);
    assert.equal(candidate?.status, "rejected");
  }
});
