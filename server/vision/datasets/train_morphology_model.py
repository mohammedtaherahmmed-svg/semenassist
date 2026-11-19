#!/usr/bin/env python3
"""Research-only YOLO-seg training with a held-out sample-level test evaluation."""
from __future__ import annotations
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path, help="dataset.yaml created by prepare_morphology_dataset.py")
    parser.add_argument("--weights", default="yolo11n-seg.pt")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    args = parser.parse_args()
    if not args.data.is_file():
        raise SystemExit(f"Dataset config not found: {args.data}")
    config = args.data.read_text(encoding="utf-8")
    if "test:" not in config:
        raise SystemExit("Dataset config must define a held-out test split. No training or evaluation was started.")
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("Training dependency missing. In a dedicated research environment run: pip install ultralytics") from exc

    model = YOLO(args.weights)
    train_result = model.train(data=str(args.data), epochs=args.epochs, imgsz=args.imgsz, device=args.device, task="segment")
    # Evaluate only after training, using the sample-level held-out test split.
    test_result = model.val(data=str(args.data), split="test", imgsz=args.imgsz, device=args.device, plots=True)
    save_dir = Path(getattr(test_result, "save_dir", getattr(train_result, "save_dir", args.data.parent)))
    metrics = getattr(test_result, "results_dict", {})
    report = {
        "evaluation_type": "research_only_held_out_test_split",
        "test_metrics": {str(key): float(value) for key, value in metrics.items() if isinstance(value, (int, float))},
        "training_epochs": args.epochs,
        "image_size": args.imgsz,
        "weights_initial": args.weights,
        "test_split": "test",
        "clinical_validation": "not_performed",
        "clinical_use": "not_approved",
        "warning": "This evaluation is not clinical validation and does not establish diagnostic performance."
    }
    report_path = save_dir / "research_test_evaluation.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Research-only held-out test evaluation saved to: {report_path}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
