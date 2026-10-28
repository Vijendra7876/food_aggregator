import { adapters } from "../data/synthetic.js";
import type { CanonicalRestaurant, Listing, MatchCandidate, PipelineIssue, RawListing } from "../types.js";
import { validateListing } from "./validate.js";
import { buildCandidates, scorePair } from "./resolve.js";
import { similarity } from "./text.js";

export class FoodLensStore {
  listings: Listing[] = [];
  restaurants: CanonicalRestaurant[] = [];
  candidates: MatchCandidate[] = [];
  issues: PipelineIssue[] = [];
  decisions = new Map<string, "merge" | "reject">();
  mode = process.env.DATA_MODE ?? "synthetic";

  async init() {
    const settled = await Promise.allSettled(adapters.map((a) => a.fetch()));
    const raw: RawListing[] = [];
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") {
        raw.push(...result.value);
      } else {
        this.issues.push({
          providerId: adapters[i].id,
          recordId: "*",
          level: "error",
          reason: "Adapter failed: provider unavailable",
        });
      }
    });
    this.listings = raw.map((r) => validateListing(r, this.issues)).filter((x): x is Listing => x !== null);
    this.rebuild();
  }

  rebuild() {
    const baseCandidates = buildCandidates(this.listings);
    for (const c of baseCandidates) {
      if (this.decisions.has(c.id)) {
        c.status = this.decisions.get(c.id) === "merge" ? "merged" : "rejected";
      }
    }
    this.candidates = baseCandidates;

    const groups: Listing[][] = [];
    const ordered = [...this.listings].sort((a, b) => a.providerId.localeCompare(b.providerId) || a.id.localeCompare(b.id));

    for (const listing of ordered) {
      let best: { group: Listing[]; score: number } | null = null;
      for (const group of groups) {
        // Disallow merging listings from the exact same provider
        if (group.some((x) => x.providerId === listing.providerId)) continue;

        // Check if any pair between group listings and this listing was explicitly rejected
        const explicitlyRejected = group.some((x) => {
          const pairId1 = `${x.id}__${listing.id}`;
          const pairId2 = `${listing.id}__${x.id}`;
          return this.decisions.get(pairId1) === "reject" || this.decisions.get(pairId2) === "reject";
        });
        if (explicitlyRejected) continue;

        // Check if explicitly merged
        const explicitlyMerged = group.some((x) => {
          const pairId1 = `${x.id}__${listing.id}`;
          const pairId2 = `${listing.id}__${x.id}`;
          return this.decisions.get(pairId1) === "merge" || this.decisions.get(pairId2) === "merge";
        });

        if (explicitlyMerged) {
          best = { group, score: 999 };
          break;
        }

        const scores = group.map((x) => scorePair(x, listing).score);
        const score = Math.max(...scores);
        if (score >= 0.85 && (!best || score > best.score)) {
          best = { group, score };
        }
      }

      if (best) {
        best.group.push(listing);
      } else {
        groups.push([listing]);
      }
    }

    this.restaurants = groups.map((g, index) => {
      const nameSource = [...g].sort((a, b) => b.providerTrust - a.providerTrust)[0];
      const latVals = g.map((x) => x.lat).filter((x): x is number => x !== null).sort((a, b) => a - b);
      const lngVals = g.map((x) => x.lng).filter((x): x is number => x !== null).sort((a, b) => a - b);
      const allItems = g.flatMap((l) =>
        l.menu.map((m) => ({
          ...m,
          veg: m.vegetarian,
          offers: [
            {
              providerId: l.providerId,
              providerName: l.providerName,
              price: m.price,
              available: m.available,
              sourceItemName: m.name,
              sourceItemId: m.id,
              providerItemName: m.name,
            },
          ],
        }))
      );

      const menu: CanonicalRestaurant["menu"] = [];
      for (const item of allItems) {
        const existing = menu.find(
          (m) => m.vegetarian === item.vegetarian && m.portion === item.portion && similarity(m.name, item.name) >= 0.72
        );
        if (existing) {
          existing.offers.push(...item.offers);
        } else {
          menu.push({ ...item, veg: item.vegetarian, offers: [...item.offers] });
        }
      }

      const conflicts: CanonicalRestaurant["conflicts"] = [];
      if (new Set(g.map((x) => x.phone).filter(Boolean)).size > 1) {
        conflicts.push({
          attribute: "phone",
          severity: "warn",
          description: "Provider phone numbers disagree",
          detail: "Provider phone numbers disagree",
          policy: "Highest-trust majority vote",
        });
      }

      const prices = g.flatMap((x) => x.menu.map((m) => m.price).filter((p): p is number => p !== null));
      if (prices.length && (Math.max(...prices) - Math.min(...prices)) / Math.max(1, Math.min(...prices)) > 0.1) {
        conflicts.push({
          attribute: "price",
          severity: "info",
          description: "Provider prices differ by more than 10%",
          detail: "Provider prices differ by more than 10%",
          policy: "Keep provider-specific prices",
        });
      }

      return {
        id: `restaurant-${index + 1}`,
        name: nameSource.name.replace(/\s*-\s*[^-]+$/, ""),
        area: nameSource.area,
        lat: latVals.length ? latVals[Math.floor(latVals.length / 2)] : null,
        lng: lngVals.length ? lngVals[Math.floor(lngVals.length / 2)] : null,
        phone: nameSource.phone ?? null,
        cuisines: [...new Set(g.flatMap((x) => x.cuisines))],
        listingIds: g.map((x) => x.id),
        menu,
        items: menu,
        conflicts,
      };
    });
  }

  decide(candidateId: string, verdict: "merge" | "reject") {
    const candidate = this.candidates.find((c) => c.id === candidateId);
    if (!candidate && !this.decisions.has(candidateId)) return false;
    this.decisions.set(candidateId, verdict);
    this.rebuild();
    return true;
  }
}
