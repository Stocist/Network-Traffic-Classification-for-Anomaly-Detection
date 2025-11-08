# Web App (Frontend & Backend)

This folder contains the complete demo web stack for Network Traffic Classification, combining a Vite/React frontend with a FastAPI backend that serves trained model predictions.

> **📋 For detailed implementation status, testing checklist, and team coordination, see [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)**

## Quick Start

```bash
# 1. Install dependencies
cd web/backend
pip install -r requirements.txt

cd web/frontend
npm install

# 2. Run backend API (default http://localhost:8000)
cd web/backend
uvicorn app.main:app --reload --app-dir . --host 0.0.0.0 --port 8000

# 3. Run frontend UI (default http://localhost:5173)
cd web/frontend
npm run dev
```

Once both processes are running, open the frontend development URL. The UI expects the backend at `http://localhost:8000`. Override this by setting `VITE_API_BASE_URL` in `web/frontend/.env` (see **Configuration**).

## Frontend (Vite + React)

Location: `web/frontend`

Highlights:

- Dataset upload control that validates CSV files before sending to the backend.
- Prediction table with client-side pagination, sorting helpers, and CSV export.
- Rich charting panels summarising model output across dashboard, inference, and time-series views.
- Shared inference context keeps prediction state consistent across every page without extra fetches.

Key commands:

- `npm run dev` - start the Vite dev server.
- `npm run build` - type-check and create a production bundle.
- `npm run preview` - serve the built bundle locally.

### Page Overview

- **Dashboard** (`/`): Aggregated charts, recent activity, and quick links into anomaly workflows.
- **Anomaly Detection** (`/inference`): Upload CSVs, inspect charts, and review the sortable predictions table with download support.
- **Time Series** (`/time-series`): Explore anomaly ratios, score trajectories, and flagged windows over time.

## Backend (FastAPI)

Location: `web/backend`

Endpoints:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Health probe |
| POST | `/api/predict` | Accepts CSV upload, returns predictions plus chart payloads |
| GET | `/api/results/{id}/download` | Streams CSV with predictions for the given id |

Important files:

- `app/main.py` - FastAPI application, CORS, and endpoint wiring.
- `app/config.py` - Environment-driven configuration (model paths, CORS, row limits).
- `app/services/artifacts.py` - Loads the trained pipeline and metadata, infers the positive label.
- `app/services/prediction_service.py` - End-to-end upload handling: parsing, validation, scoring, chart building.
- `app/services/store.py` - In-memory result cache to power the download endpoint.
- `artifacts/pipeline.joblib` & `artifacts/meta.json` - Default model and feature metadata packaged with the repo.

Run the API with uvicorn:

```bash
uvicorn app.main:app --reload --app-dir web/backend --host 0.0.0.0 --port 8000
```

## Configuration

Backend environment variables (optional):

| Variable | Default | Notes |
| --- | --- | --- |
| `MODEL_PATH` | `web/backend/artifacts/pipeline.joblib` | Path to the sklearn pipeline |
| `META_PATH` | `web/backend/artifacts/meta.json` | Feature metadata |
| `CORS_ALLOW_ORIGINS` | `*` | Comma-separated origins for CORS |
| `MAX_PREDICTION_ROWS` | `50000` | Reject uploads exceeding this row count |

Frontend environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API origin used for fetch requests |

Set frontend variables by creating `web/frontend/.env` with e.g.:

```
VITE_API_BASE_URL=http://localhost:8080
```

## Testing

- Frontend: `npm run build` ensures TypeScript and bundler checks pass.
- Backend: Optional smoke test - send a CSV to `/api/predict` (Postman, curl, or the UI). The bundled model will respond with `Attack`/`Normal` predictions.

## Folder Structure

```
web/
|- backend/
|  |- app/                # FastAPI app, schemas, services
|  |- artifacts/          # Default model + metadata
|  `- requirements.txt
`- frontend/
   |- src/                # React components, pages, context, styles
   |- public/             # Static assets
   `- package.json
```

## Notes

- Replace the packaged dummy model with real training artifacts by pointing `MODEL_PATH`/`META_PATH` to new files.
- The frontend layout mirrors the design comps; keep structure changes aligned with the shared context.
- For production use, build the frontend (`npm run build`) and serve the generated `dist/` via nginx or another static host while running FastAPI behind uvicorn or gunicorn.
