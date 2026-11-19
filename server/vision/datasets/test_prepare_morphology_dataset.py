import json, tempfile, unittest
from pathlib import Path
from prepare_morphology_dataset import prepare, sample_split, valid_polygon


class MorphologyDatasetTests(unittest.TestCase):
    def test_sample_split_is_deterministic(self):
        self.assertEqual(sample_split("SAMPLE-1"), sample_split("SAMPLE-1"))

    def test_polygon_validation(self):
        self.assertTrue(valid_polygon({"region":"head","points_normalized":[{"x":0,"y":0},{"x":1,"y":0},{"x":0.5,"y":1}]}))
        self.assertFalse(valid_polygon({"region":"head","points_normalized":[{"x":2,"y":0},{"x":1,"y":0},{"x":0,"y":1}]}))

    def _write_manifest(self, root, obj):
        (root / "images").mkdir(exist_ok=True)
        (root / "images" / "one.jpg").write_bytes(b"test-image")
        manifest = {"images":[
            {"sample_id":"S1","image_path":"images/one.jpg","preparation":"stained","pixel_size_um":0.25,
             "adjudication_status":"adjudicated","objects":[obj]}
        ]}
        path = root / "morphology-dataset-manifest.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return path

    def _base_object(self):
        polygon = [{"x":0.1,"y":0.1},{"x":0.2,"y":0.1},{"x":0.15,"y":0.2}]
        labels = {"head_shape":"normal","tail_status":"normal","overlap":False,"debris":False}
        return {
            "object_id":"O1","reviewer_id":"A","labels":labels,
            "second_review":{"reviewer_id":"B","labels":dict(labels)},
            "masks":[{"region":"head","points_normalized":polygon}]
        }

    def test_prepare_requires_adjudication_and_calibration(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = self._write_manifest(root, self._base_object())
            report = prepare(path, root / "out")
            self.assertEqual(sum(report["eligible_images"].values()), 1)
            self.assertEqual(report["eligible_objects_total"], 1)
            self.assertTrue((root / "out" / "dataset.yaml").is_file())

    def test_disagreement_is_excluded_without_third_expert(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            obj = self._base_object()
            obj["second_review"]["labels"]["head_shape"] = "round"
            path = self._write_manifest(root, obj)
            report = prepare(path, root / "out")
            self.assertEqual(sum(report["eligible_images"].values()), 0)
            self.assertEqual(report["eligible_objects_total"], 0)

    def test_disagreement_uses_documented_third_expert_masks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            obj = self._base_object()
            obj["second_review"]["labels"]["head_shape"] = "round"
            polygon = [{"x":0.3,"y":0.3},{"x":0.4,"y":0.3},{"x":0.35,"y":0.4}]
            obj["adjudication"] = {
                "reviewer_id":"C","note":"Expert review completed",
                "labels":{"head_shape":"normal","tail_status":"normal","overlap":False,"debris":False},
                "masks":[{"region":"head","points_normalized":polygon}]
            }
            path = self._write_manifest(root, obj)
            report = prepare(path, root / "out")
            self.assertEqual(sum(report["eligible_images"].values()), 1)
            label_files = list((root / "out" / "labels").rglob("*.txt"))
            self.assertEqual(len(label_files), 1)
            self.assertIn("0.300000 0.300000", label_files[0].read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
