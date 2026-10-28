import os
import sys
import pandas as pd
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from routers import admin

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = FastAPI(title="FoodLens API", version="1.0")

# Register modular routers *after* app is initialized
app.include_router(admin.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "canonical_master_view.csv")
INTEL_PATH = os.path.join(SCRIPT_DIR, "data", "intelligence_ranked_view.csv")

def load_data(path=DATA_PATH):
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_csv(path)
    df = df.astype(object).where(df.notnull(), None)
    return df

def load_all():
    data_dir = os.path.join(SCRIPT_DIR, "data")
    canonical = pd.read_csv(os.path.join(data_dir, "canonical_restaurants.csv"))
    providers = pd.read_csv(os.path.join(data_dir, "provider_restaurants.csv"))
    menus = pd.read_csv(os.path.join(data_dir, "provider_menu_items.csv"))
    offers = pd.read_csv(os.path.join(data_dir, "provider_offers.csv"))
    reviews = pd.read_csv(os.path.join(data_dir, "reviews.csv"))
    return canonical, providers, menus, offers, reviews

def compute_reputation(listing_id, providers_df, reviews_df):
    prov_row = providers_df[providers_df['listing_id'] == listing_id]
    if prov_row.empty:
        return {"adjusted_rating": 3.9, "delivery_sentiment": 0.5, "evidence_level": "low"}
        
    row = prov_row.iloc[0]
    raw_rating = row.get('rating', 3.9)
    if pd.isna(raw_rating):
        raw_rating = 3.9
    n = row.get('rating_count', 30)
    if pd.isna(n):
        n = 30
        
    # Rating shrinkage toward prior 3.9
    adjusted_rating = (n * raw_rating + 30 * 3.9) / (n + 30)
    
    # Delivery sentiment from reviews
    listing_reviews = reviews_df[reviews_df['listing_id'] == listing_id]
    if not listing_reviews.empty and 'delivery_sentiment' in listing_reviews.columns:
        valid_sent = listing_reviews['delivery_sentiment'].dropna()
        if len(valid_sent) > 0:
            delivery_sentiment = (valid_sent == 'positive').mean()
        else:
            delivery_sentiment = 0.5
    else:
        delivery_sentiment = 0.5
        
    evidence_level = "high" if n >= 500 and len(listing_reviews) >= 10 else ("medium" if n >= 100 else "low")
    
    return {
        "raw_rating": raw_rating,
        "rating_count": n,
        "adjusted_rating": round(float(adjusted_rating), 2),
        "delivery_sentiment": round(float(delivery_sentiment), 2),
        "evidence_level": evidence_level
    }

