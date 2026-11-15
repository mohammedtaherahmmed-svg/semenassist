#!/usr/bin/env python3
"""Compare OpenCV track observations with frame-level CSV ground truth.

Research/engineering benchmark only. This runs the Python OpenCV pipeline, not
the Android Kotlin module; Android results require an exported track-observation
file from the device before they can be scored with the same evaluator.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

from metrics import track_metrics
from tracking import hungarian_assign


def _maximum_overlap(overlap: dict[tuple[int, int], int], predicted_ids: list[int], truth_ids: list[int]) -> int:
    """Exact maximum one-to-one identity overlap using a bitmask DP."""
    truth_index = {identity: index for index, identity in enumerate(truth_ids)}
    dp = {0: 0}
    for predicted_id in predicted_ids:
        next_dp = dict(dp)  # This predicted identity may remain unmatched.
        for mask, score in dp.items():
            for truth_id in truth_ids:
                bit = 1 << truth_index[truth_id]
                if mask & bit:
                    continue
                candidate = score + overlap.get((truth_id, predicted_id), 0)
                new_mask = mask | bit
                next_dp[new_mask] = max(next_dp.get(new_mask, 0), candidate)
        dp = next_dp
    return max(dp.values(), default=0)


def evaluate_tracking(ground_truth: list[dict], predictions: list[dict], tolerance_px: float = 12.0) -> dict:
    """Frame-wise gated assignment plus global IDF1 and per-cell velocity error."""
    if tolerance_px <= 0:
        raise ValueError("tolerance_px must be positive")
    gt_by_frame: dict[int, list[dict]] = defaultdict(list)
    pred_by_frame: dict[int, list[dict]] = defaultdict(list)
    gt_by_identity = {}
    for row in ground_truth:
        frame, identity = int(row["frame"]), int(row["cell_id"])
        normalized = {"frame": frame, "cell_id": identity, "x_px": float(row["x_px"]), "y_px": float(row["y_px"])}
        gt_by_frame[frame].append(normalized)
        gt_by_identity[(frame, identity)] = normalized
    for row in predictions:
        frame = int(row["frame"])
        pred_by_frame[frame].append({
            "frame": frame, "track_id": int(row["track_id"]),
            "x_px": float(row["x_px"]), "y_px": float(row["y_px"]),
        })

    matched = 0
    localization_errors = []
    gt_total = pred_total = 0
    overlap: dict[tuple[int, int], int] = defaultdict(int)
    identity_history: dict[int, list[tuple[int, int]]] = defaultdict(list)
    matched_points: dict[int, list[tuple[int, int, float, float, float, float]]] = defaultdict(list)
    for frame in sorted(set(gt_by_frame) | set(pred_by_frame)):
        truth, predicted = gt_by_frame[frame], pred_by_frame[frame]
        gt_total += len(truth)
        pred_total += len(predicted)
        pairs = hungarian_assign(
            [(item["x_px"], item["y_px"]) for item in truth],
            [(item["x_px"], item["y_px"]) for item in predicted],
            tolerance_px,
        )
        matched += len(pairs)
        for truth_index, pred_index in pairs:
            gt, pred = truth[truth_index], predicted[pred_index]
            localization_errors.append(((gt["x_px"] - pred["x_px"]) ** 2 + (gt["y_px"] - pred["y_px"]) ** 2) ** 0.5)
            overlap[(gt["cell_id"], pred["track_id"])] += 1
            identity_history[gt["cell_id"]].append((frame, pred["track_id"]))
            matched_points[gt["cell_id"]].append((
                frame, pred["track_id"], gt["x_px"], gt["y_px"], pred["x_px"], pred["y_px"]
            ))

    switches = 0
    for observations in identity_history.values():
        ordered = sorted(observations)
        switches += sum(a[1] != b[1] for a, b in zip(ordered, ordered[1:]))

    gt_ids = sorted({int(row["cell_id"]) for row in ground_truth})
    pred_ids = sorted({int(row["track_id"]) for row in predictions})
    id_true_positive = _maximum_overlap(overlap, pred_ids, gt_ids)
    id_false_positive = pred_total - id_true_positive
    id_false_negative = gt_total - id_true_positive
    idf1_denominator = 2 * id_true_positive + id_false_positive + id_false_negative
    idf1 = 2 * id_true_positive / idf1_denominator if idf1_denominator else 0.0

    fragmentation = 0
    for cell_id in gt_ids:
        matched_frames = {frame for frame, _ in identity_history.get(cell_id, [])}
        ordered_gt_frames = sorted(frame for frame, rows in gt_by_frame.items() if any(row["cell_id"] == cell_id for row in rows))
        seen_match = False
        previous_matched = False
        for frame in ordered_gt_frames:
            is_matched = frame in matched_frames
            if is_matched and seen_match and not previous_matched:
                fragmentation += 1
            if is_matched:
                seen_match = True
            previous_matched = is_matched

    per_cell = []
    velocity_errors = defaultdict(list)
    for cell_id in gt_ids:
        rows = sorted(matched_points.get(cell_id, []))
        observed_track_ids = {row[1] for row in rows}
        if len(rows) < 2 or len(observed_track_ids) != 1:
            per_cell.append({"cell_id": cell_id, "matched_frames": len(rows), "stable_identity": len(observed_track_ids) == 1, "kinematics": None})
            continue
        frames = [row[0] for row in rows]
        truth_points = [(row[2], row[3]) for row in rows]
        predicted_points = [(row[4], row[5]) for row in rows]
        truth_metrics = track_metrics(truth_points, frames, 0.5, 50.0)
        predicted_metrics = track_metrics(predicted_points, frames, 0.5, 50.0)
        errors = {}
        for key in ("vcl", "vsl", "vap", "lin"):
            error = abs(predicted_metrics[key] - truth_metrics[key])
            errors[key] = error
            velocity_errors[key].append(error)
        per_cell.append({
            "cell_id": cell_id,
            "matched_frames": len(rows),
            "stable_identity": True,
            "kinematics": {
                "ground_truth": truth_metrics,
                "predicted": predicted_metrics,
                "absolute_error": errors,
            },
        })

    return {
        "frames_compared": len(set(gt_by_frame) | set(pred_by_frame)),
        "ground_truth_detections": gt_total,
        "predicted_detections": pred_total,
        "matched_detections": matched,
        "precision": matched / pred_total if pred_total else 0.0,
        "recall": matched / gt_total if gt_total else 0.0,
        "id_switches": switches,
        "idf1": idf1,
        "fragmentation": fragmentation,
        "mean_localization_error_px": sum(localization_errors) / len(localization_errors) if localization_errors else None,
        "mean_absolute_velocity_error": {
            key: sum(values) / len(values) if values else None
            for key, values in velocity_errors.items()
        },
        "per_cell": per_cell,
    }


def load_predictions(path: Path, ground_truth: list[dict], ground_truth_fps: float) -> list[dict]:
    """Load either Python observations or Android-exported trackObservations JSON."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("trackObservations", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("Prediction JSON must be a list or contain trackObservations")
    gt_times = []
    for row in ground_truth:
        frame = int(row["frame"])
        time_sec = float(row.get("time_sec") or frame / ground_truth_fps)
        gt_times.append((time_sec, frame))
    normalized = []
    for row in rows:
        time_sec = row.get("timeSec", row.get("time_sec"))
        if time_sec is not None and gt_times:
            nearest_time, nearest_frame = min(gt_times, key=lambda item: abs(item[0] - float(time_sec)))
            if abs(nearest_time - float(time_sec)) > 0.5 / ground_truth_fps:
                continue
            frame = nearest_frame
        else:
            frame = int(row.get("frame", row.get("sampleSlot", 0)))
        normalized.append({
            "frame": frame,
            "track_id": int(row.get("track_id", row.get("trackId"))),
            "x_px": float(row.get("x_px", row.get("xPx"))),
            "y_px": float(row.get("y_px", row.get("yPx"))),
        })
    return normalized


