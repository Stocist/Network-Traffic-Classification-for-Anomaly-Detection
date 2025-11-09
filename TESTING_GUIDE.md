# Visualization Fix - Testing Guide

## Summary of Fix
A bug in the frontend's chart derivation logic was preventing visualizations from displaying after CSV upload. The issue was in `web/frontend/src/context/InferenceResultsContext.tsx` where the `derivedCharts` computation had incorrect logic for handling chart data.

### Files Modified:
1. **web/frontend/src/context/InferenceResultsContext.tsx** - Fixed derivedCharts logic
2. **web/frontend/src/styles.css** - Added CSS for filter UI components

## How to Test the Fix

### Prerequisites
- Backend server running on port 8000
- Frontend server running on port 5173 (or configured port)
- UNSW_NB15_testing-set.csv file available in `UNSW-NB15/CSV Files/Training and Testing Sets/`

### Step-by-Step Testing

#### Step 1: Start Backend Server
```powershell
cd "web/backend"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

#### Step 2: Start Frontend Server
In a new terminal, run:
```powershell
cd "web/frontend"
npm run dev
# or if npm has execution policy issues:
# node_modules/.bin/vite --host
```

Expected output:
```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

#### Step 3: Open Browser
Navigate to: `http://localhost:5173`

You should see:
- Navigation menu on the left
- Hero section with upload button
- Dashboard with metrics cards below

#### Step 4: Test Upload and Visualizations

**On Dashboard Page:**
1. Click "Upload UNSW-NB15 Dataset" button
2. Select `UNSW-NB15_testing-set.csv` or a subset of it
3. Wait for processing (progress bar shows "Processing dataset...")
4. After completion, you should see:
   - ✅ **Metrics cards updated**: Rows processed, Anomalies flagged, Normal predictions
   - ✅ **PR Curve displays**: The precision-recall curve chart should render

**On Anomaly Detection Page:**
1. Navigate to "Anomaly Detection" via sidebar
2. Click "Upload UNSW-NB15 Dataset" in the card grid
3. Select and upload the same CSV
4. Wait for processing
5. After completion, you should see:
   - ✅ **Charts grid displays**: All 4 charts should be visible
     - Doughnut: Prediction breakdown (Attack vs Normal segments)
     - Polar area: Attack taxonomy (if attack type field exists)
     - Bar chart (horizontal): Anomaly score bands (if scores exist)
     - Bar chart (horizontal): Top destination ports
   - ✅ **Table populated**: Rows with predictions, scores, network data
   - ✅ **Pagination controls**: Previous/Next buttons
   - ✅ **Sort options**: "Original order", "Attack first", "Normal first"

**On Time Series Page:**
1. Navigate to "Time Series" via sidebar
2. Click "Upload UNSW-NB15 Dataset"
3. Select and upload the same CSV
4. After completion, you should see:
   - ✅ **Flow timeline chart**: Line chart showing flows over time
   - ✅ **Top anomalies table**: List of high-scoring attack records
   - ✅ **Anomaly windows table**: Bucketed statistics
   - Zoom controls: Drag to zoom, buttons to reset (if timestamp data exists)

#### Step 5: Test Filter Interactions

**On Anomaly Detection page:**

1. **Click on a segment** of the doughnut chart (Prediction breakdown)
   - Expected: The segment should highlight
   - Expected: All other charts should update to show only that prediction type
   - Expected: Table should filter to show only that prediction
   - Expected: Active filters summary should appear at top

2. **Click on a bar** in the destination ports chart
   - Expected: The bar should highlight with black border
   - Expected: Other bars should fade out
   - Expected: Table should filter to show only flows with that port
   - Expected: Active filters summary should update

3. **Click "Active Filters" area**
   - Expected: A pill/chip for each active filter should appear
   - Expected: Each chip has an X to remove that filter
   - Expected: A "Reset Filters" button to clear all filters

4. **Click X on a filter chip**
   - Expected: That filter should be removed
   - Expected: Charts and table should update
   - Expected: Other filters remain applied

5. **Click "Reset Filters" button**
   - Expected: All filters clear
   - Expected: Charts return to showing all data
   - Expected: Active filters summary disappears

#### Step 6: Test Time Series Zoom (if timestamp data exists)

1. On Time Series page with data uploaded:
2. **Drag on the flow timeline chart to zoom**
   - Expected: Chart zooms in on the selected region
   - Expected: X-axis label formatting adjusts (e.g., shows hours/minutes)

3. **Click "Reset Zoom" button**
   - Expected: Chart returns to original view

4. **Hover over zoom control hint**
   - Expected: Tooltip or hint shows zoom instructions

## Expected Behavior Summary

### What SHOULD Appear After CSV Upload

