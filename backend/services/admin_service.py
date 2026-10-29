import os
from threading import Lock

import pandas as pd

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
_DECISIONS: dict[str, str] = {}
_DECISIONS_LOCK = Lock()


def demo_admin_enabled() -> bool:
    return os.getenv("ADMIN_DEMO_MODE", "").casefold() == "true" and os.getenv("NODE_ENV", "").casefold() != "production"


def get_review_queue_data() -> list[dict]:
    """Build demo review cards from labeled manual-review benchmark examples."""
    eval_path = os.path.join(DATA_DIR, "restaurant_match_evaluation.csv")
    listing_path = os.path.join(DATA_DIR, "provider_restaurants.csv")
    if not os.path.exists(eval_path) or not os.path.exists(listing_path):
        return []

    examples = pd.read_csv(eval_path).fillna("")
    listings = pd.read_csv(listing_path).fillna("").set_index("listing_id", drop=False)
    with _DECISIONS_LOCK:
        decided_ids = set(_DECISIONS)

    queue = []
    for _, pair in examples[examples["expected_decision"].eq("manual_review")].iterrows():
        pair_id = str(pair["pair_id"])
        if pair_id in decided_ids:
            continue

        left = listings.loc[str(pair["listing_id_a"])] if str(pair["listing_id_a"]) in listings.index else None
        right = listings.loc[str(pair["listing_id_b"])] if str(pair["listing_id_b"]) in listings.index else None
        if left is None or right is None:
            continue

        def public_listing(row: pd.Series) -> dict:
            return {
                "providerId": str(row["provider"]).strip().casefold().replace(" ", "-"),
                "providerName": str(row["provider"]),
                "name": str(row["restaurant_name"]),
                "address": str(row["full_address"]),
            }

        queue.append({
            "id": pair_id,
            "similarityCase": str(pair["name_similarity_case"]),
            "rationale": str(pair["rationale"]),
            "a": public_listing(left),
            "b": public_listing(right),
        })
    return queue


