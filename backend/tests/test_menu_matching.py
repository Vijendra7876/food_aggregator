import sys
import os
import pytest
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from main import price_basket # type: ignore

def test_pricing_minimum_order_and_gst():
    # Mock data frames for testing pricing rule 7
    mock_providers = pd.DataFrame([
        {"listing_id": "LIST0001", "provider": "Swiggy", "rating": 4.2, "rating_count": 100}
    ])
    mock_menus = pd.DataFrame([
        {"listing_id": "LIST0001", "item_name": "Masala Dosa", "price_inr": 150.0, "is_available": True}
    ])
    mock_offers = pd.DataFrame([
        {
            "listing_id": "LIST0001", 
            "minimum_order_value_inr": 200.0, 
            "discount_type": "percentage", 
            "discount_value": 20.0, 
            "maximum_discount_inr": 50.0,
            "offer_title": "20% OFF"
        }
    ])

    # Test case 1: Subtotal below minimum order value (150 < 200) -> discount should not apply
    basket_low = [{"item_name": "Masala Dosa", "quantity": 1}]
    res_low = price_basket("LIST0001", basket_low, mock_menus, mock_offers, mock_providers)
    
    assert res_low["available"] == True
    assert res_low["subtotal"] == 150.0
    assert res_low["discount"] == 0.0

    # Test case 2: Subtotal above minimum order value (300 >= 200) -> discount should apply
    basket_high = [{"item_name": "Masala Dosa", "quantity": 2}]
    res_high = price_basket("LIST0001", basket_high, mock_menus, mock_offers, mock_providers)
    
    assert res_high["available"] == True
    assert res_high["subtotal"] == 300.0
    assert res_high["discount"] == 50.0 # capped at 50
    assert res_high["food_gst"] == 15.0 # 5% of 300
