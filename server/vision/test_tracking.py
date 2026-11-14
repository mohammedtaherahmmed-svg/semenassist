import unittest

from tracking import greedy_assign


class GreedyAssignmentTests(unittest.TestCase):
    def test_global_nearest_pair_wins_not_track_iteration_order(self):
        # Track 0 can use either detection, but track 1 is much closer to detection 0.
        matches = greedy_assign([(0.0, 0.0), (2.0, 0.0)], [(1.0, 0.0), (-2.0, 0.0)], 4.0)
        self.assertEqual(matches, [(0, 1), (1, 0)])

    def test_assignment_is_one_to_one(self):
        matches = greedy_assign([(0.0, 0.0), (0.2, 0.0)], [(0.1, 0.0)], 1.0)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0], (0, 0))

    def test_out_of_gate_detections_remain_unmatched(self):
        self.assertEqual(greedy_assign([(0.0, 0.0)], [(5.0, 5.0)], 2.0), [])

    def test_ties_are_deterministic(self):
        self.assertEqual(greedy_assign([(0.0, 0.0)], [(1.0, 0.0), (-1.0, 0.0)], 1.0), [(0, 0)])

    def test_rejects_invalid_gate_and_coordinates(self):
        with self.assertRaises(ValueError):
            greedy_assign([(0.0, 0.0)], [(1.0, 0.0)], float("nan"))
        with self.assertRaises(ValueError):
            greedy_assign([(float("inf"), 0.0)], [], 1.0)


if __name__ == "__main__":
    unittest.main()
