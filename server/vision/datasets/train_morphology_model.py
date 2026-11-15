#!/usr/bin/env python3
"""Optional YOLO-seg training entry point; requires an externally installed Ultralytics package."""
from __future__ import annotations
import argparse
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
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("Training dependency missing. In a dedicated research environment run: pip install ultralytics") from exc
    model = YOLO(args.weights)
    result = model.train(data=str(args.data), epochs=args.epochs, imgsz=args.imgsz, device=args.device, task="segment")
    print("Research model training completed. Evaluate on a held-out sample-level test set before any claims.")
    print(result)


if __name__ == "__main__":
    main()
