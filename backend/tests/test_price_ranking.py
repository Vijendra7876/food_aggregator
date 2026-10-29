import pandas as pd
import pytest

from main import price_basket


def test_quantity_price_gst_and_offer_cap():
    providers = pd.DataFrame([{"listing_id": "L1"}])
    menus = pd.DataFrame([{"listing_id": "L1", "item_name": "Dosa", "normalized_item_name": "dosa", "price_inr": 150.0, "is_available": True}])
    offers = pd.DataFrame([{"listing_id": "L1", "offer_status": "active", "valid_from": None, "valid_until": None,
                            "minimum_order_value_inr": 200.0, "discount_type": "percentage", "discount_value": 20.0,
                            "maximum_discount_inr": 50.0, "offer_title": "20% off"}])
    one = price_basket("L1", [{"itemId": "dosa", "qty": 1}], menus, offers, providers)
    two = price_basket("L1", [{"itemId": "dosa", "qty": 2}], menus, offers, providers)
    assert one["subtotal"] == 150
    assert one["discount"] == 0
    assert two["subtotal"] == 300
    assert two["discount"] == 50
    assert two["food_gst"] == 15
    assert two["total"] == pytest.approx(265)


def test_known_fees_are_included_and_unknown_offer_rules_are_not_assumed():
    providers = pd.DataFrame([{"listing_id": "L1", "delivery_fee_inr": 10.0, "platform_fee_inr": 5.0}])
    menus = pd.DataFrame([{"listing_id": "L1", "item_name": "Dosa", "normalized_item_name": "dosa", "price_inr": 100.0, "is_available": True}])
    offers = pd.DataFrame([{"listing_id": "L1", "offer_status": "active", "valid_from": None, "valid_until": None,
                            "minimum_order_value_inr": None, "discount_type": "flat_amount", "discount_value": 50.0,
                            "maximum_discount_inr": None, "offer_title": "Unclear minimum"}])
    result = price_basket("L1", [{"itemId": "dosa", "qty": 1}], menus, offers, providers)
    assert result["delivery_fee"] == 10
    assert result["platform_fee"] == 5
    assert result["gst_on_fees"] == pytest.approx(2.7)
    assert result["discount"] == 0
    assert result["total"] == pytest.approx(122.7)
    assert result["is_lower_bound"] is False


def test_unknown_availability_is_excluded_from_basket():
    providers = pd.DataFrame([{"listing_id": "L1"}])
    menus = pd.DataFrame([{"listing_id": "L1", "item_name": "Dosa", "normalized_item_name": "dosa", "price_inr": 100.0, "is_available": None}])
    result = price_basket("L1", [{"itemId": "dosa", "qty": 1}], menus, pd.DataFrame(), providers)
    assert result["available"] is False
    assert "unavailable" in result["reason"]


def test_unknown_fees_keep_total_as_lower_bound():
    providers = pd.DataFrame([{"listing_id": "L1", "delivery_fee_inr": None, "platform_fee_inr": 4.0}])
    menus = pd.DataFrame([{"listing_id": "L1", "item_name": "Dosa", "normalized_item_name": "dosa", "price_inr": 100.0, "is_available": True}])
    result = price_basket("L1", [{"itemId": "dosa", "qty": 1}], menus, pd.DataFrame(), providers)
    assert result["is_lower_bound"] is True
    assert result["unknowns"] == ["delivery fee"]
    assert result["total"] == pytest.approx(104 + (0.18 * 4) + 5)
