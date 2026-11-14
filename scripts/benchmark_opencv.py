#!/usr/bin/env python3
"""Benchmark OpenCV semen-video screening against manually reviewed labels.

Usage:
  python3 scripts/benchmark_opencv.py VIDEOS_DIR GROUND_TRUTH_JSON OUTPUT_JSON [--csv-output OUTPUT.csv]

The script never fabricates labels. It runs the real vision engine for every
labelled video, reports scalar errors, morphology errors, binary defect
sensitivity/specificity, runtime, and failed samples.
"""
import argparse
import csv
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

SCALAR_METRICS = (
    "concentration", "totalMotility", "progressiveMotility", "nonProgressiveMotility", "immotile",
)
MORPHOLOGY_METRICS = (
    "totalExamined", "normalForms", "roundHeads", "elongatedHeads", "irregularHeads",
    "coiledTails", "bentTails", "doubleTails", "acrosomeAbnormal", "midpieceDefects",
    "tzi", "sdi",
)
VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm")


def flatten_actual(actual):
    values = {metric: actual.get(metric) for metric in SCALAR_METRICS}
    morphology = actual.get("morphology") or {}
    values.update({metric: morphology.get(metric) for metric in MORPHOLOGY_METRICS})
    return values


def locate_video(videos_dir, sample_id):
    for extension in VIDEO_EXTENSIONS:
        candidate = videos_dir / f"{sample_id}{extension}"
        if candidate.exists():
            return candidate
    return None


def run_engine(video, expected, python_bin):
    command = [python_bin, "-S", "server/vision/analyze_video.py", str(video), str(expected["micronsPerPixel"]), str(expected["chamberDepth"])]
    environment = {**os.environ, "PYTHONPATH": "/usr/lib/python3/dist-packages"}
    started = time.perf_counter()
    completed = subprocess.run(command, text=True, capture_output=True, env=environment)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown vision-engine error").strip()[-1000:]
        raise RuntimeError(detail)
    try:
        return json.loads(completed.stdout), elapsed_ms
    except json.JSONDecodeError as error:
        raise RuntimeError(f"invalid JSON from vision engine: {error}") from error


def summarize_errors(rows, metrics):
    summary = {}
    for metric in metrics:
        errors = [row["errors"][metric] for row in rows if metric in row.get("errors", {})]
        if not errors:
            continue
        summary[metric] = {
            "n": len(errors),
            "mae": round(sum(abs(error) for error in errors) / len(errors), 4),
            "rmse": round(math.sqrt(sum(error * error for error in errors) / len(errors)), 4),
            "bias": round(sum(errors) / len(errors), 4),
        }
    return summary


def summarize_binary_defects(rows, metrics):
    output = {}
    for metric in metrics:
        pairs = []
        for row in rows:
            expected = row.get("expectedValues", {}).get(metric)
            actual = row.get("actualValues", {}).get(metric)
            if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
                pairs.append((expected > 0, actual > 0))
        if not pairs:
            continue
        tp = sum(expected and actual for expected, actual in pairs)
        tn = sum(not expected and not actual for expected, actual in pairs)
        fp = sum(not expected and actual for expected, actual in pairs)
        fn = sum(expected and not actual for expected, actual in pairs)
        output[metric] = {
            "n": len(pairs), "tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "sensitivity": round(tp / (tp + fn), 4) if tp + fn else None,
            "specificity": round(tn / (tn + fp), 4) if tn + fp else None,
        }
    return output


def write_csv(path, rows, metrics):
    fields = ["sampleId", "video", "status", "runtimeMs", "errorMessage"]
    fields += [f"expected.{metric}" for metric in metrics]
    fields += [f"actual.{metric}" for metric in metrics]
    fields += [f"error.{metric}" for metric in metrics]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            output = {key: row.get(key, "") for key in ("sampleId", "video", "status", "runtimeMs", "errorMessage")}
            for metric in metrics:
                output[f"expected.{metric}"] = row.get("expectedValues", {}).get(metric, "")
                output[f"actual.{metric}"] = row.get("actualValues", {}).get(metric, "")
                output[f"error.{metric}"] = row.get("errors", {}).get(metric, "")
            writer.writerow(output)


def main():
    parser = argparse.ArgumentParser(description="Benchmark OpenCV output against manually reviewed semen-video labels")
    parser.add_argument("videos_dir", type=Path)
    parser.add_argument("ground_truth_json", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--csv-output", type=Path, help="also write a row-level CSV report")
    parser.add_argument("--python", default="/usr/bin/python3", help="Python executable used for OpenCV")
    parser.add_argument("--fail-on-error", action="store_true", help="return exit code 2 when one or more videos fail")
    args = parser.parse_args()

    truth = json.loads(args.ground_truth_json.read_text(encoding="utf-8"))
    if not isinstance(truth, dict) or not truth:
        raise SystemExit("ground truth is empty; provide real manually-reviewed samples")

    metrics = list(SCALAR_METRICS) + list(MORPHOLOGY_METRICS)
    rows = []
    for sample_id, expected in truth.items():
        video = locate_video(args.videos_dir, sample_id)
        row = {"sampleId": sample_id, "video": str(video) if video else "", "expectedValues": {}, "actualValues": {}, "errors": {}}
        if video is None:
            row.update(status="failed", runtimeMs=None, errorMessage="missing video for labelled sample")
            rows.append(row)
            continue
        try:
            actual, runtime_ms = run_engine(video, expected, args.python)
            actual_values = flatten_actual(actual)
            expected_values = {}
            for metric in metrics:
                value = expected.get(metric)
                if value is None and isinstance(expected.get("morphology"), dict):
                    value = expected["morphology"].get(metric)
                if isinstance(value, (int, float)) and math.isfinite(float(value)):
                    expected_values[metric] = float(value)
            for metric, expected_value in expected_values.items():
                actual_value = actual_values.get(metric)
                if isinstance(actual_value, (int, float)) and math.isfinite(float(actual_value)):
                    row["actualValues"][metric] = float(actual_value)
                    row["errors"][metric] = round(float(actual_value) - expected_value, 6)
            row.update(status="completed", runtimeMs=runtime_ms, engineVersion=actual.get("engineVersion"))
            row["expectedValues"] = expected_values
        except Exception as error:
            row.update(status="failed", runtimeMs=None, errorMessage=str(error))
        rows.append(row)

    completed_rows = [row for row in rows if row["status"] == "completed"]
    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sampleCount": len(rows),
        "completedCount": len(completed_rows),
        "failedCount": len(rows) - len(completed_rows),
        "scalarSummary": summarize_errors(completed_rows, SCALAR_METRICS),
        "morphologySummary": summarize_errors(completed_rows, MORPHOLOGY_METRICS),
        "defectDetection": summarize_binary_defects(completed_rows, ("coiledTails", "bentTails", "doubleTails", "acrosomeAbnormal", "midpieceDefects")),
        "results": rows,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.csv_output:
        write_csv(args.csv_output, rows, metrics)
    print(json.dumps({key: output[key] for key in ("sampleCount", "completedCount", "failedCount", "scalarSummary", "morphologySummary", "defectDetection")}, ensure_ascii=False, indent=2))
    if args.fail_on_error and output["failedCount"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