def load_ground_truth(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    required = {"frame", "cell_id", "x_px", "y_px"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"Ground-truth CSV must contain columns: {', '.join(sorted(required))}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("ground_truth_csv", type=Path)
    parser.add_argument("--microns-per-pixel", type=float, default=0.5)
    parser.add_argument("--chamber-depth", type=float, default=20.0)
    parser.add_argument("--tolerance-px", type=float, default=12.0)
    parser.add_argument("--ground-truth-fps", type=float, default=50.0)
    parser.add_argument("--predictions-json", type=Path, help="Optional exported Android/Python trackObservations JSON")
    parser.add_argument("--output", type=Path, default=Path("ground-truth-benchmark.json"))
    args = parser.parse_args()

    from analyze_video import analyze  # Keep metric unit tests independent of OpenCV.

    truth = load_ground_truth(args.ground_truth_csv)
    analysis = analyze(str(args.video), args.microns_per_pixel, args.chamber_depth, include_tracks=True)
    predictions = load_predictions(args.predictions_json, truth, args.ground_truth_fps) if args.predictions_json else analysis["trackObservations"]
    evaluation = evaluate_tracking(truth, predictions, args.tolerance_px)
    report = {
        "benchmark": "SemenAssist synthetic CASA ground-truth comparison",
        "scope": "Python OpenCV or supplied Android track export, depending on --predictions-json",
        "synthetic_ground_truth": True,
        "clinical_validity": False,
        "prediction_source": "android-export" if args.predictions_json else "python-opencv",
        "analysis_metadata": {
            key: analysis.get(key) for key in (
                "engineVersion", "frameCount", "fps", "framesAnalyzed",
                "durationSec", "analyzedDurationSec", "width", "height", "kinematics"
            )
        },
        "evaluation": evaluation,
    }
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
