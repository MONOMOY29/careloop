# \# CareLoop

# 

# Care-plan coordination prototype for SYNAPSE 1.0 (PS-14). Team Gita Yoddhas.

# 

# Collect -> Connect -> Detect -> Correct -> Remind -> Escalate

# 

# \## Folders

# \- `data/`      Member 1: loading, timeline, SQLite, demo patients

# \- `engine/`    Member 2: conflict, duplicate, missing-step detection and policy

# \- `api/`       Member 3: FastAPI backend

# \- `frontend/`  Member 3: React dashboard

# \- `tests/`     Member 4: stress tests and metrics

# 

# Data formats, API shapes and rules are in CONTRACT.md. Read it before coding.

# 

# \## Requirements

# \- Python 3.10+

# \- Node.js 18+

# 

# \## Run (planned, runs fully offline)

# 1\. Backend:

# &#x20;  pip install -r requirements.txt

# &#x20;  uvicorn api.main:app --reload --port 8000

# 2\. Frontend:

# &#x20;  cd frontend

# &#x20;  npm install

# &#x20;  npm start

# 3\. Open http://localhost:3000

# 

# \## Run the tests (backend must be running)

# pip install pytest requests

# pytest -v

# 

# \## Team rules

# \- Work on your own branch, never directly on main.

# \- Pull before you push. Commit small and often.

# \- Merge to main only after the tests pass.

# \- Feature freeze: Friday midday.

