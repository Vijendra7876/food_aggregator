import type { Listing } from "../types.js";

export interface Selection {
  itemId: string;
  quantity?: number;
  qty?: number;
}

export function priceBasket(listing: Listing, selections: Selection[]) {
  const missing: string[] = [];
  const lines: Array<{ itemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }> = [];

  for (const selection of selections) {
    const qty = selection.quantity ?? selection.qty ?? 1;
    const item = listing.menu.find(m => m.id === selection.itemId);
    if (!item || !item.available || item.price === null) {
      missing.push(item?.name ?? selection.itemId);
      continue;
    }
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: qty,
      unitPrice: item.price,
      lineTotal: item.price * qty,
    });
  }

  const assumptions = [
    "Assumes 5% GST on food",
    "Assumes 18% GST on delivery and platform fees",
    "Offer discounts are estimated from published terms",
  ];

  if (missing.length) {
    return {
      providerId: listing.providerId,
      available: false,
      missingItems: missing,
      lines,
      subtotal: 0,
      foodGst: 0,
      foodTax: 0,
      deliveryFee: listing.deliveryFee,
      platformFee: listing.platformFee,
      gstOnFees: 0,
      feeTax: 0,
      discount: 0,
      discountNote: null,
      amountToOfferMinimum: 0,
      total: 0,
      unknownFees: [],
      unknowns: [],
      assumptions,
      isLowerBound: false,
      verified: false,
      disclaimer: "One or more selected dishes are unavailable on this provider.",
    };
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const foodGst = Math.round(subtotal * 0.05 * 100) / 100;
  const foodTax = foodGst;

  const unknownFees: string[] = [];
  const delivery = listing.deliveryFee;
  const platform = listing.platformFee;
  if (delivery === null) unknownFees.push("delivery fee");
  if (platform === null) unknownFees.push("platform fee");

  const knownDelivery = delivery ?? 0;
  const knownPlatform = platform ?? 0;
  const eligibleOffer =
    listing.offer && subtotal >= listing.offer.minOrder
      ? Math.min(listing.offer.cap, Math.round((subtotal * listing.offer.percent) / 100))
      : 0;

  const gstOnFees = Math.round((knownDelivery + knownPlatform) * 0.18 * 100) / 100;
  const feeTax = gstOnFees;
  const total = Math.max(0, subtotal + foodGst + knownDelivery + knownPlatform + gstOnFees - eligibleOffer);

  const discountNote =
    eligibleOffer > 0 && listing.offer
      ? `${listing.offer.percent}% off up to ₹${listing.offer.cap} (saved ₹${eligibleOffer})`
      : null;

  return {
    providerId: listing.providerId,
    available: true,
    lines,
    subtotal,
    foodGst,
    foodTax,
    deliveryFee: delivery,
    platformFee: platform,
    gstOnFees,
    feeTax,
    discount: eligibleOffer,
    discountNote,
    amountToOfferMinimum: listing.offer ? Math.max(0, listing.offer.minOrder - subtotal) : 0,
    total,
    unknownFees,
    unknowns: unknownFees,
    assumptions,
    isLowerBound: unknownFees.length > 0,
    verified: false,
    disclaimer: "Estimate only. Assumes 5% GST on food and 18% GST on fees; discounts are simplified. Not a checkout quote.",
  };
}
