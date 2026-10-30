"""CareLoop detection engine package."""

from engine.config import (
    DUPLICATE_DEFINITE_HOURS,
    DUPLICATE_POSSIBLE_DAYS,
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
    resolve_alerts,
    risk_score,
)

__all__ = [
    "DUPLICATE_DEFINITE_HOURS",
    "DUPLICATE_POSSIBLE_DAYS",
    "WEIGHT_MISSED",
    "WEIGHT_OVERDUE",
    "WEIGHT_CONFLICT",
    "WEIGHT_DUPLICATE",
    "RISK_DIVISOR",
    "SEVERITY_RANK",
    "find_conflicts",
    "classify_duplicate",
    "resolve_alerts",
    "risk_score",
]