def price_basket(listing_id, selections, menus_df, offers_df, providers_df):
    prov_row = providers_df[providers_df['listing_id'] == listing_id]
    if prov_row.empty:
        return {"available": False, "reason": "Listing not found"}
        
    listing_menus = menus_df[menus_df['listing_id'] == listing_id]
    
    subtotal = 0.0
    missing_items = []
    
    for sel in selections:
        q = sel.get('quantity', 1)
        item_query = str(sel.get('item_name', sel.get('itemId', ''))).strip().lower()
        
        match = listing_menus[listing_menus['item_name'].str.lower() == item_query]
        if match.empty:
            match = listing_menus[listing_menus['item_name'].str.lower().str.contains(item_query, na=False)]
            
        if match.empty:
            missing_items.append(item_query)
        else:
            m_row = match.iloc[0]
            is_avail = m_row.get('is_available', True)
            if pd.notna(is_avail) and not is_avail:
                missing_items.append(f"{m_row['item_name']} (unavailable)")
            else:
                price = m_row.get('price_inr', 0.0)
                subtotal += float(price) * q
                
    if missing_items:
        return {
            "available": False,
            "missing_items": missing_items,
            "reason": f"Missing or unavailable items: {', '.join(missing_items)}"
        }
        
    food_gst = 0.05 * subtotal
    delivery_fee = 30.0
    platform_fee = 5.0
    gst_on_fees = 0.18 * (delivery_fee + platform_fee)
    
    listing_offers = offers_df[offers_df['listing_id'] == listing_id]
    max_discount = 0.0
    applied_offer_title = None
    
    for _, offer in listing_offers.iterrows():
        min_ord = offer.get('minimum_order_value_inr', 0)
        if pd.isna(min_ord) or subtotal >= min_ord:
            disc_type = offer.get('discount_type', 'percentage')
            disc_val = offer.get('discount_value', 0)
            max_cap = offer.get('maximum_discount_inr', 100)
            if pd.isna(max_cap): max_cap = 100
            
            if disc_type == 'percentage':
                disc = min(max_cap, subtotal * (disc_val / 100.0))
            else:
                disc = min(max_cap, disc_val)
                
            if disc > max_discount:
                max_discount = disc
                applied_offer_title = offer.get('offer_title')
                
    total = subtotal + food_gst + delivery_fee + platform_fee + gst_on_fees - max_discount
    
    return {
        "available": True,
        "subtotal": round(subtotal, 2),
        "food_gst": round(food_gst, 2),
        "delivery_fee": delivery_fee,
        "platform_fee": platform_fee,
        "gst_on_fees": round(gst_on_fees, 2),
        "discount": round(max_discount, 2),
        "applied_offer": applied_offer_title,
        "total": round(total, 2)
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to FoodLens API! 🚀", "status": "active"}

@app.get("/health")
@app.get("/api/health")
def get_health():
    return {"status": "ok", "service": "foodlens-python"}

@app.get("/api/restaurants")
def get_restaurants(limit: int = 20, search: str = None):
    df = load_data(DATA_PATH)
    if df.empty:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    if search:
        name_mask = df['restaurant_name'].astype(str).str.contains(search, case=False, na=False)
        canon_mask = df['canonical_name'].astype(str).str.contains(search, case=False, na=False) if 'canonical_name' in df.columns else False
        df = df[name_mask | canon_mask]
        
    results = df.head(limit).to_dict(orient="records")
    return {"total": len(df), "results": results}

@app.get("/api/restaurants/{listing_id}")
def get_restaurant_detail(listing_id: str):
    df = load_data(DATA_PATH)
    if df.empty:
        raise HTTPException(status_code=404, detail="Dataset not found")

    match = df[df['listing_id'] == listing_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    record = match.iloc[0].to_dict()
    return record

@app.get("/api/meta")
def get_meta():
    df = load_data(DATA_PATH)
    if df.empty:
        return {"providers": [], "cities": [], "cuisines": []}
    
    providers = df['provider'].dropna().unique().tolist() if 'provider' in df.columns else []
    cities = df['city_prov'].dropna().unique().tolist() if 'city_prov' in df.columns else []
    cuisines = df['cuisines'].dropna().unique().tolist() if 'cuisines' in df.columns else []
    
    return {
        "providers": providers,
        "cities": cities,
        "cuisines": cuisines
    }

@app.get("/api/search")
def search_restaurants(q: str = "", cuisine: str = "", provider: str = "", city: str = ""):
    df = load_data(DATA_PATH)
    if df.empty:
        return {"total": 0, "results": []}
    
    if q:
        df = df[df['restaurant_name'].str.contains(q, case=False, na=False) | 
                df['canonical_name'].str.contains(q, case=False, na=False)]
    if cuisine:
        df = df[df['cuisines'].str.contains(cuisine, case=False, na=False) | 
                df['canonical_cuisine'].str.contains(cuisine, case=False, na=False)]
    if provider:
        df = df[df['provider'].str.contains(provider, case=False, na=False)]
    if city:
        df = df[df['city_prov'].str.contains(city, case=False, na=False) | 
                df['city_canon'].str.contains(city, case=False, na=False)]
        
    results = df.to_dict(orient="records")
    return {"total": len(df), "results": results}

@app.get("/api/intelligence/recommendations")
def get_intelligent_recommendations(limit: int = 10):
    df = load_data(INTEL_PATH)
    if df.empty:
        df = load_data(DATA_PATH)
    if df.empty:
        raise HTTPException(status_code=404, detail="Intelligence dataset not found")
        
    results = df.head(limit).to_dict(orient="records")
    return {"total": len(df), "recommendations": results}

@app.post("/api/compare")
def compare_basket(payload: dict = Body(...)):
    restaurant_id = payload.get("restaurantId")
    selections = payload.get("selections", [])
    priority = payload.get("priority", "Best value")
    max_eta = payload.get("maxEta")

    canonical, providers, menus, offers, reviews = load_all()
    
    listings = providers[
        (providers['canonical_restaurant_id'] == restaurant_id) | 
        (providers['listing_id'] == restaurant_id)
    ]
    
    if listings.empty:
        raise HTTPException(status_code=404, detail="Restaurant or listings not found")
        
    eligible_options = []
    excluded_options = []

    for _, listing in listings.iterrows():
        listing_id = listing['listing_id']
        provider_name = listing['provider']
        eta = listing.get('average_delivery_time_minutes', 30)
        
        pricing = price_basket(listing_id, selections, menus, offers, providers)
        if not pricing['available']:
            excluded_options.append({
                "listing_id": listing_id,
                "provider": provider_name,
                "reason": pricing['reason']
            })
            continue
            
        if max_eta and pd.notna(eta) and eta > int(max_eta):
            excluded_options.append({
                "listing_id": listing_id,
                "provider": provider_name,
                "reason": f"Delivery time ({eta} mins) exceeds maximum limit ({max_eta} mins)"
            })
            continue
            
        rep = compute_reputation(listing_id, providers, reviews)
        
        eligible_options.append({
            "listing_id": listing_id,
            "provider": provider_name,
            "eta": eta,
            "pricing": pricing,
            "reputation": rep
        })

    if not eligible_options:
        return {
            "rankedOptions": [],
            "excludedOptions": excluded_options,
            "weightsUsed": {},
            "disclaimer": "No eligible providers found for the current basket and delivery constraints."
        }

    costs = [opt['pricing']['total'] for opt in eligible_options]
    etas = [opt['eta'] for opt in eligible_options]
    
    min_cost, max_cost = min(costs), max(costs)
    min_eta, max_eta_val = min(etas), max(etas)
    
    weights_map = {
        "Best value": {"cost": 0.40, "eta": 0.20, "reliability": 0.25, "rating": 0.15},
        "Cheapest": {"cost": 0.70, "eta": 0.10, "reliability": 0.10, "rating": 0.10},
        "Fastest": {"cost": 0.10, "eta": 0.70, "reliability": 0.10, "rating": 0.10},
        "Most reliable": {"cost": 0.10, "eta": 0.15, "reliability": 0.65, "rating": 0.10},
        "Best rated": {"cost": 0.10, "eta": 0.10, "reliability": 0.20, "rating": 0.60}
    }
    w = weights_map.get(priority, weights_map["Best value"])

    scored_options = []
    for opt in eligible_options:
        c_score = (max_cost - opt['pricing']['total']) / (max_cost - min_cost) if max_cost != min_cost else 1.0
        e_score = (max_eta_val - opt['eta']) / (max_eta_val - min_eta) if max_eta_val != min_eta else 1.0
        r_score = opt['reputation']['delivery_sentiment']
        rt_score = (opt['reputation']['adjusted_rating'] - 1.0) / 4.0
        
        final_score = (w['cost'] * c_score + w['eta'] * e_score + w['reliability'] * r_score + w['rating'] * rt_score) * 100
        
        scored_options.append({
            **opt,
            "score": round(final_score, 2),
            "breakdown": {
                "cost_score": round(c_score, 2),
                "eta_score": round(e_score, 2),
                "reliability_score": round(r_score, 2),
                "rating_score": round(rt_score, 2)
            }
        })

    scored_options.sort(key=lambda x: x['score'], reverse=True)
    
    return {
        "rankedOptions": scored_options,
        "excludedOptions": excluded_options,
        "weightsUsed": w,
        "disclaimer": "Prices include estimated GST and platform fees. Offers applied per provider terms."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)