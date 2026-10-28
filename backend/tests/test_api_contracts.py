import os
import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import main  # noqa: E402
from services.admin_service import reset_demo_decisions  # noqa: E402


@pytest.fixture(autouse=True)
def clean_demo_decisions():
    reset_demo_decisions()
    yield
    reset_demo_decisions()


@pytest.fixture
def client():
    return TestClient(main.app, client=("127.0.0.1", 54321))


def test_meta_returns_frontend_contract(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    body = response.json()
    assert body["dataMode"] == "synthetic"
    assert "not live or verified" in body["notice"]
    assert {"id", "name"} <= body["providers"][0].keys()
    assert body["adminDemoEnabled"] is False


def test_search_returns_grouped_restaurant_cards_from_csv(client):
    response = client.get("/api/search", params={"q": "Uttapam", "cuisine": "South Indian"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    result = body["results"][0]
    assert {"id", "name", "area", "cuisines", "rating", "matchedItems", "providers"} <= result.keys()
    assert any("Uttapam" in item["name"] for item in result["matchedItems"])
    assert all({"id", "name", "etaMin", "freshness"} <= provider.keys() for provider in result["providers"])


def test_restaurant_detail_returns_complete_frontend_shape_from_csv(client):
    response = client.get("/api/restaurants/CAN0001")
    assert response.status_code == 200
    body = response.json()
    assert {"id", "name", "area", "phone", "cuisines", "listings", "items", "reputation", "conflicts", "observations"} <= body.keys()
    assert body["id"] == "CAN0001"
    assert body["listings"] and body["items"]
    assert {"providerId", "providerName", "recordId", "etaMin", "fetchedAt", "freshness"} <= body["listings"][0].keys()
    assert {"id", "name", "veg", "portion", "offers"} <= body["items"][0].keys()
    assert {"evidence", "reviewsAnalyzed", "rating", "aspects", "providerDelivery", "highlights"} <= body["reputation"].keys()


def test_single_provider_detail_and_compare_use_listing_id_fallback(client):
    listings = pd.read_csv(BACKEND_DIR / "data" / "provider_restaurants.csv")
    menus = pd.read_csv(BACKEND_DIR / "data" / "provider_menu_items.csv")
    singles = listings[listings["canonical_restaurant_id"].isna()]
    available_menus = menus[
        menus["listing_id"].astype(str).isin(singles["listing_id"].astype(str))
        & menus["is_available"].astype(str).str.casefold().isin(["true", "1"])
        & menus["price_inr"].notna()
    ]
    assert not available_menus.empty
    selected_menu = available_menus.iloc[0]
    single = singles[singles["listing_id"].astype(str) == str(selected_menu["listing_id"])].iloc[0]
    detail_response = client.get(f"/api/restaurants/{single['listing_id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == single["listing_id"]
    assert len(detail["listings"]) == 1

    item = next(item for item in detail["items"] if item["id"] == selected_menu["normalized_item_name"])
    available = next(offer for offer in item["offers"] if offer["available"] and offer["price"] is not None)
    response = client.post("/api/compare", json={
        "restaurantId": detail["id"],
        "selections": [{"itemId": item["id"], "qty": 2}],
        "priority": "value",
    })
    assert response.status_code == 200
    assert any(option["pricing"]["subtotal"] == pytest.approx(2 * available["price"]) for option in response.json()["options"])


def test_compare_accepts_frontend_qty_and_returns_compare_contract(client):
    providers = pd.read_csv(BACKEND_DIR / "data" / "provider_restaurants.csv")
    menus = pd.read_csv(BACKEND_DIR / "data" / "provider_menu_items.csv")
    available = menus[menus["is_available"].astype(str).str.casefold().isin(["true", "1"])]
    selection = None
    restaurant_id = None
    for _, menu in available.iterrows():
        provider = providers[providers["listing_id"].astype(str) == str(menu["listing_id"])].iloc[0]
        linked_id = provider.get("canonical_restaurant_id")
        restaurant_id = str(linked_id) if pd.notna(linked_id) else str(provider["listing_id"])
        selection = {"itemId": str(menu["normalized_item_name"]), "qty": 3}
        break
    assert selection is not None

    response = client.post("/api/compare", json={"restaurantId": restaurant_id, "selections": [selection], "priority": "cheapest"})
    assert response.status_code == 200
    body = response.json()
    assert {"options", "excluded", "disclaimer"} <= body.keys()
    assert body["options"]
    option = body["options"][0]
    assert {"rank", "providerId", "providerName", "pricing", "score", "badges", "reasons", "factors"} <= option.keys()
    assert option["pricing"]["subtotal"] > 0
    assert option["pricing"]["verified"] is False
    assert len(option["factors"]) == 4


def test_compare_rejects_invalid_quantity(client):
    response = client.post("/api/compare", json={"restaurantId": "CAN0001", "selections": [{"itemId": "masala-dosa", "qty": 0}]})
    assert response.status_code == 400


def test_admin_read_contract_and_demo_decision_is_ephemeral(client, monkeypatch):
    monkeypatch.setenv("ADMIN_DEMO_MODE", "true")
    monkeypatch.delenv("NODE_ENV", raising=False)
    queue_response = client.get("/api/admin/review-queue")
    assert queue_response.status_code == 200
    queue = queue_response.json()
    assert queue["demoOnly"] is True
    assert queue["mutationsEnabled"] is True
    assert queue["pending"]
    candidate = queue["pending"][0]
    assert {"id", "similarityCase", "rationale", "a", "b"} <= candidate.keys()

    pipeline = client.get("/api/admin/pipeline").json()
    assert {"rawListings", "canonicalRestaurants", "pendingReviews", "issues"} <= pipeline.keys()
    assert pipeline["rawListings"] == len(pd.read_csv(BACKEND_DIR / "data" / "provider_restaurants.csv"))

    decision = client.post(f"/api/admin/review-queue/{candidate['id']}/decision", json={"decision": "keep_separate"})
    assert decision.status_code == 200
    assert decision.json()["persisted"] is False
    assert all(item["id"] != candidate["id"] for item in client.get("/api/admin/review-queue").json()["pending"])


def test_admin_mutation_disabled_without_explicit_demo_flag(client, monkeypatch):
    monkeypatch.delenv("ADMIN_DEMO_MODE", raising=False)
    queue = client.get("/api/admin/review-queue").json()
    candidate_id = queue["pending"][0]["id"]
    response = client.post(f"/api/admin/review-queue/{candidate_id}/decision", json={"decision": "merge"})
    assert response.status_code == 403


def test_admin_mutation_rejects_non_loopback_client(monkeypatch):
    monkeypatch.setenv("ADMIN_DEMO_MODE", "true")
    monkeypatch.delenv("NODE_ENV", raising=False)
    remote_client = TestClient(main.app, client=("192.0.2.10", 54321))
    candidate_id = remote_client.get("/api/admin/review-queue").json()["pending"][0]["id"]
    response = remote_client.post(f"/api/admin/review-queue/{candidate_id}/decision", json={"decision": "merge"})
    assert response.status_code == 403
