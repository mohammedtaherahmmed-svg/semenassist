import unittest
from concentration import concentration_million_per_ml


class ConcentrationTests(unittest.TestCase):
    def test_known_volume_and_dilution(self):
        # 1 mm² × 20 µm = 20 nL = 2e-5 mL; 100 cells -> 5 million/mL.
        self.assertAlmostEqual(concentration_million_per_ml(100, 1, 20, 1), 5.0)
        self.assertAlmostEqual(concentration_million_per_ml(100, 1, 20, 2), 10.0)

    def test_invalid_geometry_is_rejected(self):
        for area, depth, dilution in ((0, 20, 1), (1, 0, 1), (1, 20, 0)):
            with self.assertRaises(ValueError):
                concentration_million_per_ml(100, area, depth, dilution)


if __name__ == "__main__":
    unittest.main()
