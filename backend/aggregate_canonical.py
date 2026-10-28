import os
import sys
import pandas as pd

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data") if os.path.exists(os.path.join(SCRIPT_DIR, "data")) else "data"

def run_aggregation():
    print("🚀 [1/3] Loading All FoodLens Datasets...")
    canonical_path = os.path.join(DATA_DIR, "canonical_restaurants.csv")
    providers_path = os.path.join(DATA_DIR, "provider_restaurants.csv")
    menus_path = os.path.join(DATA_DIR, "provider_menu_items.csv")
    reviews_path = os.path.join(DATA_DIR, "reviews.csv")

    if not all(os.path.exists(p) for p in [canonical_path, providers_path, menus_path, reviews_path]):
        print(f"❌ Error: One or more CSV files missing in {DATA_DIR}.")
        return

    canonical = pd.read_csv(canonical_path)
    providers = pd.read_csv(providers_path)
    menus = pd.read_csv(menus_path)
    reviews = pd.read_csv(reviews_path)
    
    print(f"   -> Loaded {len(canonical)} canonical restaurants.")
    print(f"   -> Loaded {len(providers)} provider listings.")
    print(f"   -> Loaded {len(menus)} menu items.")
    print(f"   -> Loaded {len(reviews)} reviews.")

    print("\n🔗 [2/3] Merging Provider Data to Canonical Master Records...")
    prov_merged = providers.merge(canonical, on='canonical_restaurant_id', how='left', suffixes=('_prov', '_canon'))
    
    # Aggregate menu items per listing
    menu_agg = menus.groupby('listing_id').agg({
        'item_name': lambda x: list(x),
        'price_inr': ['mean', 'min', 'max']
    }).reset_index()
    menu_agg.columns = ['listing_id', 'menu_items', 'avg_price', 'min_price', 'max_price']

    # Aggregate reviews per listing
    review_agg = reviews.groupby('listing_id').agg({
        'rating': 'mean',
        'review_id': 'count',
        'food_sentiment': lambda x: (x == 'positive').mean()
    }).reset_index()
    review_agg.columns = ['listing_id', 'review_avg_rating', 'review_count', 'positive_sentiment_ratio']

    # Combine into master dataframe
    master_df = prov_merged.merge(menu_agg, on='listing_id', how='left').merge(review_agg, on='listing_id', how='left')

    out_path = os.path.join(DATA_DIR, "canonical_master_view.csv")
    master_df.to_csv(out_path, index=False)
    print(f"💾 [3/3] Master Aggregated View saved successfully to {out_path}!")
    print(f"   -> Total Master Rows: {len(master_df)}")

if __name__ == "__main__":
    run_aggregation()
