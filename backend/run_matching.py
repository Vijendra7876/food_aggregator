import os
import sys
import pandas as pd
from difflib import get_close_matches, SequenceMatcher

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 1. Paths Setup
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data") if os.path.exists(os.path.join(SCRIPT_DIR, "data")) else "data"
PROVIDER_PATH = os.path.join(DATA_DIR, "provider_restaurants.csv")
CANONICAL_PATH = os.path.join(DATA_DIR, "canonical_restaurants.csv")
OUTPUT_PATH = os.path.join(DATA_DIR, "baseline_matches.csv")

def run_fast_baseline():
    print("🚀 [1/3] Loading FoodLens Datasets...")
    if not os.path.exists(PROVIDER_PATH) or not os.path.exists(CANONICAL_PATH):
        print(f"❌ Error: Missing CSV files in {DATA_DIR}/. Ensure provider_restaurants.csv and canonical_restaurants.csv are present.")
        return

    providers = pd.read_csv(PROVIDER_PATH)
    canonical = pd.read_csv(CANONICAL_PATH)
    
    print(f"   -> Loaded {len(providers)} provider restaurants.")
    print(f"   -> Loaded {len(canonical)} canonical restaurants.")

    print("\n🔍 [2/3] Running Fuzzy Name Matching Baseline...")
    
    # Identify column names flexibly
    canon_name_col = 'canonical_name' if 'canonical_name' in canonical.columns else 'name'
    canon_id_col = 'canonical_restaurant_id' if 'canonical_restaurant_id' in canonical.columns else 'canonical_id'
    
    canonical_names = canonical[canon_name_col].astype(str).tolist()
    canonical_name_to_id = dict(zip(canonical[canon_name_col].astype(str), canonical[canon_id_col]))

    prov_name_col = 'restaurant_name' if 'restaurant_name' in providers.columns else 'name'

    matches = []
    for idx, row in providers.iterrows():
        p_name = str(row[prov_name_col]) if prov_name_col in row else str(row.get('name', ''))
        p_id = row.get('provider_restaurant_id', row.get('listing_id', idx))
        
        # Find best close match using Python's difflib (fast baseline)
        close_matches = get_close_matches(p_name, canonical_names, n=1, cutoff=0.6)
        
        if close_matches:
            best_match_name = close_matches[0]
            matched_canonical_id = canonical_name_to_id.get(best_match_name)
            # Calculate simple score
            score = SequenceMatcher(None, p_name.lower(), best_match_name.lower()).ratio()
        else:
            best_match_name = None
            matched_canonical_id = None
            score = 0.0

        matches.append({
            'provider_restaurant_id': p_id,
            'provider_name': p_name,
            'matched_canonical_id': matched_canonical_id,
            'matched_canonical_name': best_match_name,
            'confidence_score': round(score, 4)
        })

    match_df = pd.DataFrame(matches)
    
    print(f"\n💾 [3/3] Saving baseline results to {OUTPUT_PATH}...")
    os.makedirs(DATA_DIR, exist_ok=True)
    match_df.to_csv(OUTPUT_PATH, index=False)
    
    print("✅ Baseline Matching Complete!")
    print(match_df.head(10))

if __name__ == "__main__":
    run_fast_baseline()
