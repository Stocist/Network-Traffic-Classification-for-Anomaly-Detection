# Label and Threshold Semantics

## Overview

This document defines the consistent semantics for labels, probabilities, and thresholds across the API and UI.

---

## Label Classification

### Model Output

The deployed model (UNSW-NB15 Logistic Regression) is a **binary classifier** trained to distinguish:
- **"Attack"** - Malicious or anomalous network traffic
- **"Normal"** - Benign network traffic

### Prediction Process

1. **Model Inference**: The sklearn pipeline outputs a class prediction and probability distribution
2. **Primary Label**: The class with the highest probability is returned as the `label`
3. **Probability**: The probability for the **Attack** class (positive label) is returned as `probability`

**Example:**
```json
{
  "label": "Attack",
  "probability": 0.75
}
```
- Interpretation: 75% confidence this is an Attack; 25% confidence it's Normal

---

## Threshold Semantics

### What the Threshold Controls

The **threshold** is an adjustable decision boundary (default: 0.5) that affects **risk assessment**, not the primary label.

### Threshold Behavior

- **Label assignment**: Always uses the model's argmax (highest probability class)
- **Risk flag**: `probability >= threshold` → "At Risk" or "High Confidence Attack"
- **Status indicator**: Visual cue in the gauge chart showing if the prediction exceeds the alert threshold

### Examples

| Probability | Threshold | Label  | At Risk? | Gauge Color |
|-------------|-----------|--------|----------|-------------|
| 0.75        | 0.5       | Attack | Yes      | Red         |
| 0.45        | 0.5       | Normal | No       | Green       |
| 0.55        | 0.7       | Attack | No       | Orange      |
| 0.80        | 0.7       | Attack | Yes      | Red         |

**Key Point**: The threshold does NOT change the label; it only affects the visual risk indicator and alerting logic.

---

## API Consistency

### POST `/predict`

**Request:**
```json
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
```

**Response:**
```json
{
  "label": "Attack",
  "probability": 0.5572537897314109,
  "top_features": [
    {"name": "cat__service_http", "contribution": 0.234},
    {"name": "sbytes", "contribution": 0.189}
  ],
  "timestamp": "2025-11-08T12:49:23.863378Z"
}
```

**Fields:**
- `label`: The predicted class ("Attack" or "Normal")
- `probability`: Probability of the **Attack** class (always 0-1)
- `top_features`: Most important features contributing to the prediction
- `timestamp`: UTC timestamp of the prediction

### GET `/config`

Returns the current threshold setting:

```json
{
  "threshold_anomaly": 0.5,
  "model_name": "UNSW-NB15 Logistic Regression",
  "version": "20251007_211611"
}
```

### PUT `/config`

Update the threshold:

```json
{
  "threshold_anomaly": 0.7
}
```

---

## UI Implementation

### Gauge Chart

- **Attack probability** displayed as a semi-circle gauge
- **Threshold marker**: Dashed orange line showing the current threshold
- **Status indicator**:
  - ✓ Normal (green) if `probability < threshold`
  - ⚠️ At Risk (red) if `probability >= threshold`

### Feature Importance

- **Labels**: Mapped to friendly names (e.g., `cat__service_ssh` → "Service: SSH")
- **Tooltips**: Show full descriptions and contribution magnitude
- **Color coding**: High-impact features (>0.1) in red, medium in orange

### History List

- **Label colors**:
  - Attack: Red text
  - Normal: Green text
- **Filtering**: Click on distribution matrix to filter by label
- **Auto-refresh**: Optional polling every 3 seconds

---

## Report and Video Guidance

### How to Explain to Stakeholders

> "The model predicts a label (Attack or Normal) based on which class has the highest probability. The threshold is an additional risk assessment tool: if the Attack probability exceeds the threshold (default 50%), the system flags it as 'At Risk' for immediate attention. This allows security teams to adjust sensitivity without retraining the model."

### Demo Script

1. Show a prediction with probability slightly above 0.5 → "At Risk"
2. Adjust threshold to 0.7 using `/config` endpoint → same prediction now shows "Normal" status
3. Explain: "The label didn't change, but the alert threshold did. This demonstrates configurable risk tolerance."

---

## Consistency Checklist

- [x] API always returns `label` as "Attack" or "Normal"
- [x] `probability` always refers to the Attack class
- [x] Threshold does not affect label assignment
- [x] Threshold affects only the "At Risk" visual indicator
- [x] UI gauge shows threshold marker visually
- [x] All charts use consistent label colors (Attack=red, Normal=green)
- [x] Feature names are mapped to friendly labels in UI
- [x] Tooltips provide additional context

---

## Future Considerations

**Multi-class Extension**: If a multi-class model is deployed (e.g., different attack types), the semantics would change:
- `label`: Predicted attack type (e.g., "DDoS", "Port Scan", "Normal")
- `probability`: Confidence in the predicted class (not Attack-specific)
- `threshold`: May apply per-class or globally

**Calibration**: The current model is uncalibrated (see `meta.json`). Probabilities reflect relative confidence but not true likelihoods. For production, consider probability calibration.

