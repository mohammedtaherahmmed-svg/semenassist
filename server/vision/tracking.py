"""Deterministic one-to-one assignment for sampled-object tracking."""
from __future__ import annotations

import math
from typing import Sequence


def greedy_assign(
    track_positions: Sequence[tuple[float, float]],
    detections: Sequence[tuple[float, float]],
    max_distance: float,
) -> list[tuple[int, int]]:
    """Return deterministic one-to-one (track, detection) matches by global distance.

    This is a lightweight baseline, not a motion model or an optimal Hungarian
    assignment. Candidate pairs are globally sorted so input track ordering does
    not give an early track priority over a closer match.
    """
    if not math.isfinite(max_distance) or max_distance < 0:
        raise ValueError("max_distance must be finite and non-negative")
    if any(not all(math.isfinite(v) for v in point) for point in (*track_positions, *detections)):
        raise ValueError("coordinates must be finite")

    candidates = []
    for track_index, position in enumerate(track_positions):
        for detection_index, detection in enumerate(detections):
            distance = math.dist(position, detection)
            if distance <= max_distance:
                candidates.append((distance, track_index, detection_index))

    candidates.sort(key=lambda item: (item[0], item[1], item[2]))
    used_tracks: set[int] = set()
    used_detections: set[int] = set()
    matches = []
    for _, track_index, detection_index in candidates:
        if track_index in used_tracks or detection_index in used_detections:
            continue
        used_tracks.add(track_index)
        used_detections.add(detection_index)
        matches.append((track_index, detection_index))
    return matches
