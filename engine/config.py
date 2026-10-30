# Threshold in hours for definite duplicate lab orders without results
DUPLICATE_DEFINITE_HOURS = 72

# Threshold in days for possible duplicate lab orders
DUPLICATE_POSSIBLE_DAYS = 7

# Window in days within which a completed lab order requires a follow-up encounter
FOLLOWUP_WINDOW_DAYS = 14

# Risk score weight for missed appointments
WEIGHT_MISSED = 2

# Risk score weight for overdue care pathway steps
WEIGHT_OVERDUE = 1.5

# Risk score weight for scheduling conflicts
WEIGHT_CONFLICT = 3

# Risk score weight for duplicate lab orders
WEIGHT_DUPLICATE = 1

# Divisor normalizing calculated risk into a 0.0 to 1.0 score
RISK_DIVISOR = 10

# Severity rank ordering where high > med > low
SEVERITY_RANK = {"high": 3, "med": 2, "low": 1}
