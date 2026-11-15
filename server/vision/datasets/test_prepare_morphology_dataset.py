import json, tempfile, unittest
from pathlib import Path
from prepare_morphology_dataset import prepare, sample_split, valid_polygon


class MorphologyDatasetTests(unittest.TestCase):
    def test_sample_split_is_deterministic(self):
        self.assertEqual(sample_split("SAMPLE-1"), sample_split("SAMPLE-1"))

    def test_polygon_validation(self):
        self.assertTrue(valid_polygon({"region":"head","points_normalized":[{"x":0,"y":0},{"x":1,"y":0},{"x":0.5,"y":1}]}))
        self.assertFalse(valid_polygon({"region":"head","points_normalized":[{"x":2,"y":0},{"x":1,"y":0},{"x":0,"y":1}]}))

    def test_prepare_requires_adjudication_and_calibration(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "images").mkdir()
            (root / "images" / "one.jpg").write_bytes(b"test-image")
            manifest = {"images":[
                {"sample_id":"S1","image_path":"images/one.jpg","preparation":"stained","pixel_size_um":0.25,
                 "adjudication_status":"adjudicated","objects":[
                    {"object_id":"O1","reviewer_id":"A","labels":{"head_shape":"normal","tail_status":"normal","overlap":False,"debris":False},
                     "second_review":{"reviewer_id":"B","labels":{"head_shape":"normal","tail_status":"normal","overlap":False,"debris":False}},
                     "masks":[{"region":"head","points_normalized":[{"x":0.1,"y":0.1},{"x":0.2,"y":0.1},{"x":0.15,"y":0.2}]}]}
                 ]}
            ]}
            manifest_path = root / "morphology-dataset-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            report = prepare(manifest_path, root / "out")
            self.assertEqual(sum(report["eligible_images"].values()), 1)
            self.assertTrue((root / "out" / "dataset.yaml").is_file())


if __name__ == "__main__":
    unittest.main()
