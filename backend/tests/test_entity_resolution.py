from pathlib import Path

import pandas as pd


DATA = Path(__file__).resolve().parents[1] / "data"


def test_saved_entity_match_evaluation_reports_binary_metrics_only_on_labeled_pairs():
    labels = pd.read_csv(DATA / "restaurant_match_evaluation.csv")
    results = pd.read_csv(DATA / "evaluation_results.csv")
    binary_labels = labels[labels["expected_decision"].isin(["match", "non_match"])]
    assert len(labels) == 100
    assert len(binary_labels) == 70
    assert (labels["expected_decision"] == "manual_review").sum() == 30
    assert set(results["pair_id"]) == set(binary_labels["pair_id"])

    joined = binary_labels[["pair_id", "expected_decision"]].merge(results[["pair_id", "predicted"]], on="pair_id", validate="one_to_one")
    true_match = joined["expected_decision"].eq("match")
    predicted_match = joined["predicted"].eq("match")
    true_positive = int((true_match & predicted_match).sum())
    false_positive = int((~true_match & predicted_match).sum())
    false_negative = int((true_match & ~predicted_match).sum())
    true_negative = int((~true_match & ~predicted_match).sum())
    accuracy = (true_positive + true_negative) / len(joined)
    precision = true_positive / (true_positive + false_positive)
    recall = true_positive / (true_positive + false_negative)

    assert accuracy == 68 / 70
    assert precision == 1.0
    assert recall == 33 / 35
