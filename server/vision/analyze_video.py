#!/usr/bin/env python3
"""Research-only OpenCV semen-video screening.

The output is an auditable screening result, not a validated medical device.
Motion metrics are computed from centroid tracks. Morphology uses an explicit
heuristic contour classifier for head/neck/tail features; it must be verified by
a trained reviewer and is not a substitute for a validated Kruger workflow.
"""
import json
import math
import os
import sys

import cv2
import numpy as np


def fail(message):
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    raise SystemExit(0)


def component_mask(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)


def valid_components(gray):
    mask = component_mask(gray)
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    h, w = gray.shape
    min_area = max(4, int(w * h * 0.00001))
    max_area = max(min_area + 1, int(w * h * 0.02))
    components = []
    for i in range(1, count):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if min_area <= area <= max_area:
            x, y = centroids[i]
            x0, y0, width, height = int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP]), int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
            roi = mask[y0:y0 + height, x0:x0 + width]
            contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            contour = max(contours, key=cv2.contourArea) if contours else None
            contour_area = float(cv2.contourArea(contour)) if contour is not None else float(area)
            perimeter = float(cv2.arcLength(contour, True)) if contour is not None else 0.0
            hull_area = float(cv2.contourArea(cv2.convexHull(contour))) if contour is not None else contour_area
            circularity = (4 * math.pi * contour_area / (perimeter * perimeter)) if perimeter else 0.0
            solidity = contour_area / hull_area if hull_area else 0.0
            extent = contour_area / max(1.0, width * height)
            components.append({
                "point": (float(x), float(y)),
                "area": area,
                "width": width,
                "height": height,
                "aspect": max(width, height) / max(1, min(width, height)),
                "circularity": round(circularity, 3),
                "solidity": round(solidity, 3),
                "extent": round(extent, 3),
                "perimeter": round(perimeter, 2),
            })
    return components


def detect_centroids(gray):
    return [component["point"] for component in valid_components(gray)]


def morphology_from_components(components):
    normal_forms = round_heads = elongated_heads = irregular_heads = 0
    coiled_tails = bent_tails = double_tails = acrosome_abnormal = midpiece_defects = 0
    confidence_total = 0.0
    for component in components:
        aspect = component["aspect"]
        circularity = component["circularity"]
        solidity = component["solidity"]
        extent = component["extent"]
        tail_like = aspect >= 2.15 or (aspect >= 1.75 and extent <= 0.62)
        head_regular = circularity >= 0.48 and solidity >= 0.82 and aspect <= 1.85
        if head_regular and aspect <= 1.35:
            round_heads += 1
        elif head_regular:
            elongated_heads += 1
        else:
            irregular_heads += 1
        if not tail_like and head_regular:
            normal_forms += 1
        if tail_like:
            # These are morphology screening flags derived from shape geometry,
            # not claims of microscopic identification.
            curvature_proxy = component["perimeter"] / max(1.0, 2 * (component["width"] + component["height"]))
            if curvature_proxy >= 1.35:
                coiled_tails += 1
            elif solidity < 0.72 or extent < 0.42:
                double_tails += 1
            else:
                bent_tails += 1
            if aspect >= 2.8 or extent < 0.45:
                midpiece_defects += 1
        if circularity < 0.42 or solidity < 0.72:
            acrosome_abnormal += 1
        confidence_total += min(0.95, max(0.25, 0.45 * solidity + 0.35 * min(1.0, circularity) + 0.2 * min(1.0, extent * 2)))
    total = round_heads + elongated_heads + irregular_heads
    return {
        "totalExamined": total,
        "normalForms": normal_forms,
        "roundHeads": round_heads,
        "elongatedHeads": elongated_heads,
        "irregularHeads": irregular_heads,
        "coiledTails": coiled_tails,
        "bentTails": bent_tails,
        "doubleTails": double_tails,
        "acrosomeAbnormal": acrosome_abnormal,
        "midpieceDefects": midpiece_defects,
        "confidence": confidence_total / total if total else 0.0,
    }


def match_tracks(active, points, next_id):
    unmatched = set(range(len(points)))
    assignments = []
    for track_id, track in list(active.items()):
        if not points or not unmatched:
            continue
        best = min(unmatched, key=lambda i: math.dist(track["last"], points[i]))
        distance = math.dist(track["last"], points[best])
        if distance <= 32:
            assignments.append((track_id, points[best], distance))
            unmatched.remove(best)
    for track_id, point, distance in assignments:
        track = active[track_id]
        track["points"].append(point)
        track["last"] = point
        track["seen"] += 1
        track["distances"].append(distance)
    for i in unmatched:
        active[next_id] = {"points": [points[i]], "last": points[i], "seen": 1, "distances": []}
        next_id += 1
    return next_id


def line_distance(point, start, end):
    x, y = point
    x1, y1 = start
    x2, y2 = end
    denominator = math.hypot(y2 - y1, x2 - x1)
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / denominator if denominator else 0


