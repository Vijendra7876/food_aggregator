import os
import math
import re
import sys
from datetime import datetime, timezone
import pandas as pd
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from routers import admin
from services.admin_service import demo_admin_enabled

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

def _text(value, default=""):
    return default if value is None or pd.isna(value) else str(value).strip()

def _number(value, default=None):
    return default if value is None or pd.isna(value) else float(value)

def _boolean(value, default=False):
    if value is None or pd.isna(value):
        return default
    if isinstance(value, str):
        return value.strip().casefold() in {"true", "1", "yes", "available", "active"}
    return bool(value)

def _provider_id(value):
    return re.sub(r"[^a-z0-9]+", "-", _text(value, "unknown").casefold()).strip("-") or "unknown"

def _freshness(value):
    timestamp = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(timestamp):
        return {"ageMin": None, "status": "stale"}
    age_min = max(0, int((datetime.now(timezone.utc) - timestamp.to_pydatetime()).total_seconds() / 60))
    status = "stale" if age_min > 1440 else ("aging" if age_min > 180 else "fresh")
    return {"ageMin": age_min, "status": status}

def _sentiment_aggregate(reviews_df, column):
    if reviews_df.empty or column not in reviews_df.columns:
        return {"score": None, "mentions": 0, "enough": False}
    values = reviews_df[column].fillna("").astype(str).str.casefold()
    expressed = values[values.isin(["positive", "negative"])]
    mentions = len(expressed)
    return {"score": round(float((expressed == "positive").mean()), 3) if mentions else None,
            "mentions": mentions, "enough": mentions >= 5}

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
        q = int(sel.get('quantity', sel.get('qty', 1)))
        item_query = str(sel.get('item_name', sel.get('itemId', ''))).strip().casefold()
        if not item_query or q < 1 or q > 20:
            missing_items.append(item_query or "invalid basket selection")
            continue

        normalized = listing_menus.get("normalized_item_name", listing_menus["item_name"]).fillna("").astype(str).str.casefold()
        match = listing_menus[normalized == item_query]
        if match.empty:
            match = listing_menus[listing_menus["item_name"].fillna("").astype(str).str.casefold() == item_query]
            
        if match.empty:
            missing_items.append(item_query)
        else:
            m_row = match.iloc[0]
            is_avail = _boolean(m_row.get('is_available'), True)
            if not is_avail:
                missing_items.append(f"{m_row['item_name']} (unavailable)")
            else:
                price = m_row.get('price_inr', 0.0)
                if pd.isna(price):
                    missing_items.append(f"{m_row['item_name']} (price unknown)")
                else:
                    subtotal += float(price) * q
                
    if missing_items:
        return {
            "available": False,
            "missing_items": missing_items,
            "reason": f"Missing or unavailable items: {', '.join(missing_items)}"
        }
        
    food_gst = 0.05 * subtotal
    provider_row = prov_row.iloc[0]
    delivery_fee = _number(provider_row.get("delivery_fee_inr", provider_row.get("delivery_fee")))
    platform_fee = _number(provider_row.get("platform_fee_inr", provider_row.get("platform_fee")))
    gst_on_fees = 0.18 * (delivery_fee + platform_fee) if delivery_fee is not None and platform_fee is not None else 0.0
    
    listing_offers = offers_df[offers_df['listing_id'] == listing_id]
    max_discount = 0.0
    applied_offer_title = None
    
    today = pd.Timestamp.now(tz="UTC").date()
    for _, offer in listing_offers.iterrows():
        if _text(offer.get("offer_status"), "active").casefold() not in {"active", "valid", ""}:
            continue
        valid_from = pd.to_datetime(offer.get("valid_from"), errors="coerce")
        valid_until = pd.to_datetime(offer.get("valid_until"), errors="coerce")
        if pd.notna(valid_from) and valid_from.date() > today:
            continue
        if pd.notna(valid_until) and valid_until.date() < today:
            continue
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
                
    total = max(0.0, subtotal + food_gst + gst_on_fees - max_discount)
    
    return {
        "available": True,
        "subtotal": round(subtotal, 2),
        "food_gst": round(food_gst, 2),
        "delivery_fee": delivery_fee,
        "platform_fee": platform_fee,
        "gst_on_fees": round(gst_on_fees, 2),
        "discount": round(max_discount, 2),
        "applied_offer": applied_offer_title,
        "total": round(total, 2),
        "is_lower_bound": delivery_fee is None or platform_fee is None,
        "unknowns": [fee for fee, value in (("delivery fee", delivery_fee), ("platform fee", platform_fee)) if value is None],
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
    canonical, providers, menus, offers, reviews = load_all()
    if canonical.empty or providers.empty:
        raise HTTPException(status_code=404, detail="Restaurant datasets are unavailable")

    listing_match = providers[providers["listing_id"].astype(str) == listing_id]
    master = load_data(DATA_PATH)
    if not listing_match.empty:
        linked_id = _text(listing_match.iloc[0].get("canonical_restaurant_id"))
        if linked_id:
            canonical_id = linked_id
            canonical_match = canonical[canonical["canonical_restaurant_id"].astype(str) == canonical_id]
            restaurant = canonical_match.iloc[0] if not canonical_match.empty else None
            listings = providers[providers["canonical_restaurant_id"].astype(str) == canonical_id].copy()
        else:
            # Unmatched single-provider records have no canonical row; keep each listing independent.
            canonical_id = listing_id
            row_match = master[master["listing_id"].astype(str) == listing_id]
            restaurant = row_match.iloc[0] if not row_match.empty else listing_match.iloc[0]
            listings = listing_match.copy()
    else:
        canonical_id = listing_id
        canonical_match = canonical[canonical["canonical_restaurant_id"].astype(str) == canonical_id]
        if canonical_match.empty:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        restaurant = canonical_match.iloc[0]
        listings = providers[providers["canonical_restaurant_id"].astype(str) == canonical_id].copy()
    if listings.empty:
        raise HTTPException(status_code=404, detail="Restaurant has no provider listings")
    listing_ids = set(listings["listing_id"].astype(str))
    restaurant_menus = menus[menus["listing_id"].astype(str).isin(listing_ids)].copy()
    restaurant_reviews = reviews[reviews["listing_id"].astype(str).isin(listing_ids)].copy()

    detail_listings = []
    for _, row in listings.iterrows():
        source_id = str(row["listing_id"])
        detail_listings.append({
            "providerId": _provider_id(row.get("provider")),
            "providerName": _text(row.get("provider"), "Unknown provider"),
            "recordId": _text(row.get("provider_restaurant_id"), source_id),
            "providerListingName": _text(row.get("restaurant_name"), "Unknown listing"),
            "etaMin": _number(row.get("average_delivery_time_minutes")),
            "deliveryFee": _number(row.get("delivery_fee_inr", row.get("delivery_fee"))),
            "platformFee": _number(row.get("platform_fee_inr", row.get("platform_fee"))),
            "rating": _number(row.get("rating")),
            "ratingCount": _number(row.get("rating_count")),
            "url": "",
            "fetchedAt": _text(row.get("source_updated_at")),
            "freshness": _freshness(row.get("source_updated_at")),
        })

    if not restaurant_menus.empty:
        restaurant_menus["normalized_item_name"] = restaurant_menus.get("normalized_item_name", restaurant_menus["item_name"]).fillna("").astype(str).str.casefold()
    items = []
    for item_key, item_rows in restaurant_menus.groupby("normalized_item_name", sort=True, dropna=False):
        if not _text(item_key):
            continue
        first_item = item_rows.iloc[0]
        item_offers = []
        for _, item_row in item_rows.iterrows():
            provider_row = listings[listings["listing_id"].astype(str) == str(item_row["listing_id"])].iloc[0]
            item_offers.append({
                "providerId": _provider_id(provider_row.get("provider")),
                "providerName": _text(provider_row.get("provider"), "Unknown provider"),
                "providerItemName": _text(item_row.get("item_name")),
                "price": _number(item_row.get("price_inr")),
                "available": _boolean(item_row.get("is_available"), True),
            })
        items.append({
            "id": str(item_key),
            "name": _text(first_item.get("item_name"), str(item_key)),
            "veg": all(_boolean(value, False) for value in item_rows.get("is_vegetarian", pd.Series(dtype=object)).tolist()),
            "vegetarian": all(_boolean(value, False) for value in item_rows.get("is_vegetarian", pd.Series(dtype=object)).tolist()),
            "portion": "regular",
            "offers": item_offers,
        })

    # Use listing ratings with Bayesian shrinkage; sentiment labels remain separate evidence.
    per_source = []
    weighted_rating = 0.0
    weight_total = 0.0
    for _, row in listings.iterrows():
        raw_rating = _number(row.get("rating"))
        count = _number(row.get("rating_count"), 0.0) or 0.0
        if raw_rating is None:
            continue
        adjusted = (count * raw_rating + 30 * 3.9) / (count + 30)
        provider_id = _provider_id(row.get("provider"))
        per_source.append({"providerId": provider_id, "raw": raw_rating, "count": int(count), "adjusted": round(adjusted, 2)})
        weighted_rating += adjusted * max(count, 1)
        weight_total += max(count, 1)
    combined_rating = round(weighted_rating / weight_total, 2) if weight_total else None

    aspects = {
        "food": _sentiment_aggregate(restaurant_reviews, "food_sentiment"),
        "delivery": _sentiment_aggregate(restaurant_reviews, "delivery_sentiment"),
        "service": _sentiment_aggregate(restaurant_reviews, "service_sentiment"),
        "value": {"score": None, "mentions": 0, "enough": False},
    }
    provider_delivery = {}
    for _, row in listings.iterrows():
        provider_id = _provider_id(row.get("provider"))
        provider_listing_reviews = restaurant_reviews[restaurant_reviews["listing_id"].astype(str) == str(row["listing_id"])]
        provider_delivery[provider_id] = _sentiment_aggregate(provider_listing_reviews, "delivery_sentiment")

    review_text_column = restaurant_reviews.get("review_text", pd.Series(dtype=str)).fillna("").astype(str)
    dedup_mask = ~review_text_column.str.strip().str.casefold().duplicated()
    unique_reviews = restaurant_reviews[dedup_mask]
    positive_highlights = []
    negative_highlights = []
    for _, review in unique_reviews.iterrows():
        for column, sentiment, target, aspect in (
            ("food_sentiment", "positive", positive_highlights, "food"),
            ("food_sentiment", "negative", negative_highlights, "food"),
            ("delivery_sentiment", "positive", positive_highlights, "delivery"),
            ("delivery_sentiment", "negative", negative_highlights, "delivery"),
        ):
            if _text(review.get(column)).casefold() == sentiment and len(target) < 3:
                snippet = _text(review.get("review_text"))[:180]
                if snippet:
                    target.append({"aspect": aspect, "snippet": snippet, "providerId": _provider_id(review.get("provider"))})
    evidence = "high" if sum(_number(row.get("rating_count"), 0) or 0 for _, row in listings.iterrows()) >= 1000 else ("medium" if per_source else "low")
    reputation = {
        "evidence": evidence,
        "reviewsAnalyzed": len(unique_reviews),
        "duplicatesRemoved": len(restaurant_reviews) - len(unique_reviews),
        "method": "Provider ratings with prior shrinkage; supplied synthetic sentiment labels",
        "disclaimer": "Synthetic demonstration data; sentiment labels are provided with the dataset, not independently verified.",
        "rating": {"combined": combined_rating, "perSource": per_source},
        "foodQuality": {"value": aspects["food"]["score"], "basis": "positive share of labeled food reviews"} if aspects["food"]["score"] is not None else None,
        "aspects": aspects,
        "providerDelivery": provider_delivery,
        "highlights": {"positive": positive_highlights, "negative": negative_highlights},
    }

    conflicts = []
    name_variants = sorted(set(listings["restaurant_name"].dropna().astype(str)))
    if len(name_variants) > 1:
        conflicts.append({"attribute": "provider name", "severity": "info", "detail": "Provider listings use different names: " + ", ".join(name_variants), "policy": "Keep provider names attached to their source listings."})
    observations = []
    observation_fields = (("rating", "rating"), ("ratingCount", "rating_count"), ("averagePriceInr", "average_price_inr"), ("etaMin", "average_delivery_time_minutes"), ("identityConfidence", "identity_confidence"))
    for _, row in listings.iterrows():
        provider_id = _provider_id(row.get("provider"))
        observed_at = _text(row.get("source_updated_at"))
        confidence = _number(row.get("identity_confidence"), 0.0) or 0.0
        for attribute, column in observation_fields:
            if column in listings.columns:
                observations.append({"attribute": attribute, "value": _number(row.get(column)), "providerId": provider_id, "observedAt": observed_at, "confidence": confidence})

    cuisine_value = _text(restaurant.get("canonical_cuisine")) or _text(restaurant.get("cuisines"))
    cuisines = sorted({part.strip() for part in cuisine_value.split(",") if part.strip()})
    area = _text(restaurant.get("locality")) or _text(restaurant.get("locality_canon")) or _text(restaurant.get("locality_prov")) or _text(restaurant.get("city")) or _text(restaurant.get("city_canon")) or _text(restaurant.get("city_prov"))
    return {
        "id": str(canonical_id),
        "name": _text(restaurant.get("canonical_name")) or _text(restaurant.get("restaurant_name"), str(canonical_id)),
        "area": area,
        "phone": None,
        "cuisines": cuisines,
        "listings": detail_listings,
        "items": items,
        "reputation": reputation,
        "conflicts": conflicts,
        "observations": observations,
    }

@app.get("/api/meta")
def get_meta():
    df = load_data(DATA_PATH)
    if df.empty:
        return {"dataMode": "synthetic", "notice": "Synthetic demonstration data only.", "providers": [], "adminDemoEnabled": demo_admin_enabled()}
    
    provider_names = df['provider'].dropna().astype(str).unique().tolist() if 'provider' in df.columns else []
    providers = [{"id": _provider_id(name), "name": name} for name in provider_names]
    synthetic_values = df.get("is_synthetic_prov", pd.Series([True]))
    synthetic = all(_boolean(value, True) for value in synthetic_values)
    
    return {
        "dataMode": "synthetic" if synthetic else "mixed",
        "notice": "Synthetic demonstration data only. Provider prices, availability, fees, and ratings are not live or verified.",
        "providers": providers,
        "adminDemoEnabled": demo_admin_enabled(),
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

    df["_search_group"] = df["canonical_restaurant_id"].where(df["canonical_restaurant_id"].notna(), df["listing_id"])
    results = []
    for search_group_id, group in df.groupby("_search_group", sort=False, dropna=False):
        if provider_text:
            group = group[group["provider"].fillna("").astype(str).str.contains(provider_text, case=False, regex=False)]
            if group.empty:
                continue
        first = group.iloc[0]
        listing_ids = set(group["listing_id"].dropna().astype(str))
        canonical_id = _text(first.get("canonical_restaurant_id")) or str(search_group_id)
        name = _text(first.get("canonical_name")) or _text(first.get("restaurant_name"), "Unknown restaurant")
        area = first.get("locality_canon") or first.get("locality_prov") or first.get("city_canon") or first.get("city_prov") or ""
        cuisine_values = group.get("canonical_cuisine", pd.Series(dtype=str)).dropna().astype(str)
        if not len(cuisine_values):
            cuisine_values = group.get("cuisines", pd.Series(dtype=str)).dropna().astype(str)
        cuisines = sorted({part.strip() for value in cuisine_values for part in value.split(",") if part.strip()})

        listing_names = " ".join(group.get("restaurant_name", pd.Series(dtype=str)).fillna("").astype(str))
        menu_rows = menus[menus["listing_id"].astype(str).isin(listing_ids)] if not menus.empty else menus
        menu_names = " ".join(menu_rows.get("item_name", pd.Series(dtype=str)).fillna("").astype(str))
        if q_text and q_text not in name.casefold() and q_text not in listing_names.casefold() and q_text not in menu_names.casefold():
            continue
        if cuisine_text and not any(cuisine_text in value.casefold() for value in cuisines):
            continue
        cities = []
        for city_column in ("city_canon", "city_prov"):
            if city_column in group.columns:
                cities.extend(group[city_column].dropna().astype(str).tolist())
        if city_text and city_text not in " ".join(cities).casefold() and city_text not in str(area).casefold():
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
    restaurant_id = _text(payload.get("restaurantId"))
    selections = payload.get("selections")
    if not restaurant_id or not isinstance(selections, list) or not selections:
        raise HTTPException(status_code=400, detail="restaurantId and at least one basket selection are required.")
    normalized_selections = []
    for selection in selections:
        if not isinstance(selection, dict):
            raise HTTPException(status_code=400, detail="Each basket selection must be an object.")
        item_id = _text(selection.get("itemId"))
        quantity = selection.get("qty", selection.get("quantity", 1))
        if not item_id or isinstance(quantity, bool):
            raise HTTPException(status_code=400, detail="Each selection requires itemId and an integer qty from 1 to 20.")
        try:
            numeric_quantity = float(quantity)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Each selection requires itemId and an integer qty from 1 to 20.")
        if not math.isfinite(numeric_quantity) or not numeric_quantity.is_integer() or not 1 <= numeric_quantity <= 20:
            raise HTTPException(status_code=400, detail="Each selection requires itemId and an integer qty from 1 to 20.")
        normalized_selections.append({"itemId": item_id, "quantity": int(numeric_quantity)})

    max_eta = payload.get("maxEta")
    if max_eta is not None:
        try:
            max_eta = float(max_eta)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="maxEta must be a positive number.")
        if not math.isfinite(max_eta) or max_eta <= 0:
            raise HTTPException(status_code=400, detail="maxEta must be a positive number.")

    canonical, providers, menus, offers, reviews = load_all()
    restaurant_listings = providers[providers["canonical_restaurant_id"].astype(str) == restaurant_id]
    if restaurant_listings.empty:
        alias = providers[providers["listing_id"].astype(str) == restaurant_id]
        if not alias.empty:
            linked_id = _text(alias.iloc[0].get("canonical_restaurant_id"))
            restaurant_listings = providers[providers["canonical_restaurant_id"].astype(str) == linked_id] if linked_id else alias
    if restaurant_listings.empty:
        raise HTTPException(status_code=404, detail="Restaurant or provider listings not found.")

    priority = _text(payload.get("priority"), "value").casefold().replace(" ", "_")
    priority_aliases = {"best_value": "value", "most_reliable": "reliable", "best_rated": "rated"}
    priority = priority_aliases.get(priority, priority)
    weights_map = {
        "value": {"cost": 0.40, "eta": 0.20, "reliability": 0.25, "rating": 0.15},
        "cheapest": {"cost": 0.70, "eta": 0.10, "reliability": 0.10, "rating": 0.10},
        "fastest": {"cost": 0.10, "eta": 0.70, "reliability": 0.10, "rating": 0.10},
        "reliable": {"cost": 0.10, "eta": 0.15, "reliability": 0.65, "rating": 0.10},
        "rated": {"cost": 0.10, "eta": 0.10, "reliability": 0.20, "rating": 0.60},
    }
    weights = weights_map.get(priority, weights_map["value"])
    eligible = []
    excluded = []
    for _, listing in restaurant_listings.iterrows():
        listing_id = str(listing["listing_id"])
        provider_name = _text(listing.get("provider"), "Unknown provider")
        provider_id = _provider_id(provider_name)
        eta = _number(listing.get("average_delivery_time_minutes"))
        pricing_result = price_basket(listing_id, normalized_selections, menus, offers, providers)
        if not pricing_result["available"]:
            excluded.append({"providerId": provider_id, "providerName": provider_name, "reason": pricing_result["reason"]})
            continue
        if max_eta is not None and (eta is None or eta > max_eta):
            reason = "Delivery time is unknown; cannot confirm the selected limit." if eta is None else f"Delivery time ({eta:g} min) exceeds the {max_eta:g} min limit."
            excluded.append({"providerId": provider_id, "providerName": provider_name, "reason": reason})
            continue
        listing_reviews = reviews[reviews["listing_id"].astype(str) == listing_id]
        sentiments = listing_reviews.get("delivery_sentiment", pd.Series(dtype=str)).fillna("").astype(str).str.casefold()
        expressed = sentiments[sentiments.isin(["positive", "negative"])]
        reliability = float((expressed == "positive").mean()) if len(expressed) else None
        raw_rating = _number(listing.get("rating"))
        rating_count = _number(listing.get("rating_count"), 0) or 0
        adjusted_rating = ((rating_count * raw_rating + 30 * 3.9) / (rating_count + 30)) if raw_rating is not None else None
        pricing = {
            "subtotal": pricing_result["subtotal"],
            "foodTax": pricing_result["food_gst"],
            "deliveryFee": pricing_result["delivery_fee"],
            "platformFee": pricing_result["platform_fee"],
            "feeTax": pricing_result["gst_on_fees"],
            "discount": pricing_result["discount"],
            "discountNote": pricing_result["applied_offer"],
            "total": pricing_result["total"],
            "isLowerBound": pricing_result["is_lower_bound"],
            "unknowns": pricing_result["unknowns"],
            "assumptions": ["Food GST is estimated at 5%."] + (["Delivery and platform fees are unavailable; total excludes them and is a lower bound."] if pricing_result["is_lower_bound"] else []),
            "verified": False,
        }
        eligible.append({
            "providerId": provider_id,
            "providerName": provider_name,
            "url": "",
            "etaMin": eta,
            "freshness": _freshness(listing.get("source_updated_at")),
            "pricing": pricing,
            "reliability": reliability,
            "rating": round(adjusted_rating, 2) if adjusted_rating is not None else None,
        })

    if not eligible:
        return {"options": [], "excluded": excluded, "disclaimer": "No provider can fulfil this basket under the selected constraints. Basket totals are synthetic estimates, not provider checkout prices."}

    costs = [option["pricing"]["total"] for option in eligible]
    known_etas = [option["etaMin"] for option in eligible if option["etaMin"] is not None]
    min_cost, max_cost = min(costs), max(costs)
    min_eta, max_eta = (min(known_etas), max(known_etas)) if known_etas else (None, None)
    for option in eligible:
        cost_score = (max_cost - option["pricing"]["total"]) / (max_cost - min_cost) if max_cost != min_cost else 1.0
        eta_known = option["etaMin"] is not None
        eta_score = ((max_eta - option["etaMin"]) / (max_eta - min_eta) if max_eta != min_eta else 1.0) if eta_known and max_eta is not None else 0.5
        reliability_known = option["reliability"] is not None
        reliability_score = option["reliability"] if reliability_known else 0.5
        rating_known = option["rating"] is not None
        rating_score = min(1.0, max(0.0, (option["rating"] - 1.0) / 4.0)) if rating_known else 0.5
        values = {"cost": cost_score, "eta": eta_score, "reliability": reliability_score, "rating": rating_score}
        known = {"cost": True, "eta": eta_known, "reliability": reliability_known, "rating": rating_known}
        factors = [{"factor": factor, "weight": weights[factor], "value": round(values[factor], 3),
                    "contribution": round(weights[factor] * values[factor], 3), "known": known[factor]}
                   for factor in ("cost", "eta", "reliability", "rating")]
        option["score"] = round(sum(factor["contribution"] for factor in factors) * 100, 2)
        option["factors"] = factors
        option["reasons"] = [
            f"Basket estimate: ₹{option['pricing']['total']:.2f}" + (" before unknown delivery/platform fees" if option["pricing"]["isLowerBound"] else ""),
            f"Reported delivery time: {option['etaMin']} min" if eta_known else "Delivery time is unknown.",
            f"Adjusted rating: {option['rating']:.2f}/5" if rating_known else "Rating evidence is unavailable.",
        ]
        option["badges"] = []
        option.pop("reliability")
        option.pop("rating")

    eligible.sort(key=lambda option: (-option["score"], option["pricing"]["total"], option["providerName"]))
    for rank, option in enumerate(eligible, start=1):
        option["rank"] = rank
        if rank == 1:
            option["badges"].append("Best match for selected priority")
        if option["pricing"]["total"] == min_cost:
            option["badges"].append("Lowest estimated basket total")
        if option["etaMin"] is not None and option["etaMin"] == min_eta:
            option["badges"].append("Fastest reported delivery")

    return {
        "options": eligible,
        "excluded": excluded,
        "disclaimer": "Synthetic demo data. Basket totals use a 5% food GST assumption; unknown fees are excluded and shown as a lower bound. No checkout total is verified.",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=os.getenv("HOST", "127.0.0.1"), port=8000, reload=True)
