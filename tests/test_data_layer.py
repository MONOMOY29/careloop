from data.seed import reset_demo_data
from data.store import get_patients, get_timeline, add_event

EVENT_KEYS = ["event_id", "patient_id", "type", "title", "test_type",
              "start_time", "end_time", "status", "has_result"]


def setup_function():
    reset_demo_data()


def teardown_function():
    reset_demo_data()  # leave the db clean after every test


def test_reset_returns_two_patients():
    assert reset_demo_data() == 2


def test_p101_timeline_matches_contract_seed():
    tl = get_timeline("p-101")
    assert [e["event_id"] for e in tl] == ["ev-501", "ev-502", "ev-503"]
    assert list(tl[0].keys()) == EVENT_KEYS
    assert tl[0]["has_result"] is False
    assert tl[0]["test_type"] == "CMP"
    assert tl[1]["test_type"] is None


def test_timestamps_are_utc_z():
    for p in ("p-101", "p-102"):
        for e in get_timeline(p):
            assert e["start_time"].endswith("Z")
            assert e["end_time"].endswith("Z")


def test_unknown_patient_returns_none():
    assert get_timeline("p-999") is None


def test_patients_list_has_zero_alerts():
    ps = get_patients()
    assert len(ps) == 2
    assert all(p["active_alerts_count"] == 0 for p in ps)


def test_injected_ids_start_at_991_and_restart_after_reset():
    a = add_event("p-101", "procedure", "Ultrasound Scan",
                  "2026-10-28T09:10:00Z", "2026-10-28T09:40:00Z")
    b = add_event("p-101", "lab_order", "HbA1c Test Repeat",
                  "2026-10-29T11:00:00Z", "2026-10-29T11:30:00Z",
                  test_type="HbA1c")
    assert a["event_id"] == "ev-991"
    assert b["event_id"] == "ev-992"
    reset_demo_data()
    c = add_event("p-101", "procedure", "Ultrasound Scan",
                  "2026-10-28T09:10:00Z", "2026-10-28T09:40:00Z")
    assert c["event_id"] == "ev-991"


def test_control_patient_p102_has_no_overlaps_or_repeat_tests():
    tl = get_timeline("p-102")
    for i, a in enumerate(tl):
        for b in tl[i + 1:]:
            assert not (a["start_time"] < b["end_time"]
                        and b["start_time"] < a["end_time"])
    tests = [e["test_type"] for e in tl if e["test_type"]]
    assert len(tests) == len(set(tests))