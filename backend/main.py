import os
import sys
from datetime import datetime, timezone
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
def search_restaurants(q: str = "", cuisine: str = "", provider: str = "", city: str = "", limit: int = 100):
    """Return the canonical search-card contract consumed by the React app."""
    df = load_data(DATA_PATH)
    if df.empty:
        return {"total": 0, "results": []}

    menus_path = os.path.join(SCRIPT_DIR, "data", "provider_menu_items.csv")
    menus = pd.read_csv(menus_path) if os.path.exists(menus_path) else pd.DataFrame()
    q_text = q.strip().casefold()
    cuisine_text = cuisine.strip().casefold()
    provider_text = provider.strip().casefold()
    city_text = city.strip().casefold()
    if not menus.empty:
        menus["normalized_item_name"] = menus.get("normalized_item_name", menus["item_name"]).fillna("").astype(str)

    results = []
    for canonical_id, group in df.groupby("canonical_restaurant_id", sort=False, dropna=False):
        if provider_text:
            group = group[group["provider"].fillna("").astype(str).str.contains(provider_text, case=False, regex=False)]
            if group.empty:
                continue
        first = group.iloc[0]
        listing_ids = set(group["listing_id"].dropna().astype(str))
        name = str(first.get("canonical_name") or first.get("restaurant_name") or "Unknown restaurant")
        area = first.get("locality_canon") or first.get("locality_prov") or first.get("city_canon") or first.get("city_prov") or ""
        cuisines = sorted({part.strip() for value in group.get("canonical_cuisine", group["cuisines"]).dropna().astype(str) for part in value.split(",") if part.strip()})

        listing_names = " ".join(group.get("restaurant_name", pd.Series(dtype=str)).fillna("").astype(str))
        menu_rows = menus[menus["listing_id"].astype(str).isin(listing_ids)] if not menus.empty else menus
        menu_names = " ".join(menu_rows.get("item_name", pd.Series(dtype=str)).fillna("").astype(str))
        if q_text and q_text not in name.casefold() and q_text not in listing_names.casefold() and q_text not in menu_names.casefold():
            continue
        if cuisine_text and not any(cuisine_text in value.casefold() for value in cuisines):
            continue
        if city_text and city_text not in " ".join(str(value) for value in group.get("city_canon", group["city_prov"]).dropna()).casefold() and city_text not in str(area).casefold():
            continue

        providers = []
        rating_weighted = 0.0
        rating_count = 0.0
        for _, row in group.iterrows():
            provider_name = str(row.get("provider") or "Unknown")
            eta = row.get("average_delivery_time_minutes")
            eta = float(eta) if pd.notna(eta) else None
            updated = pd.to_datetime(row.get("source_updated_at"), errors="coerce", utc=True)
            age_min = max(0, int((datetime.now(timezone.utc) - updated.to_pydatetime()).total_seconds() / 60)) if pd.notna(updated) else None
            freshness = {"ageMin": age_min, "status": "stale" if age_min is None or age_min > 1440 else ("aging" if age_min > 180 else "fresh")}
            providers.append({"id": str(row.get("listing_id")), "name": provider_name, "etaMin": eta, "freshness": freshness})
            rating = row.get("rating")
            count = row.get("rating_count")
            if pd.notna(rating) and pd.notna(count) and float(count) > 0:
                rating_weighted += float(rating) * float(count)
                rating_count += float(count)
        if not providers:
            continue

        grouped_items = {}
        for _, item in menu_rows.iterrows():
            item_key = str(item.get("normalized_item_name") or item.get("item_name") or "").strip().casefold()
            if not item_key:
                continue
            entry = grouped_items.setdefault(item_key, {"name": str(item.get("item_name") or item_key), "prices": [], "providers": set()})
            price = item.get("price_inr")
            if pd.notna(price):
                entry["prices"].append(float(price))
            entry["providers"].add(str(item.get("provider") or ""))
        matched_items = [{"name": item["name"], "minPrice": round(min(item["prices"]), 2) if item["prices"] else None,
                          "maxPrice": round(max(item["prices"]), 2) if item["prices"] else None, "providers": len(item["providers"])}
                         for item in grouped_items.values()]
        if q_text and q_text not in name.casefold() and q_text not in listing_names.casefold():
            matched_items = [item for item in matched_items if q_text in item["name"].casefold()]
        combined = round(rating_weighted / rating_count, 2) if rating_count else None
        evidence = "high" if rating_count >= 1000 else ("medium" if rating_count >= 100 else "low")
        results.append({"id": str(canonical_id), "name": name, "area": str(area), "cuisines": cuisines,
                        "rating": {"combined": combined, "evidence": evidence}, "matchedItems": matched_items,
                        "providers": providers})

    results.sort(key=lambda result: (result["rating"]["combined"] is None, -(result["rating"]["combined"] or 0), result["name"].casefold()))
    bounded_limit = max(1, min(int(limit), 100))
    return {"total": len(results), "results": results[:bounded_limit]}

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
