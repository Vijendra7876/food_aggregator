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
    provider_path = os.path.join(DATA_DIR, "provider_restaurants.csv")
    canonical_path = os.path.join(DATA_DIR, "canonical_restaurants.csv")
    providers = pd.read_csv(provider_path) if os.path.exists(provider_path) else pd.DataFrame()
    canonical = pd.read_csv(canonical_path) if os.path.exists(canonical_path) else pd.DataFrame()

    issues = []
    if not providers.empty:
        for column in ("listing_id", "provider", "restaurant_name", "city"):
            if column not in providers.columns:
                issues.append({"providerId": "dataset", "recordId": "provider_restaurants.csv", "level": "error", "reason": f"Missing required column: {column}"})
                continue
            missing = providers[column].isna() | providers[column].astype(str).str.strip().eq("")
            for _, row in providers[missing].head(50).iterrows():
                issues.append({"providerId": str(row.get("provider") or "unknown"), "recordId": str(row.get("listing_id") or "unknown"), "level": "error", "reason": f"Missing required value: {column}"})
        if "listing_id" in providers.columns:
            duplicates = providers[providers["listing_id"].duplicated(keep=False)]
            for _, row in duplicates.head(50).iterrows():
                issues.append({"providerId": str(row.get("provider") or "unknown"), "recordId": str(row["listing_id"]), "level": "error", "reason": "Duplicate listing_id"})

    queue = get_review_queue_data()
    return {
        "rawListings": len(providers),
        "canonicalRestaurants": int(canonical["canonical_restaurant_id"].nunique()) if "canonical_restaurant_id" in canonical else len(canonical),
        "pendingReviews": len(queue),
        "issues": issues,
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
