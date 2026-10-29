#!/usr/bin/env bash
cd "$(dirname "$0")/.."
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r api/requirements.txt
uvicorn api.main:app --reload --port 8000
