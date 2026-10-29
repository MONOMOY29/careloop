@echo off
cd /d "%~dp0.."
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r api\requirements.txt
uvicorn api.main:app --reload --port 8000
