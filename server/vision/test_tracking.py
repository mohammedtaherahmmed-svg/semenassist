import unittest

from tracking import KalmanCV2D, hungarian_assign


class HungarianAssignmentTests(unittest.TestCase):
    def test_finds_global_minimum_assignment(self):
        # Greedy would consume detection 0 for track 0 and leave track 1 far away.
        matches = hungarian_assign([(0.0, 0.0), (3.0, 0.0)], [(2.0, 0.0), (-2.0, 0.0)], 5.0)
        self.assertEqual(matches, [(0, 1), (1, 0)])

    def test_assignment_is_one_to_one(self):
        self.assertEqual(hungarian_assign([(0.0, 0.0), (0.2, 0.0)], [(0.1, 0.0)], 1.0), [(0, 0)])

    def test_unmatched_detections_and_tracks_are_allowed(self):
        self.assertEqual(hungarian_assign([(0.0, 0.0)], [(5.0, 5.0)], 2.0), [])

    def test_empty_inputs(self):
        self.assertEqual(hungarian_assign([], [(1.0, 1.0)], 2.0), [])
        self.assertEqual(hungarian_assign([(1.0, 1.0)], [], 2.0), [])

    def test_rejects_invalid_inputs(self):
        with self.assertRaises(ValueError):
            hungarian_assign([(0.0, 0.0)], [], float("nan"))
        with self.assertRaises(ValueError):
            hungarian_assign([(float("inf"), 0.0)], [], 1.0)


class KalmanCV2DTests(unittest.TestCase):
    def test_constant_velocity_prediction_and_measurement_update(self):
        kalman = KalmanCV2D((0.0, 0.0))
        kalman.update((1.0, 0.0))
        kalman.predict(1.0)
        predicted_x, predicted_y = kalman.position
        self.assertGreater(predicted_x, 1.0)
        self.assertAlmostEqual(predicted_y, 0.0, places=6)
        kalman.update((2.0, 0.0))
        self.assertGreater(kalman.position[0], predicted_x - 0.1)


if __name__ == "__main__":
    unittest.main()