def track_metrics(track, microns_per_pixel, fps):
    points = track["points"]
    sample_dt = 2 / fps if fps > 0 else 1 / 15
    elapsed = max(sample_dt * (len(points) - 1), sample_dt)
    displacement_px = math.dist(points[0], points[-1]) if len(points) > 1 else 0
    path_px = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
    smoothed = []
    for index in range(len(points)):
        window = points[max(0, index - 1): min(len(points), index + 2)]
        smoothed.append((sum(item[0] for item in window) / len(window), sum(item[1] for item in window) / len(window)))
    vap_px = sum(math.dist(a, b) for a, b in zip(smoothed, smoothed[1:]))
    vcl = path_px * microns_per_pixel / elapsed
    vsl = displacement_px * microns_per_pixel / elapsed
    vap = vap_px * microns_per_pixel / elapsed
    lateral = [line_distance(point, points[0], points[-1]) for point in points]
    alh = (float(np.sqrt(np.mean(np.square(lateral)))) * microns_per_pixel) if lateral else 0
    return {
        "vcl": vcl,
        "vsl": vsl,
        "vap": vap,
        "lin": vsl / vcl if vcl else 0,
        "str": vsl / vap if vap else 0,
        "wob": vap / vcl if vcl else 0,
        "alh": alh,
    }


