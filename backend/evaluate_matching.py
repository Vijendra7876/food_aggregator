import os
import sys
import pandas as pd
from difflib import SequenceMatcher

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data") if os.path.exists(os.path.join(SCRIPT_DIR, "data")) else "data"
PROVIDER_PATH = os.path.join(DATA_DIR, "provider_restaurants.csv")
EVAL_PATH = os.path.join(DATA_DIR, "restaurant_match_evaluation.csv")

def evaluate_entity_resolution():
    print("🚀 [1/3] Loading Provider & Evaluation Datasets...")
    if not os.path.exists(PROVIDER_PATH) or not os.path.exists(EVAL_PATH):
        print(f"❌ Error: Missing CSV files in {DATA_DIR}.")
        return

    providers = pd.read_csv(PROVIDER_PATH).set_index('listing_id')
    eval_df = pd.read_csv(EVAL_PATH)
    
    print(f"   -> Loaded {len(providers)} provider listings.")
    print(f"   -> Loaded {len(eval_df)} evaluation pairs.")

    print("\n🔍 [2/3] Running Entity Resolution & Evaluation Pipeline...")
    
    y_true = []
    y_pred = []
    results = []

    for idx, row in eval_df.iterrows():
        l_a = row['listing_id_a']
        l_b = row['listing_id_b']
        ground_truth = row['expected_decision'] # 'match', 'non_match', 'manual_review'
        
        if ground_truth == 'manual_review':
            continue # Skip ambiguous manual review pairs for binary metrics
            
        if l_a not in providers.index or l_b not in providers.index:
            continue
            
        name_a = str(providers.loc[l_a, 'restaurant_name'])
        name_b = str(providers.loc[l_b, 'restaurant_name'])
        
        # Feature comparison: name similarity & same locality
        name_sim = SequenceMatcher(None, name_a.lower(), name_b.lower()).ratio()
        loc_a = str(providers.loc[l_a, 'locality'])
        loc_b = str(providers.loc[l_b, 'locality'])
        same_locality = 1.0 if loc_a == loc_b else 0.0
        
        # Combined confidence score
        confidence = (0.7 * name_sim) + (0.3 * same_locality)
        pred_decision = 'match' if confidence >= 0.75 else 'non_match'
        
        y_true.append(ground_truth)
        y_pred.append(pred_decision)
        
        results.append({
            'pair_id': row['pair_id'],
            'listing_id_a': l_a,
            'listing_id_b': l_b,
            'name_a': name_a,
            'name_b': name_b,
            'expected': ground_truth,
            'predicted': pred_decision,
            'confidence': round(confidence, 4)
        })

    res_df = pd.DataFrame(results)
    
    print("\n📊 [3/3] Performance Metrics Summary:")
    correct = (res_df['expected'] == res_df['predicted']).sum()
    total = len(res_df)
    accuracy = correct / total if total > 0 else 0
    
    print(f"   -> Total Evaluated Pairs: {total}")
    print(f"   -> Correct Predictions: {correct}")
    print(f"   -> Accuracy: {accuracy * 100:.2f}%")
    
    out_path = os.path.join(DATA_DIR, "evaluation_results.csv")
    res_df.to_csv(out_path, index=False)
    print(f"💾 Results saved to {out_path}")

if __name__ == "__main__":
    evaluate_entity_resolution()