def get_pipeline_metrics() -> dict:
    filenames = {
        "listings": "provider_restaurants.csv",
        "canonical": "canonical_restaurants.csv",
        "menus": "provider_menu_items.csv",
        "offers": "provider_offers.csv",
        "reviews": "reviews.csv",
    }
    datasets: dict[str, pd.DataFrame] = {}
    issues: list[dict] = []

    def add_issue(dataset: str, record_id: str, level: str, reason: str, provider: str = "dataset") -> None:
        issues.append({"providerId": provider or "unknown", "recordId": record_id or "unknown", "level": level, "reason": f"{dataset}: {reason}"})

    for name, filename in filenames.items():
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            datasets[name] = pd.DataFrame()
            add_issue(filename, filename, "error", "Dataset file is missing")
            continue
        try:
            datasets[name] = pd.read_csv(path)
        except Exception as error:
            datasets[name] = pd.DataFrame()
            add_issue(filename, filename, "error", f"Could not read dataset ({type(error).__name__})")

    required = {
        "listings": ("listing_id", "provider", "restaurant_name", "city"),
        "canonical": ("canonical_restaurant_id", "canonical_name"),
        "menus": ("menu_listing_id", "listing_id", "item_name", "normalized_item_name", "price_inr", "is_available"),
        "offers": ("offer_id", "listing_id", "offer_title", "discount_type", "discount_value", "offer_status"),
        "reviews": ("review_id", "listing_id", "review_date", "review_text", "food_sentiment", "delivery_sentiment", "service_sentiment"),
    }
    primary_keys = {"listings": "listing_id", "canonical": "canonical_restaurant_id", "menus": "menu_listing_id", "offers": "offer_id", "reviews": "review_id"}
    display_names = {"listings": filenames["listings"], "canonical": filenames["canonical"], "menus": filenames["menus"], "offers": filenames["offers"], "reviews": filenames["reviews"]}
    for name, frame in datasets.items():
        filename = display_names[name]
        for column in required[name]:
            if column not in frame.columns:
                add_issue(filename, filename, "error", f"Missing required column: {column}")
        if frame.empty:
            continue
        key = primary_keys[name]
        if key in frame.columns:
            blank = frame[key].isna() | frame[key].astype(str).str.strip().eq("")
            for _, row in frame[blank].head(50).iterrows():
                add_issue(filename, filename, "error", f"Missing primary key: {key}", str(row.get("provider", "dataset")))
            for _, row in frame[frame[key].duplicated(keep=False)].head(50).iterrows():
                add_issue(filename, str(row.get(key, "unknown")), "error", f"Duplicate primary key: {key}", str(row.get("provider", "dataset")))
        for column in required[name]:
            if column == key or column not in frame.columns:
                continue
            if name == "menus" and column == "price_inr":  # Null price is an unknown, not a zero-price item.
                continue
            missing = frame[column].isna() | frame[column].astype(str).str.strip().eq("")
            for _, row in frame[missing].head(25).iterrows():
                add_issue(filename, str(row.get(key, "unknown")), "error", f"Missing required value: {column}", str(row.get("provider", "dataset")))

    listings = datasets["listings"]
    listing_ids = set(listings.get("listing_id", pd.Series(dtype=str)).dropna().astype(str))
    canonical = datasets["canonical"]
    canonical_ids = set(canonical.get("canonical_restaurant_id", pd.Series(dtype=str)).dropna().astype(str))
    for name in ("menus", "offers", "reviews"):
        frame = datasets[name]
        if "listing_id" not in frame.columns:
            continue
        for _, row in frame[~frame["listing_id"].isna() & ~frame["listing_id"].astype(str).isin(listing_ids)].head(50).iterrows():
            add_issue(display_names[name], str(row.get(primary_keys[name], "unknown")), "error", f"References unknown listing_id {row['listing_id']}", str(row.get("provider", "dataset")))

    if "canonical_restaurant_id" in listings.columns:
        linked = listings[listings["canonical_restaurant_id"].notna() & ~listings["canonical_restaurant_id"].astype(str).isin(canonical_ids)]
        for _, row in linked.head(50).iterrows():
            add_issue(filenames["listings"], str(row.get("listing_id", "unknown")), "error", f"References unknown canonical_restaurant_id {row['canonical_restaurant_id']}", str(row.get("provider", "dataset")))

    menus = datasets["menus"]
    if "price_inr" in menus.columns:
        prices = pd.to_numeric(menus["price_inr"], errors="coerce")
        for _, row in menus[prices.notna() & prices.le(0)].head(50).iterrows():
            add_issue(filenames["menus"], str(row.get("menu_listing_id", "unknown")), "error", "Menu price must be positive", str(row.get("provider", "dataset")))
        for _, row in menus[prices.isna()].head(25).iterrows():
            add_issue(filenames["menus"], str(row.get("menu_listing_id", "unknown")), "warning", "Menu price is unknown and cannot be compared", str(row.get("provider", "dataset")))
    if "is_available" in menus.columns:
        unknown_availability = menus[menus["is_available"].isna()]
        for _, row in unknown_availability.head(25).iterrows():
            add_issue(filenames["menus"], str(row.get("menu_listing_id", "unknown")), "warning", "Availability is unknown; the item is excluded from price recommendations", str(row.get("provider", "dataset")))

    offers = datasets["offers"]
    if "minimum_order_value_inr" in offers.columns:
        unknown_minimum = offers[offers["minimum_order_value_inr"].isna()]
        for _, row in unknown_minimum.head(25).iterrows():
            add_issue(filenames["offers"], str(row.get("offer_id", "unknown")), "warning", "Minimum order rule is unknown; this offer is not applied", str(row.get("provider", "dataset")))
    if {"discount_type", "maximum_discount_inr"} <= set(offers.columns):
        percentage_without_cap = offers[offers["discount_type"].astype(str).str.casefold().isin(["percentage", "percent"]) & offers["maximum_discount_inr"].isna()]
        for _, row in percentage_without_cap.head(25).iterrows():
            add_issue(filenames["offers"], str(row.get("offer_id", "unknown")), "warning", "Percentage discount cap is unknown; this offer is not applied", str(row.get("provider", "dataset")))
    if {"valid_from", "valid_until"} <= set(offers.columns):
        start = pd.to_datetime(offers["valid_from"], errors="coerce")
        end = pd.to_datetime(offers["valid_until"], errors="coerce")
        invalid_dates = start.notna() & end.notna() & start.gt(end)
        for _, row in offers[invalid_dates].head(50).iterrows():
            add_issue(filenames["offers"], str(row.get("offer_id", "unknown")), "error", "Offer validity starts after it ends", str(row.get("provider", "dataset")))

    providers = datasets["listings"]
    if "rating" in providers.columns:
        ratings = pd.to_numeric(providers["rating"], errors="coerce")
        invalid = ratings.notna() & ((ratings < 0) | (ratings > 5))
        for _, row in providers[invalid].head(50).iterrows():
            add_issue(filenames["listings"], str(row.get("listing_id", "unknown")), "warning", "Rating is outside the 0 to 5 range", str(row.get("provider", "dataset")))
    if "average_delivery_time_minutes" in providers.columns:
        eta = pd.to_numeric(providers["average_delivery_time_minutes"], errors="coerce")
        invalid = eta.notna() & ((eta <= 0) | (eta >= 300))
        for _, row in providers[invalid].head(50).iterrows():
            add_issue(filenames["listings"], str(row.get("listing_id", "unknown")), "warning", "Delivery estimate is outside the supported range", str(row.get("provider", "dataset")))

    reviews = datasets["reviews"]
    if "review_date" in reviews.columns:
        invalid_dates = pd.to_datetime(reviews["review_date"], errors="coerce").isna()
        for _, row in reviews[invalid_dates].head(50).iterrows():
            add_issue(filenames["reviews"], str(row.get("review_id", "unknown")), "error", "Review date is invalid", str(row.get("provider", "dataset")))

    queue = get_review_queue_data()
    return {
        "rawListings": len(listings),
        "canonicalRestaurants": len(canonical_ids),
        "menuItems": len(menus),
        "offers": len(datasets["offers"]),
        "reviews": len(datasets["reviews"]),
        "pendingReviews": len(queue),
        "issues": issues[:250],
        "issueCount": len(issues),
        "demoOnly": True,
        "persistence": "CSV benchmark samples; decisions are in-memory only",
        "mutationsEnabled": demo_admin_enabled(),
    }


def process_review_decision(match_id: str, decision: str) -> dict:
    if decision not in {"merge", "keep_separate"}:
        raise ValueError("Decision must be 'merge' or 'keep_separate'.")
    if not demo_admin_enabled():
        raise PermissionError("Demo review decisions are disabled. Set ADMIN_DEMO_MODE=true in local development.")
    if not any(item["id"] == match_id for item in get_review_queue_data()):
        raise KeyError("Review example not found or already handled.")

    with _DECISIONS_LOCK:
        if match_id in _DECISIONS:
            raise KeyError("Review example not found or already handled.")
        _DECISIONS[match_id] = decision
    return {
        "status": "accepted",
        "matchId": match_id,
        "decision": decision,
        "persisted": False,
        "message": "Recorded for this Python process only. It does not change canonical data and is cleared on restart.",
    }


def reset_demo_decisions() -> None:
    """Reset the process-local demo state for deterministic tests."""
    with _DECISIONS_LOCK:
        _DECISIONS.clear()
