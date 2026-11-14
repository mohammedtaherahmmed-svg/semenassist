import unittest

from metrics import track_metrics


class TrackMetricsTests(unittest.TestCase):
    def test_constant_velocity_respects_skipped_source_frames(self):
        result = track_metrics([(0, 0), (2, 0), (4, 0)], [0, 4, 8], 1.0, 20.0)
        self.assertAlmostEqual(result["vcl"], 10.0)
        self.assertAlmostEqual(result["vsl"], 10.0)
        self.assertAlmostEqual(result["vap"], 10.0)
        self.assertAlmostEqual(result["lin"], 1.0)

    def test_curved_track_has_greater_curvilinear_than_straight_velocity(self):
        result = track_metrics([(0, 0), (1, 2), (2, 0)], [0, 1, 2], 1.0, 10.0)
        self.assertGreater(result["vcl"], result["vsl"])
        self.assertGreater(result["alh"], 0)

    def test_rejects_non_monotonic_frame_indices(self):
        with self.assertRaises(ValueError):
            track_metrics([(0, 0), (1, 0)], [3, 3], 1.0, 30.0)

    def test_rejects_invalid_calibration(self):
        with self.assertRaises(ValueError):
            track_metrics([(0, 0), (1, 0)], [0, 1], 0.0, 30.0)


if __name__ == "__main__":
    unittest.main()
