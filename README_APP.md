# Net Traffic App (Assignment 3 Quickstart)

This is the application layer for Assignment 3: a FastAPI backend and a React (Vite) frontend to serve and visualise your Assignment‑2 model.

## Backend

```
cd web/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Place your trained pipeline at `web/backend/artifacts/pipeline.joblib` and metadata in `web/backend/artifacts/meta.json` (already populated with a demo model).

**Note:** `requirements.txt` pins scikit-learn to 1.5.2 (and supporting libraries) to match the training artifact. Do not upgrade scikit-learn independently; instead, retrain your model if you need different versions.

## Frontend

```
cd web/frontend
npm i
# optional: echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev
```

Open the app and visit `/json` for the single‑flow prediction form with:
- Gauge for confidence
- Feature importance bar chart
- Live history stream and confusion‑like matrix

Full API docs are in `docs/API.md`.
