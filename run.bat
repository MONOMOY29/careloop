@echo off
start "backend" cmd /k "uvicorn api.main:app --port 8000"
start "frontend" /d frontend cmd /k "npm run dev"
