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


    def test_stationary_track_has_zero_velocity(self):
        result = track_metrics([(3, 7), (3, 7), (3, 7)], [0, 2, 4], 0.5, 20.0)
        self.assertAlmostEqual(result["vcl"], 0.0)
        self.assertAlmostEqual(result["vsl"], 0.0)
        self.assertAlmostEqual(result["vap"], 0.0)

    def test_velocity_scales_linearly_with_calibration(self):
        points = [(0, 0), (4, 0), (8, 0)]
        frames = [0, 2, 4]
        low = track_metrics(points, frames, 0.5, 20.0)
        high = track_metrics(points, frames, 1.0, 20.0)
        self.assertAlmostEqual(high["vcl"], low["vcl"] * 2)
        self.assertAlmostEqual(high["vsl"], low["vsl"] * 2)

    def test_curvilinear_velocity_is_not_below_straight_line_velocity(self):
        result = track_metrics([(0, 0), (1, 2), (2, 0), (3, 2)], [0, 1, 2, 3], 1.0, 30.0)
        self.assertGreaterEqual(result["vcl"], result["vsl"])
        for key in ("vcl", "vsl", "vap", "lin", "str", "wob", "alh"):
            self.assertTrue(__import__("math").isfinite(result[key]), key)


if __name__ == "__main__":
    unittest.main()