def analyze(path, microns_per_pixel, chamber_depth):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        fail("تعذر فتح ملف الفيديو")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps > 0 else 0
    active = {}
    next_id = 1
    counts = []
    morphology_totals = {"totalExamined": 0, "normalForms": 0, "roundHeads": 0, "elongatedHeads": 0, "irregularHeads": 0, "coiledTails": 0, "bentTails": 0, "doubleTails": 0, "acrosomeAbnormal": 0, "midpieceDefects": 0, "confidence": 0.0}
    analysis_microns_per_pixel = microns_per_pixel
    processed = 0
    analyzed_source_frames = []
    max_source_frames = min(frame_count or 600, max(1, int((fps or 30) * 20)))
    sample_every = max(1, math.ceil((frame_count or max_source_frames) / 120))
    while processed < max_source_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if processed % sample_every == 0:
            scale = min(1.0, 640 / max(1, frame.shape[1]))
            if scale < 1.0:
                frame = cv2.resize(frame, (640, max(1, int(frame.shape[0] * scale))), interpolation=cv2.INTER_AREA)
                analysis_microns_per_pixel = microns_per_pixel / scale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            components = valid_components(gray)
            points = [component["point"] for component in components]
            next_id = match_tracks(active, points, next_id)
            counts.append(len(points))
            frame_morphology = morphology_from_components(components)
            for key in morphology_totals:
                morphology_totals[key] += frame_morphology[key]
            analyzed_source_frames.append(processed)
        processed += 1
    cap.release()
    if processed == 0 or width == 0 or height == 0:
        fail("الفيديو لا يحتوي على إطارات قابلة للقراءة")

    tracks = [track for track in active.values() if track["seen"] >= 3]
    effective_fps = fps / sample_every if fps > 0 else fps
    metrics = [track_metrics(track, analysis_microns_per_pixel, effective_fps) for track in tracks]
    moving = [track for track, metric in zip(tracks, metrics) if metric["vsl"] >= 1]
    progressive = [track for track, metric in zip(tracks, metrics) if metric["vsl"] >= 1.5 and metric["lin"] >= 0.45]
    avg_count = float(np.mean(counts)) if counts else 0.0
    count_cv = float(np.std(counts) / avg_count) if avg_count else 1.0
    volume_um3 = width * height * (microns_per_pixel ** 2) * chamber_depth
    volume_ml = volume_um3 / 1_000_000_000_000
    concentration = avg_count / volume_ml if volume_ml > 0 else 0.0
    analyzed_frames = len(counts)
    analyzed_duration = (analyzed_source_frames[-1] / fps) if analyzed_source_frames and fps > 0 else 0
    total_motility = (len(moving) / len(tracks) * 100) if tracks else 0.0
    progressive_motility = (len(progressive) / len(tracks) * 100) if tracks else 0.0
    non_progressive = max(0.0, total_motility - progressive_motility)
    immotile = max(0.0, 100.0 - total_motility)
    issues = []
    if duration < 12:
        issues.append("مدة الفيديو أقل من 12 ثانية.")
    if analyzed_frames < 12:
        issues.append("عدد الإطارات القابلة للتحليل منخفض.")
    if len(tracks) < 5:
        issues.append("عدد المسارات المكتشفة منخفض؛ راجع الإضاءة والتركيز.")
    if fps <= 0:
        issues.append("معدل الإطارات غير متاح؛ السرعات تقريبية.")
    if count_cv > 0.1:
        issues.append("معامل التباين في عدد الأجسام أعلى من 10%؛ راجع ثبات المجال والإضاءة.")
    if duration and analyzed_duration / duration < 0.75:
        issues.append("تم تحليل جزء من الفيديو فقط؛ استخدم فيديو أقصر أو دقة أقل لإكمال التغطية.")
    quality = max(0, min(100, 100 - len(issues) * 16 + min(12, len(tracks) // 5)))
    average_metric = lambda key: round(float(np.mean([metric[key] for metric in metrics])) if metrics else 0.0, 2)
    morphology_total = morphology_totals["totalExamined"]
    morphology_confidence = morphology_totals["confidence"] / max(1, len(counts))
    abnormal_forms = max(0, morphology_total - morphology_totals["normalForms"])
    defect_count = morphology_totals["irregularHeads"] + morphology_totals["coiledTails"] + morphology_totals["bentTails"] + morphology_totals["doubleTails"] + morphology_totals["acrosomeAbnormal"] + morphology_totals["midpieceDefects"]
    morphology = {
        "method": "opencv-heuristic-morphology-v1",
        "totalExamined": morphology_total,
        "normalForms": morphology_totals["normalForms"],
        "roundHeads": morphology_totals["roundHeads"],
        "elongatedHeads": morphology_totals["elongatedHeads"],
        "irregularHeads": morphology_totals["irregularHeads"],
        "coiledTails": morphology_totals["coiledTails"],
        "bentTails": morphology_totals["bentTails"],
        "doubleTails": morphology_totals["doubleTails"],
        "acrosomeAbnormal": morphology_totals["acrosomeAbnormal"],
        "midpieceDefects": morphology_totals["midpieceDefects"],
        "tzi": round(defect_count / max(1, abnormal_forms), 2),
        "sdi": round(defect_count / morphology_total, 3) if morphology_total else 0,
        "automaticConfidence": round(morphology_confidence, 2),
        "krugerScreening": {"normalPercent": round(morphology_totals["normalForms"] / morphology_total * 100, 2) if morphology_total else 0, "abnormalPercent": round(abnormal_forms / morphology_total * 100, 2) if morphology_total else 0, "thresholdPercent": 4.0, "status": "screening-only"},
        "automaticLimitations": ["التصنيف الحالي heuristic من شكل الكونتور ولا يساوي نموذجًا مدربًا أو اعتماد Kruger.", "الأكروسوم والقطعة الوسطى والذيل تُقدّر من هندسة الجسم المتصل وقد تتأثر بالإضاءة والتداخل.", "يجب اعتماد العدد النهائي بعد مراجعة صورة صبغة/تكبير مناسب بواسطة فني أو مشرف."],
    }
    return {
        "ok": True,
        "engine": "opencv-centroid-tracker",
        "engineVersion": "0.4.0-morphology-screening",
        "framesAnalyzed": analyzed_frames,
        "frameCount": frame_count,
        "fps": round(fps, 2),
        "width": width,
        "height": height,
        "durationSec": round(duration, 2),
        "analyzedDurationSec": round(analyzed_duration, 2),
        "coveragePct": round(min(100.0, (analyzed_duration / duration) * 100) if duration else 0, 1),
        "objectsDetected": len(tracks),
        "averageObjectsPerFrame": round(avg_count, 2),
        "concentration": round(concentration / 1_000_000, 2),
        "totalMotility": round(total_motility, 2),
        "progressiveMotility": round(progressive_motility, 2),
        "nonProgressiveMotility": round(non_progressive, 2),
        "immotile": round(immotile, 2),
        "confidence": round(max(0.25, min(0.95, quality / 100)), 2),
        "qualityScore": int(quality),
        "qualityIssues": issues,
        "coefficientOfVariation": round(count_cv, 3),
        "kinematics": {"vcl": average_metric("vcl"), "vsl": average_metric("vsl"), "vap": average_metric("vap"), "lin": average_metric("lin"), "str": average_metric("str"), "wob": average_metric("wob"), "alh": average_metric("alh"), "bcf": None},
        "morphology": morphology,
        "thresholds": {"minTrackPixels": 2, "maxMatchPixels": 32, "cvTarget": 0.1},
    }


def main():
    if len(sys.argv) < 4:
        fail("الاستخدام: analyze_video.py VIDEO MICRONS_PER_PIXEL CHAMBER_DEPTH")
    path = sys.argv[1]
    try:
        microns = float(sys.argv[2])
        depth = float(sys.argv[3])
    except ValueError:
        fail("قيم المعايرة غير صالحة")
    if microns <= 0 or depth <= 0 or not os.path.exists(path):
        fail("ملف الفيديو أو المعايرة غير صالحين")
    try:
        print(json.dumps(analyze(path, microns, depth), ensure_ascii=False))
    except Exception as exc:
        fail(f"فشل تحليل OpenCV: {exc}")


if __name__ == "__main__":
    main()
