#!/usr/bin/env python3
"""Prepare expert-reviewed morphology polygons for YOLO-seg training.

Input: app-exported morphology-dataset-manifest.json and a sibling images/ directory.
Only adjudicated, two-reviewer-consistent objects with valid masks are eligible.
Splits are deterministic and grouped by pseudonymous sample_id to prevent leakage.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil
from pathlib import Path

REGION_CLASS = {"head": 0, "midpiece": 1, "tail": 2}
CLASS_NAMES = ["head", "midpiece", "tail"]


def sample_split(sample_id: str) -> str:
    value = int(hashlib.sha256(sample_id.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return "train" if value < 0.70 else "validation" if value < 0.85 else "test"


def labels_match(primary: dict, secondary: dict) -> bool:
    return all(primary.get(key) == secondary.get(key) for key in ("head_shape", "tail_status", "overlap", "debris"))

def labels_disagree(primary: dict, secondary: dict) -> bool:
    return not labels_match(primary, secondary)


def valid_polygon(mask: dict) -> bool:
    points = mask.get("points_normalized")
    return (
        mask.get("region") in REGION_CLASS
        and isinstance(points, list) and len(points) >= 3
        and all(isinstance(p, dict) and isinstance(p.get("x"), (int, float))
                and isinstance(p.get("y"), (int, float))
                and 0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in points)
    )


def prepare(manifest_path: Path, output_dir: Path) -> dict:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    images = payload.get("images")
    if not isinstance(images, list):
        raise ValueError("Manifest must contain an images array.")
    root = manifest_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    copied = {"train": 0, "validation": 0, "test": 0}
    eligible_object_count = 0
    skipped = []
    sample_assignments = {}
    for index, item in enumerate(images):
        sample_id = str(item.get("sample_id", "")).strip()
        image_rel = str(item.get("image_path", "")).strip()
        if not sample_id or not image_rel:
            skipped.append({"index": index, "reason": "missing sample_id or image_path"})
            continue
        split = sample_assignments.setdefault(sample_id, sample_split(sample_id))
        source = (root / image_rel).resolve()
        if not source.is_file() or root.resolve() not in source.parents:
            skipped.append({"sample_id": sample_id, "reason": "image file missing or outside manifest directory"})
            continue
        if item.get("adjudication_status") != "adjudicated":
            skipped.append({"sample_id": sample_id, "reason": "image is not adjudicated"})
            continue
        if not item.get("pixel_size_um") or item["pixel_size_um"] <= 0:
            skipped.append({"sample_id": sample_id, "reason": "missing calibrated pixel_size_um"})
            continue
        yolo_lines = []
        eligible_objects = 0
        for obj in item.get("objects", []):
            primary = obj.get("labels", {})
            second = obj.get("second_review")
            if not second or not second.get("reviewer_id") or second["reviewer_id"] == obj.get("reviewer_id"):
                continue
            secondary = second.get("labels", {})
            adjudication = obj.get("adjudication")
            has_disagreement = labels_disagree(primary, secondary)
            # Never resolve disagreements by silently preferring reviewer one's labels.
            if has_disagreement:
                if not adjudication or not adjudication.get("reviewer_id") or adjudication["reviewer_id"] in {obj.get("reviewer_id"), second.get("reviewer_id")}:
                    continue
                if len(str(adjudication.get("note", "")).strip()) < 5:
                    continue
                masks = adjudication.get("masks", [])
            else:
                masks = obj.get("masks", [])
            valid_object_masks = [mask for mask in masks if valid_polygon(mask)]
            if not valid_object_masks:
                continue
            eligible_objects += 1
            for mask in valid_object_masks:
                coords = " ".join(f"{p['x']:.6f} {p['y']:.6f}" for p in mask["points_normalized"])
                yolo_lines.append(f"{REGION_CLASS[mask['region']]} {coords}")
        if not yolo_lines:
            skipped.append({"sample_id": sample_id, "reason": "no valid masks with two independent reviews and required third-expert adjudication"})
            continue
        eligible_object_count += eligible_objects
        image_name = f"{sample_id}_{source.name}".replace("/", "_")
        image_out = output_dir / "images" / split / image_name
        label_out = output_dir / "labels" / split / (Path(image_name).stem + ".txt")
        image_out.parent.mkdir(parents=True, exist_ok=True)
        label_out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, image_out)
        label_out.write_text("\n".join(yolo_lines) + "\n", encoding="utf-8")
        copied[split] += 1
    (output_dir / "dataset.yaml").write_text(
        "path: .\ntrain: images/train\nval: images/validation\ntest: images/test\n"
        "names:\n  0: head\n  1: midpiece\n  2: tail\n",
        encoding="utf-8",
    )
    report = {
        "dataset_type": "research_only_yolo_segmentation",
        "source_manifest": str(manifest_path),
        "split_policy": "sha256(sample_id), grouped by sample_id",
        "sample_splits": sample_assignments,
        "eligible_images": copied,
        "eligible_objects_total": eligible_object_count,
        "skipped": skipped,
        "training_ready": sum(copied.values()) > 0 and all(copied.values()),
        "clinical_validation": "not_performed",
    }
    (output_dir / "preparation_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = prepare(args.manifest, args.output)
    print(json.dumps(report, indent=2))
    if not report["training_ready"]:
        raise SystemExit("Train/validation/test must each contain at least one eligible image from sample-grouped splits. Review the preparation report; no model was trained.")


if __name__ == "__main__":
    main()
