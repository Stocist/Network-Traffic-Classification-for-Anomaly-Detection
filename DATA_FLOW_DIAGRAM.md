# Data Flow Diagram

## CSV Upload and Visualization Rendering Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER UPLOADS CSV FILE                        │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                             │
│  POST /api/predict                                               │
│  ├─ Load CSV file_bytes                                          │
│  ├─ Validate required features (42 features for UNSW)            │
│  ├─ Run predictions via trained pipeline                         │
│  └─ Build charts from predictions:                               │
│     ├─ label_breakdown: Count predictions by class               │
│     ├─ anomalies_over_time: Group anomalies by minute            │
│     └─ top_destination_ports: Top 10 ports with anomalies        │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              PredictionResponse (JSON)                            │
│  {                                                                │
│    "result_id": "abc123...",                                     │
│    "validation": {...},                                          │
│    "columns": [...],                                             │
│    "predictions": [                                              │
│      {row_index, prediction, score, data: {...}},                │
│      ...                                                          │
│    ],                                                            │
│    "charts": {                                                   │
│      "label_breakdown": {                                        │
│        "counts": {"Attack": 46, "Normal": 54}  ◄── KEY DATA      │
│      },                                                          │
│      "anomalies_over_time": [...],                               │
│      "top_destination_ports": [...]                              │
│    }                                                             │
│  }                                                                │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           FRONTEND CONTEXT (React)                                │
│  InferenceResultsProvider                                        │
│  ├─ setState({ predictions, charts, ... })                      │
│  └─ Memoize derivedCharts                                        │
│                                                                  │
│     derivedCharts = useMemo(() => {                              │
│       ┌─────────────────────────────────────────┐                │
│       │ Logic Path:                             │                │
│       │ 1. No predictions? → return null        │                │
│       │ 2. No source data? → empty charts       │                │
│       │ 3. Filters active? → recompute charts   │                │
│       │ 4. No filters? → return backend charts  │ ◄── FIX HERE   │
│       └─────────────────────────────────────────┘                │
│                                                                  │
│       Always returns ChartsPayload or null                       │
│     })                                                           │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONTEXT VALUE EXPOSED                                │
│  {                                                                │
│    currentCharts: derivedCharts,  ◄─ Used by components          │
│    filteredPredictions: [...],    ◄─ Used by table               │
│    activeFilters: {...},           ◄─ Used for filtering         │
│    ...                                                           │
│  }                                                                │
└────────────────────────────┬──────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  PredictionCharts │  │  AnomalyDetection│
        │                  │  │      Page        │
        │ Checks:          │  │                  │
        │ if (!charts)     │  │ ├─ Shows metrics │
        │   show placeholder │ ├─ Shows charts  │
        │ else             │  │ └─ Shows table   │
        │   render 4 charts│  │                  │
        │ - Doughnut       │  │                  │
        │ - Polar area     │  └──────────────────┘
        │ - Score bands    │
        │ - Top ports      │
        └──────────────────┘
                    │
                    ▼
        ┌──────────────────┐
        │   VISUALIZATIONS │
        │   ARE DISPLAYED  │
        │     ✅ SUCCESS   │
        └──────────────────┘
```

## What The Fix Changed

### BEFORE (Buggy):
```
CSV Upload
  ↓
Backend OK ✅
  ↓
Frontend receives response
  ↓
derivedCharts memoization:
  ├─ Complex conditional logic ❌
  ├─ Sometimes returns null when charts exist ❌
  ├─ Sometimes returns wrong structure ❌
  └─ Data mismatches between chart types ❌
  ↓
PredictionCharts:
  if (!charts) show placeholder
  else show broken/empty charts ❌
  ↓
VISUALIZATIONS DON'T RENDER ❌ BUG
```

### AFTER (Fixed):
```
CSV Upload
  ↓
Backend OK ✅
  ↓
Frontend receives response
  ↓
derivedCharts memoization:
  ├─ Clear 3-path logic ✅
  ├─ Always returns ChartsPayload or null ✅
  ├─ Consistent data structure ✅
  └─ Handles filters correctly ✅
  ↓
PredictionCharts:
  if (!charts) show placeholder
  else render all charts ✅
  ↓
VISUALIZATIONS RENDER ✅ FIXED
```

## Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    App.tsx                                    │
│                 (Routes setup)                                │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│          InferenceResultsProvider                             │
│          (Context with fixed derivedCharts)                   │
│                                                               │
│  ┌─ state (predictions, charts, validation)                  │
│  ├─ derivedCharts ◄─ THE FIX (3-path logic)                  │
│  ├─ filteredPredictions                                      │
│  ├─ activeFilters                                            │
│  └─ toggle/reset functions                                   │
└────────┬───────────────────────────────────────────────────┘
         │
    ┌────┴────────────────────────┬─────────────────┐
    │                             │                 │
    ▼                             ▼                 ▼
Dashboard              AnomalyDetection          TimeSeries
  │                         │                       │
  ├─ Metrics Cards         ├─ Charts Grid          ├─ Flow Timeline
  └─ PR Curve              ├─ Results Table        ├─ Anomalies Table
                           └─ ActiveFilters        ├─ Anomaly Windows
                                                  └─ Zoom Controls

All use: currentCharts = derivedCharts (fixed)
All use: filteredPredictions (for table/filters)
All use: activeFilters (for UI state)
```

## Key Classes and Types

```typescript
// Backend Schema (app/schemas.py)
class ChartsPayload:
  label_breakdown: LabelBreakdown
    counts: Dict[str, int]  ◄── {"Attack": 46, "Normal": 54}
  anomalies_over_time: List[TimelinePoint]
  top_destination_ports: List[PortCount]

// Frontend Type (types/inference.ts)
type ChartsPayload = {
  label_breakdown: LabelBreakdown
  anomalies_over_time: TimelinePoint[]
  top_destination_ports: PortCount[]
}

// Context provides:
currentCharts: ChartsPayload | null  ◄── Fixed to always be valid
```

## State Changes During Upload

```
Initial State:
  predictions: []
  charts: null
  currentCharts: null
  ↓
  PredictionCharts shows placeholder ✓

After Upload:
  predictions: [100 rows]
  charts: {label_breakdown, anomalies_over_time, top_ports}
  currentCharts: {same as charts}
  ↓
  derivedCharts memoization runs
  ↓
  currentCharts: ChartsPayload ✓ (never null)
  ↓
  PredictionCharts renders all 4 charts ✓✓✓

After Clicking Filter:
  predictions: [100 rows] (unchanged)
  charts: {backend charts} (unchanged)
  activeFilters: {labels: ["Attack"]}
  hasActiveFilters: true
  ↓
  derivedCharts memoization runs again
  ↓
  source = filteredPredictions (only 46 Attack records)
  ↓
  Recompute labelCounts from source
  ↓
  currentCharts: {label_breakdown: {counts: {Attack: 46}}, ...}
  ↓
  PredictionCharts re-renders with filtered data ✓✓✓
```

---

This diagram shows how the fix ensures visualizations render correctly in all scenarios.
