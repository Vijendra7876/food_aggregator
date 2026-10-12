// ALL DATA BELOW IS SYNTHETIC. Provider names are fictional. Nothing here is real pricing, ratings or availability.
import type { Adapter, Provider, RawListing, RawReview } from '../types';

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const rv = (id: string, text: string, rating: number, daysAgo: number, author: string): RawReview => ({ id, text, rating, daysAgo, author });
const m = (name: string, price: number | null, veg = false, available = true) => ({ name, price, veg, available });

export const PROVIDERS: Provider[] = [
  { id: 'fh', name: 'FoodHub', trust: 0.9, kind: 'synthetic' },
  { id: 'qb', name: 'QuickBite', trust: 0.8, kind: 'synthetic' },
  { id: 'dd', name: 'DineDash', trust: 0.7, kind: 'synthetic' },
];
const SYNDICATED = 'The biryani was excellent, but the delivery took almost an hour.';

const fh: RawListing[] = [
  { providerId: 'fh', recordId: 'fh-101', name: 'Biryani House - Vesu', address: '12, VIP Road, Vesu, Surat 395007', lat: 21.1459, lng: 72.7710, phone: '+91 98250 11111',
    cuisines: ['Biryani', 'Mughlai'], etaMin: 35, deliveryFee: 30, platformFee: 5, rating: 4.3, ratingCount: 1240,
    menu: [m('Chicken Dum Biryani (Full)', 240), m('Chicken Dum Biryani (Half)', 150), m('Veg Biryani', 200, true), m('Paneer Tikka', 220, true), m('Raita', 40, true)],
    offer: { pct: 20, cap: 100, minOrder: 299, label: '20% off up to ₹100 above ₹299' },
    reviews: [rv('1', SYNDICATED, 4, 5, 'u991'), rv('2', 'Great taste and generous portions. Worth the price.', 5, 12, 'u12'), rv('3', 'Food arrived cold and the rider was rude.', 2, 20, 'u33'),
      rv('4', 'Delicious chicken biryani, very flavourful.', 5, 33, 'u44'), rv('5', 'Delivery was quick and packaging was good.', 4, 3, 'u55')],
    fetchedAt: ago(8), url: 'https://example.com/foodhub/fh-101' },
  { providerId: 'fh', recordId: 'fh-102', name: 'Biryani House - Adajan', address: 'Near Gujarat Gas Circle, Adajan, Surat 395009', lat: 21.1950, lng: 72.7930, phone: '+91 98250 22222',
    cuisines: ['Biryani'], etaMin: 40, deliveryFee: 35, platformFee: 5, rating: 4.0, ratingCount: 410,
    menu: [m('Chicken Dum Biryani (Full)', 250), m('Veg Biryani', 210, true)], offer: null,
    reviews: [rv('1', 'Tasty biryani, fast delivery.', 5, 7, 'a1'), rv('2', 'Delivery was late and food was cold.', 2, 14, 'a2'), rv('3', 'Good food, decent portion.', 4, 30, 'a3')],
    fetchedAt: ago(8), url: 'https://example.com/foodhub/fh-102' },
  { providerId: 'fh', recordId: 'fh-201', name: 'Pizza Palace - Vesu', address: 'Shop 4, Vesu Main Road, Surat 395007', lat: 21.1481, lng: 72.7702, phone: '+91 99090 33333',
    cuisines: ['Pizza', 'Italian'], etaMin: 38, deliveryFee: 40, platformFee: 5, rating: 4.2, ratingCount: 700,
    menu: [m('Margherita Pizza (Regular)', 249, true), m('Farmhouse Pizza', 349, true), m('Garlic Bread', 129, true)], offer: null,
    reviews: [rv('1', 'Pizza was hot and delicious, delivery on time.', 5, 4, 'p1'), rv('2', 'Too expensive for the toppings.', 3, 22, 'p2')],
    fetchedAt: ago(8), url: 'https://example.com/foodhub/fh-201' },
];
const qb: RawListing[] = [
  { providerId: 'qb', recordId: 'q-5001', name: 'Biryani House Vesu', address: '12 VIP Rd, Vesu, Surat', lat: 21.14595, lng: 72.77105, phone: '9825011111',
    cuisines: ['Biryani'], etaMin: 28, deliveryFee: 0, platformFee: 7, rating: 4.1, ratingCount: 860,
    menu: [m('Chicken Biryani', 220), m('Veg Biryani', 185, true), m('Paneer Tikka', 210, true), m('Raita', 35, true)], offer: null,
    reviews: [rv('1', 'Tasty biryani, fast delivery.', 5, 4, 'q1'), rv('2', SYNDICATED, 4, 5, 'u991'), rv('3', 'Too expensive for the portion size.', 2, 9, 'q3'),
      rv('4', 'Delivery was late again, very slow.', 2, 15, 'q4'), rv('5', 'Not bad, food was good.', 4, 40, 'q5')],
    fetchedAt: ago(12), url: 'https://example.com/quickbite/q-5001' },
  { providerId: 'qb', recordId: 'q-5002', name: 'Biryani House Adajan', address: 'Gujarat Gas Circle, Adajan, Surat', lat: 21.19505, lng: 72.79305, phone: '9825022222',
    cuisines: ['Biryani'], etaMin: 33, deliveryFee: 25, platformFee: 7, rating: 3.9, ratingCount: 220,
    menu: [m('Chicken Biryani', 235), m('Veg Biryani', 195, true)], offer: null,
    reviews: [rv('1', 'Delivery was fast and food was delicious.', 5, 6, 'b1'), rv('2', 'Bland biryani, not worth it.', 2, 25, 'b2')],
    fetchedAt: ago(12), url: 'https://example.com/quickbite/q-5002' },
  { providerId: 'qb', recordId: 'q-5100', name: 'Pizza Palace', address: 'Vesu Main Road, Surat', lat: 21.1506, lng: 72.7702, phone: null, // no phone, pin ~280 m off => uncertain match
    cuisines: ['Pizza'], etaMin: 30, deliveryFee: 0, platformFee: 10, rating: 4.3, ratingCount: 40,
    menu: [m('Margherita Pizza', 229, true), m('Farmhouse Pizza', 339, true), m('Garlic Bread', 119, true)], offer: null,
    reviews: [rv('1', 'Good pizza, quick delivery.', 4, 5, 'z1')], fetchedAt: ago(12), url: 'https://example.com/quickbite/q-5100' },
  { providerId: 'qb', recordId: 'q-5200', name: 'Biryani Hub', address: 'Plot 9, Piplod Road, Surat', lat: 21.1560, lng: 72.7745, phone: '9879044444', // similar NAME, different restaurant
    cuisines: ['Biryani'], etaMin: 30, deliveryFee: 15, platformFee: 7, rating: 3.6, ratingCount: 130,
    menu: [m('Chicken Biryani', 199), m('Mystery Combo', -5)], offer: null, // negative price => validation drops the item
    reviews: [rv('1', 'Average biryani, delivery was slow.', 3, 10, 'h1'), rv('2', 'Bland and expensive.', 2, 20, 'h2')], fetchedAt: ago(12), url: 'https://example.com/quickbite/q-5200' },
  { providerId: 'qb', recordId: 'q-9999', name: 'Test Kitchen', address: 'Nowhere', lat: 190, lng: 72.8, phone: null, cuisines: [], // invalid coordinates => rejected
    etaMin: 20, deliveryFee: 0, platformFee: 0, rating: 5, ratingCount: 1, menu: [], offer: null, reviews: [], fetchedAt: ago(12), url: 'https://example.com/x' },
];
const dd: RawListing[] = [
  { providerId: 'dd', recordId: 'D-77', name: 'Biriyani House (Vesu)', address: 'VIP Road, Vesu, Surat 395007', lat: 21.14588, lng: 72.77098, phone: '098250 11111',
    cuisines: ['Biryani', 'North Indian'], etaMin: 31, deliveryFee: 20, platformFee: null, rating: 4.4, ratingCount: 95, // platform fee UNKNOWN; data is stale
    menu: [m('Chicken Biriyani Regular', 210), m('Veg Biriyani', 180, true), m('Paneer Tikka Starter', 215, true), m('Raita', 30, true, false)],
    offer: { pct: 10, cap: 50, minOrder: 200, label: '10% off up to ₹50 above ₹200' },
    reviews: [rv('1', 'Amazing flavour, best biryani in Vesu.', 5, 6, 'd1'), rv('2', 'Delivery was fast and the staff was polite.', 5, 10, 'd2'), rv('3', 'Biryani was bland and stale.', 2, 60, 'd3')],
    fetchedAt: ago(330), url: 'https://example.com/dinedash/D-77' },
  { providerId: 'dd', recordId: 'D-90', name: 'Pizza Palace Vesu', address: 'Shop 4, Vesu Main Rd, Surat', lat: 21.14812, lng: 72.77021, phone: '09909033333',
    cuisines: ['Pizza'], etaMin: 33, deliveryFee: 25, platformFee: 5, rating: 4.0, ratingCount: 150,
    menu: [m('Margherita Pizza Regular', 239, true), m('Farmhouse Pizza', 359, true), m('Garlic Bread Sticks', 129, true)],
    offer: { pct: 15, cap: 75, minOrder: 399, label: '15% off up to ₹75 above ₹399' },
    reviews: [rv('1', 'Crust was soggy and delivery was late.', 2, 7, 'e1'), rv('2', 'Tasty pizza, polite staff.', 4, 18, 'e2')],
    fetchedAt: ago(20), url: 'https://example.com/dinedash/D-90' },
];

const adapter = (p: Provider, data: RawListing[]): Adapter => ({ provider: p, fetch: async () => data });
/** Real integrations (official APIs / partner feeds / ONDC) implement the same Adapter interface. */
export const syntheticAdapters: Adapter[] = [adapter(PROVIDERS[0], fh), adapter(PROVIDERS[1], qb), adapter(PROVIDERS[2], dd)];
