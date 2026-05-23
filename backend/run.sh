#!/bin/bash
# Run from inside the backend/ folder
source venv/bin/activate
uvicorn app.main:app --reload --port 8000