| Page | Component | Expected Behavior |
|------|-----------|------------------|
| Dashboard | Metric Cards | Shows row count, anomaly count, normal count |
| Dashboard | PR Curve | Displays precision-recall curve chart |
| Anomaly Detection | Doughnut Chart | Shows Attack vs Normal segments |
| Anomaly Detection | Polar Chart | Shows attack categories (if available) |
| Anomaly Detection | Score Bands | Shows score distribution histogram |
| Anomaly Detection | Port Bar Chart | Shows top 10 destination ports |
| Anomaly Detection | Results Table | Shows paginated predictions |
| Time Series | Flow Timeline | Shows anomalies over time (if timestamp available) |
| Time Series | Anomalies Table | Shows top 12 high-scoring attacks |
| Time Series | Anomaly Windows | Shows bucketed statistics |

### What SHOULD NOT Appear

- Empty placeholder cards with "Upload a dataset" messages (unless error occurred)
- "No data available" in table cells (unless filters removed all rows)
- Console errors or blank/broken charts

## Troubleshooting

### Issue: Charts don't appear after upload

**Check 1**: Look at browser console (F12 → Console tab)
- If there are errors, note them down
- Common errors:
  - "Cannot read property 'counts' of null" → derivedCharts is returning wrong structure
  - "Cannot read property 'label_breakdown' of null" → currentCharts is null when it shouldn't be
  - CORS errors → Backend not accessible from frontend

**Check 2**: Verify backend received the upload
- Open Network tab (F12 → Network)
- Upload a file
- Look for POST request to `/api/predict`
- Response should have status 200
- Response body should contain `"charts"` with `"label_breakdown"`, `"anomalies_over_time"`, etc.

**Check 3**: Verify frontend data received
- In browser console, check if response is logged (if debug logging enabled)
- Look for `currentCharts` in React DevTools → InferenceResultsProvider

### Issue: Only some charts appear

**Likely cause**: The CSV is missing certain columns
- Doughnut chart requires: `prediction` column (always available)
- Polar chart requires: `attack_type`, `attack_cat`, `category`, `label`, or `label_family` column
- Score bands require: `score` column (from model probability)
- Port bar requires: `dst_port` or `dport` column

**Solution**: Upload a complete UNSW dataset with all features

### Issue: Charts appear but are empty

**Check**: Are there any predictions in the response?
- In browser console:
  ```javascript
  // In React DevTools or console
  const ctx = useInferenceResults();
  console.log(ctx.state.predictions.length); // Should be > 0
  console.log(ctx.currentCharts);
  ```

**Likely cause**: 
- Model returned no predictions (unlikely)
- Charts data structure is corrupted

### Issue: Table shows no rows but charts are visible

**Check**: Are there anomalies in the data?
- Charts might be showing data
- Table might be filtered by prediction type
- Try clicking "Original order" sort option

## Performance Notes

- Uploads over 50,000 rows will be automatically downsampled to 80% of max rows
- Large files may take 5-10 seconds to process
- Charts rendering with 50k+ rows may take 1-2 seconds initially

## Next Steps if Issues Persist

1. Check `web/backend/app/config.py` for model path configuration
2. Verify model files exist in the configured `model_path` location
3. Check `web/frontend/src/context/InferenceResultsContext.tsx` line 280-320 for correct logic
4. Check browser console for JavaScript errors
5. Check backend logs for Python errors

## Code Changes Made

### Main Fix: InferenceResultsContext.tsx - derivedCharts

**Before (Buggy)**:
```typescript
const derivedCharts = useMemo<ChartsPayload | null>(() => {
  if (!state.charts && state.predictions.length === 0) {
    return null
  }
  const source = hasActiveFilters ? filteredPredictions : state.predictions
  const fallbackTimeline = state.charts?.anomalies_over_time ?? []
  // ... complex conditional logic that could return wrong structure
})
```

**After (Fixed)**:
```typescript
const derivedCharts = useMemo<ChartsPayload | null>(() => {
  // Clear three-path logic:
  // 1. No data at all → null
  // 2. No source data → empty charts
  // 3. Filters active → recompute
  // 4. No filters → use backend charts
  
  if (!state.charts && state.predictions.length === 0) {
    return null
  }
  const source = hasActiveFilters ? filteredPredictions : state.predictions
  if (!source || source.length === 0) {
    return { label_breakdown: { counts: {} }, ... }
  }
  if (hasActiveFilters) {
    // recompute charts from filtered predictions
    return { ... }
  }
  // Use backend charts as-is
  return state.charts
})
```

**Key Improvement**: Guarantees `ChartsPayload` structure is always returned when charts exist.

---

## Success Criteria

✅ All tests pass when:
1. CSV uploads without error
2. Charts appear on all three pages
3. Metrics/data is accurate
4. Filtering interactions work
5. No console errors
6. Performance is acceptable (< 5 seconds for 100k rows)

---

**Last Updated**: 2025-11-09
**Fix Version**: 1.0
**Status**: Ready for Testing
