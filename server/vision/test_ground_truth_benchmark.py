import unittest

from ground_truth_benchmark import evaluate_tracking


class GroundTruthBenchmarkTests(unittest.TestCase):
    def test_perfect_tracks_have_perfect_detection_and_identity_scores(self):
        truth = [
            {"frame": frame, "cell_id": 1, "x_px": frame * 2, "y_px": 10}
            for frame in range(4)
        ]
        predictions = [
            {"frame": frame, "track_id": 7, "x_px": frame * 2, "y_px": 10}
            for frame in range(4)
        ]
        result = evaluate_tracking(truth, predictions)
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["idf1"], 1.0)
        self.assertEqual(result["id_switches"], 0)
        self.assertAlmostEqual(result["mean_absolute_velocity_error"]["vsl"], 0.0)

    def test_identity_switch_is_reported_and_reduces_idf1(self):
        truth = [
            {"frame": frame, "cell_id": 1, "x_px": frame, "y_px": 0}
            for frame in range(3)
        ]
        predictions = [
            {"frame": 0, "track_id": 10, "x_px": 0, "y_px": 0},
            {"frame": 1, "track_id": 11, "x_px": 1, "y_px": 0},
            {"frame": 2, "track_id": 11, "x_px": 2, "y_px": 0},
        ]
        result = evaluate_tracking(truth, predictions)
        self.assertEqual(result["id_switches"], 1)
        self.assertLess(result["idf1"], 1.0)

    def test_identity_switch_and_fragmentation_are_reported(self):
        truth = [{"frame": f, "cell_id": 1, "x_px": float(f), "y_px": 0.0} for f in range(5)]
        predictions = [
            {"frame": 0, "track_id": 1, "x_px": 0.0, "y_px": 0.0},
            {"frame": 1, "track_id": 1, "x_px": 1.0, "y_px": 0.0},
            {"frame": 3, "track_id": 2, "x_px": 3.0, "y_px": 0.0},
            {"frame": 4, "track_id": 2, "x_px": 4.0, "y_px": 0.0},
        ]
        result = evaluate_tracking(truth, predictions, tolerance_px=2)
        self.assertEqual(result["id_switches"], 1)
        self.assertEqual(result["fragmentation"], 1)
        self.assertLess(result["idf1"], 1.0)

    def test_missing_and_false_detections_affect_precision_and_recall(self):
        truth = [
            {"frame": 0, "cell_id": 1, "x_px": 0, "y_px": 0},
            {"frame": 0, "cell_id": 2, "x_px": 100, "y_px": 0},
        ]
        predictions = [
            {"frame": 0, "track_id": 5, "x_px": 1, "y_px": 0},
            {"frame": 0, "track_id": 6, "x_px": 300, "y_px": 0},
        ]
        result = evaluate_tracking(truth, predictions, tolerance_px=5)
        self.assertEqual(result["precision"], 0.5)
        self.assertEqual(result["recall"], 0.5)


if __name__ == "__main__":
    unittest.main()
