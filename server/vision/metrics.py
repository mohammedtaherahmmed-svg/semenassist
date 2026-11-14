"""Pure kinematic calculations for sampled video tracks."""
from __future__ import annotations

import math
from typing import Sequence


def track_metrics(points: Sequence[tuple[float, float]], frame_indices: Sequence[int], microns_per_pixel: float, source_fps: float) -> dict[str, float]:
    """Calculate track velocities using source-frame timestamps, including skipped frames."""
    if len(points) != len(frame_indices) or len(points) < 2:
        raise ValueError("A track needs at least two points with matching frame indices")
    if not math.isfinite(microns_per_pixel) or microns_per_pixel <= 0:
        raise ValueError("microns_per_pixel must be finite and positive")
    if not math.isfinite(source_fps) or source_fps <= 0:
        raise ValueError("source_fps must be finite and positive")
    if any(b <= a for a, b in zip(frame_indices, frame_indices[1:])):
        raise ValueError("frame indices must be strictly increasing")

    elapsed = (frame_indices[-1] - frame_indices[0]) / source_fps
    if elapsed <= 0:
        raise ValueError("track elapsed time must be positive")
    displacement = math.dist(points[0], points[-1])
    path = sum(math.dist(a, b) for a, b in zip(points, points[1:]))

    # Preserve endpoints and smooth only interior positions.
    smoothed = list(points)
    for index in range(1, len(points) - 1):
        window = points[index - 1:index + 2]
        smoothed[index] = (sum(p[0] for p in window) / 3, sum(p[1] for p in window) / 3)
    average_path = sum(math.dist(a, b) for a, b in zip(smoothed, smoothed[1:]))

    vcl = path * microns_per_pixel / elapsed
    vsl = displacement * microns_per_pixel / elapsed
    vap = average_path * microns_per_pixel / elapsed
    start, end = points[0], points[-1]
    denominator = math.hypot(end[1] - start[1], end[0] - start[0])
    lateral = [
        abs((end[1] - start[1]) * x - (end[0] - start[0]) * y + end[0] * start[1] - end[1] * start[0]) / denominator
        if denominator else 0.0
        for x, y in points
    ]
    alh = math.sqrt(sum(value * value for value in lateral) / len(lateral)) * microns_per_pixel

    return {
        "vcl": vcl, "vsl": vsl, "vap": vap,
        "lin": vsl / vcl if vcl else 0.0,
        "str": vsl / vap if vap else 0.0,
        "wob": vap / vcl if vcl else 0.0,
        "alh": alh,
    }
