"""Constant-velocity Kalman prediction and gated Hungarian assignment."""
from __future__ import annotations

import math
from typing import Sequence


class KalmanCV2D:
    """Two independent 1-D constant-velocity Kalman filters for x and y."""

    def __init__(self, point: tuple[float, float], measurement_noise: float = 4.0, process_noise: float = 0.05):
        if not all(math.isfinite(v) for v in point):
            raise ValueError("coordinates must be finite")
        self.state = [[float(point[0]), 0.0], [float(point[1]), 0.0]]
        self.cov = [[[25.0, 0.0], [0.0, 25.0]], [[25.0, 0.0], [0.0, 25.0]]]
        self.r = measurement_noise
        self.q = process_noise

    @property
    def position(self) -> tuple[float, float]:
        return self.state[0][0], self.state[1][0]

    def predict(self, dt: float = 1.0) -> tuple[float, float]:
        if not math.isfinite(dt) or dt <= 0:
            raise ValueError("dt must be finite and positive")
        for axis in range(2):
            pos, vel = self.state[axis]
            p = self.cov[axis]
            dt2, dt3, dt4 = dt * dt, dt ** 3, dt ** 4
            self.state[axis] = [pos + dt * vel, vel]
            self.cov[axis] = [
                [p[0][0] + dt * (p[1][0] + p[0][1]) + dt2 * p[1][1] + self.q * dt4 / 4,
                 p[0][1] + dt * p[1][1] + self.q * dt3 / 2],
                [p[1][0] + dt * p[1][1] + self.q * dt3 / 2,
                 p[1][1] + self.q * dt2],
            ]
        return self.position

    def update(self, measurement: tuple[float, float]) -> None:
        if not all(math.isfinite(v) for v in measurement):
            raise ValueError("coordinates must be finite")
        for axis in range(2):
            p = self.cov[axis]
            innovation = float(measurement[axis]) - self.state[axis][0]
            s = p[0][0] + self.r
            k0, k1 = p[0][0] / s, p[1][0] / s
            self.state[axis][0] += k0 * innovation
            self.state[axis][1] += k1 * innovation
            self.cov[axis] = [
                [(1 - k0) * p[0][0], (1 - k0) * p[0][1]],
                [p[1][0] - k1 * p[0][0], p[1][1] - k1 * p[0][1]],
            ]


def hungarian_assign(
    track_positions: Sequence[tuple[float, float]],
    detections: Sequence[tuple[float, float]],
    max_distance: float,
) -> list[tuple[int, int]]:
    """Minimum-cost one-to-one assignment with explicit unmatched penalties."""
    if not math.isfinite(max_distance) or max_distance < 0:
        raise ValueError("max_distance must be finite and non-negative")
    if any(not all(math.isfinite(v) for v in point) for point in (*track_positions, *detections)):
        raise ValueError("coordinates must be finite")
    n, m = len(track_positions), len(detections)
    if not n or not m:
        return []
    size = n + m
    unmatched = max_distance + 1.0
    invalid = unmatched * (size + 2) * 1_000_000
    costs = [[0.0] * size for _ in range(size)]
    for i, position in enumerate(track_positions):
        for j, detection in enumerate(detections):
            distance = math.dist(position, detection)
            costs[i][j] = distance if distance <= max_distance else invalid
        for j in range(m, size):
            costs[i][j] = unmatched
    for i in range(n, size):
        for j in range(m):
            costs[i][j] = unmatched
        for j in range(m, size):
            costs[i][j] = 0.0

    # Hungarian shortest augmenting path algorithm (square matrix).
    u, v = [0.0] * (size + 1), [0.0] * (size + 1)
    p, way = [0] * (size + 1), [0] * (size + 1)
    for i in range(1, size + 1):
        p[0] = i
        j0 = 0
        minv = [float("inf")] * (size + 1)
        used = [False] * (size + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta, j1 = float("inf"), 0
            for j in range(1, size + 1):
                if not used[j]:
                    cur = costs[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(size + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break

    matches = []
    for j in range(1, m + 1):
        i = p[j] - 1
        if 0 <= i < n and costs[i][j - 1] <= max_distance:
            matches.append((i, j - 1))
    return sorted(matches)
