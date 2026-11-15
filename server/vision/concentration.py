"""Concentration calculations requiring explicit chamber geometry."""
from __future__ import annotations
import math


def concentration_million_per_ml(mean_objects_per_field: float, counting_area_mm2: float, chamber_depth_um: float, dilution_factor: float) -> float:
    values = (mean_objects_per_field, counting_area_mm2, chamber_depth_um, dilution_factor)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("concentration inputs must be finite")
    if mean_objects_per_field < 0 or counting_area_mm2 <= 0 or chamber_depth_um <= 0 or dilution_factor <= 0:
        raise ValueError("count, area, depth and dilution must be positive (count may be zero)")
    # 1 mm² × 1 µm = 10⁻⁹ mL; convert cells/mL to million cells/mL.
    volume_ml = counting_area_mm2 * chamber_depth_um / 1_000_000
    return mean_objects_per_field * dilution_factor / volume_ml / 1_000_000
