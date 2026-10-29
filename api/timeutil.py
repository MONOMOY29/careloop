from datetime import datetime, timezone

FMT = "%Y-%m-%dT%H:%M:%SZ"

def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)

def fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime(FMT)

def now() -> str:
    return fmt(datetime.now(timezone.utc))
