"""CareLoop detection engine package."""

from engine.config import (
    DUPLICATE_DEFINITE_HOURS,
    DUPLICATE_POSSIBLE_DAYS,
    FOLLOWUP_WINDOW_DAYS,
    RISK_DIVISOR,
    SEVERITY_RANK,
    WEIGHT_CONFLICT,
    WEIGHT_DUPLICATE,
    WEIGHT_MISSED,
    WEIGHT_OVERDUE,
)
from engine.rules import (
    classify_duplicate,
    find_conflicts,
    find_missing_steps,
    find_next_slot,
    resolve_alerts,
    risk_score,
)
from engine.service import (
    build_corrected_plan,
    detect_conflicts,
    detect_duplicates,
    plan_item,
)

__all__ = [
    "DUPLICATE_DEFINITE_HOURS",
    "DUPLICATE_POSSIBLE_DAYS",
    "FOLLOWUP_WINDOW_DAYS",
    "WEIGHT_MISSED",
    "WEIGHT_OVERDUE",
    "WEIGHT_CONFLICT",
    "WEIGHT_DUPLICATE",
    "RISK_DIVISOR",
    "SEVERITY_RANK",
    "find_conflicts",
    "classify_duplicate",
    "find_missing_steps",
    "find_next_slot",
    "resolve_alerts",
    "risk_score",
    "detect_conflicts",
    "detect_duplicates",
    "plan_item",
    "build_corrected_plan",
]
