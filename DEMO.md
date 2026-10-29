# Demo script (about 5 minutes)

## Before judges arrive
1. POST /reset (or the reset button). Dashboard open on p-101.
2. Both laptops running. Backup recording ready.

## 1. The problem (30 s, speaker: Member 4)
"Patient care is spread across doctors, labs and pharmacies. Nobody sees one
timeline, so appointments overlap and tests get repeated. We don't diagnose,
we coordinate."

## 2. Show the clean timeline (20 s)
Open p-101. Point out: lab at 09:00, PT at 10:00, HbA1c on the 29th. No alerts.

## 3. Judge stress test (2 min)
Ask the judge to inject (or do it with them watching):
1. Conflict: Ultrasound 09:10-09:40 -> alert appears, reason shown, high severity.
2. Duplicate: HbA1c repeat on the 29th at 11:00 -> alert appears, Definite, med.
Say: "Both flagged in <X> ms with a plain-language reason."

## 4. Corrected plan (30 s)
Show: ultrasound moved to 09:30-10:00, duplicate cancelled, earlier order kept.

## 5. Close the loop (30 s)
Click accept -> alert resolves -> open the audit log: prior state, new state, who.

## 6. Numbers (30 s)
Run metrics.py or show results: accuracy, latency, 0 false alerts on p-102.

## If something breaks
Stay calm. Switch to the backup laptop. If that fails, play the recording.
Never debug live.






# Viva cheat sheet

Why rules, not ML?
Predictable, testable, no training data, runs free on a CPU. We can inject
cases and prove it catches them every time.

How does duplicate detection work?
Same patient, same test type, start times within 72 h and no result = Definite.
Within 7 days, or a result exists = Possible. Two confidence levels reduce
false alarms.

How does conflict detection work?
Two events overlap if a.start < b.end and b.start < a.end. Sort events by start
time and compare neighbours: O(n log n).

Where is the feedback loop?
Sense (timeline), decide (detectors, policy), act (alert, corrected plan),
feedback (accept/resolve writes the audit entry and updates the timeline and
risk score).

How would it scale?
Move SQLite to PostgreSQL, add indexes on (patient_id, start_time), ingest
events through a queue, and run detection per patient in parallel.

What are the limits?
Synthetic data only, no real hospital integration, rule thresholds are fixed
(72 h / 7 d), no clinical decisions.

How did you test it?
Automated tests inject conflicts and duplicates, measure accuracy and latency,
and check a clean patient produces no alerts.

Business viability?
Hospitals lose money on repeated tests and missed appointments. A coordination
layer that plugs into existing scheduling and lab systems can be sold per
hospital as a subscription.

Did AI write the code?
Be honest: we used AI as a tool, and every member can explain every part.