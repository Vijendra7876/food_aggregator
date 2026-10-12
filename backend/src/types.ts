// ---- Raw shapes: what a provider adapter returns (untrusted, may be messy) ----
export interface RawMenuItem { name: string; price: number | null; veg: boolean; available?: boolean }
export interface RawOffer { pct: number; cap: number; minOrder: number; label: string }
export interface RawReview { id: string; text: string; rating: number; daysAgo: number; author: string }
export interface RawListing {
  providerId: string; recordId: string; name: string; address: string; lat: number; lng: number;
  phone?: string | null; cuisines: string[];
  etaMin: number | null; deliveryFee: number | null; platformFee: number | null; // null = UNKNOWN (never 0)
  rating: number | null; ratingCount: number | null;
  menu: RawMenuItem[]; offer?: RawOffer | null; reviews: RawReview[];
  fetchedAt: string; url: string;
}
// ---- Validated listing (provider-specific record, has a stable id) ----
export interface Listing extends RawListing { id: string } // id = `${providerId}:${recordId}`
export interface Provider { id: string; name: string; trust: number; kind: 'synthetic' | 'official_api' | 'partner_feed' }
export interface Adapter { provider: Provider; fetch(): Promise<RawListing[]> }
