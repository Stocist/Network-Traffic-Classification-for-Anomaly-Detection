# API Documentation

Base URL: `http://localhost:8000`

## GET /health

Returns service status.

Response:
{
  "status": "ok",
  "model_loaded": true
}

## POST /predict

Predict a single network flow.

Request JSON:
{
  "src_ip": "192.168.1.10",
  "dst_ip": "10.0.0.5",
  "src_port": 443,
  "dst_port": 51515,
  "protocol": "TCP",
  "pkt_bytes": 1500,
  "pkt_count": 10,
  "inter_arrival_ms": 12
}

Response JSON:
{
  "label": "Attack",
  "probability": 0.87,
  "top_features": [{"name":"dst_port","contribution":0.42}],
  "timestamp": "2025-11-08T10:00:00Z"
}

Errors:
- 422: Validation error with helpful message (e.g., invalid IP)
- 500: Model inference error

## GET /metrics

Aggregated counts by predicted label (rolling window from history).

Response JSON:
{
  "counts_by_label": {"Normal": 120, "Attack": 12},
  "accuracy": null,
  "f1": null
}

## GET /metrics/history?limit=100

Return recent predictions for live-stream UI.

Response JSON:
{
  "items": [
    {"id":"...","timestamp":"...","label":"Attack","probability":0.9,"payload":{...}}
  ]
}

## GET /config

Return current application config.

Response JSON:
{
  "threshold_anomaly": 0.5,
  "live_mode": false
}

## PUT /config

Update application config.

Request JSON:
{
  "threshold_anomaly": 0.6,
  "live_mode": true
}

Response JSON: same as GET /config.

## CSV batch endpoints (existing)

- POST `/api/predict` (multipart CSV)
- GET `/api/results/{id}/download`

