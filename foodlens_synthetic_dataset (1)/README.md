# FoodLens Synthetic Dataset

**All records in this dataset are synthetic.** Restaurants, prices, ratings, offers, reviews, and provider listings are fabricated for development, testing, and evaluation of the FoodLens Python data/intelligence pipeline. They do **not** represent real businesses or current Swiggy/Zomato data, and offers must not be treated as redeemable.

## Purpose
- `provider_restaurants.csv`: provider-specific restaurant listings (one row per listing per provider).
- `canonical_restaurants.csv`: synthetic reference outlets used for entity resolution.
- `provider_menu_items.csv`: provider-specific menu items.
- `provider_offers.csv`: provider-specific promotional offers.
- `reviews.csv`: synthetic customer reviews with ground-truth sentiment labels.
- `restaurant_match_evaluation.csv`: labeled pairs for evaluating entity resolution (evaluation only; do not use label fields as model inputs).

## Keys and relationships
- `provider_restaurants.listing_id` is the primary key; `canonical_restaurant_id` references `canonical_restaurants.canonical_restaurant_id` (nullable for unresolved listings).
- `provider_menu_items.listing_id`, `provider_offers.listing_id`, and `reviews.listing_id` reference `provider_restaurants.listing_id`.
- `restaurant_match_evaluation.listing_id_a` / `listing_id_b` reference `provider_restaurants.listing_id`; self-pairs are excluded.
- `provider_restaurant_id` and `provider_menu_item_id` are unique within each provider.

## Row counts
- provider_restaurants.csv: 200
- canonical_restaurants.csv: 100
- provider_menu_items.csv: 320
- provider_offers.csv: 110
- reviews.csv: 320
- restaurant_match_evaluation.csv: 100 (35 match, 35 non-match, 30 manual_review)

## Missing-value conventions
- Unknown values are empty cells (null in pandas); never zero or fabricated defaults.
- `canonical_restaurant_id` is null for unresolved listings.
- `rating`, `rating_count`, `average_price_inr`, `average_delivery_time_minutes`, `is_vegetarian`, and `offers_available_count` may be null.
- `spice_level` and `is_available` may be null; known menu prices are always > 0.

## Match-evaluation distribution
- 35 positive pairs: same canonical outlet across providers (exact/spelling/spacing/abbreviation variants).
- 35 negative pairs: similar names but different canonical outlets.
- 30 ambiguous pairs: unresolved listings, labeled `unknown` / `manual_review`.

## Limitations
- Synthetic name variants are programmatic, not organic real-world naming noise.
- Review texts are template-composed with varied sentiment combinations, not free-form human writing.
- Coordinates are omitted; only city/locality-level geography is provided.
- Dataset is for development/testing and offline evaluation, not real-time commercial decisions.
