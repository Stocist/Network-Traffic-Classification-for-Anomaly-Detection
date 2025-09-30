# Network Traffic Classification for Anomaly Detection

A clean, reproducible ML pipeline for network traffic anomaly detection. It trains and evaluates classical models with **leakage‑safe Pipelines**, **stratified CV**, and **artifact logging** for easy comparison and reuse.

---

## Getting started

### Environment
- **Python:** 3.11
- Install with pip:
  ```bash
  pip install -r requirements.txt
  ```
- (Optional) Conda:
  ```bash
  conda env create -f environment.yml
  conda activate a2net
  ```

### Dataset expectations (minimum)
| Column                  | Type       | Notes                                                                 |
|---                      |---         |---                                                                    |
| `protocol_type`         | categorical| Encoded via `OneHotEncoder(handle_unknown='ignore')`                  |
| `service`               | categorical| Encoded via `OneHotEncoder(handle_unknown='ignore')`                  |
| `flag`                  | categorical| Encoded via `OneHotEncoder(handle_unknown='ignore')`                  |
| other numeric features… | numeric    | Scaled in the pipeline                                                |
| `label`                 | target     | Fine labels (e.g., `normal`, `smurf`, `neptune`, …)                   |
| `label_family`          | target     | (Optional) Coarse family {`Normal`,`DoS`,`Probe`,`R2L`,`U2R`}         |

If you use binary training with fine → coarse mapping, provide a CSV with header:
```
label,category
```
(e.g., `normal → Normal`, `smurf → DoS`, etc.)

---

## Project structure

| Path                               | Purpose                                                                 | Notes                                                                                       |
|---                                 |---                                                                      |---                                                                                          |
| `src/data_prep.py`                 | Load CSVs, infer numeric/categorical, small utilities                   | Use to assemble `data_processed/flows_clean.csv`                                            |
| `src/pipeline.py`                  | Build `ColumnTransformer` + estimator; optional SMOTE + calibration     | Final estimator step is named **`clf`**                                                     |
| `src/train_supervised.py`          | Train/evaluate classification with `StratifiedKFold`                    | Binary/multiclass, label-map, search, calibration, thresholding, full run logging           |
| `src/train_oneclass.py`            | Train IsolationForest (one-class)                                       | Trains on “Normal” only; evaluates PR/ROC + recall@FPR; saves score histograms              |
| `src/train_eval_crossdomain.py`    | Train on dataset A; evaluate on B                                       | Harmonises columns; reports test metrics/figures; saves pipeline + meta                     |
| `src/train_cluster.py` (optional)  | Clustering (KMeans/DBSCAN)                                              | Silhouette & Davies–Bouldin indices; PCA scatter plots                                      |
| `src/eval_utils.py`                | Metrics, plots, threshold utilities                                     | Confusion matrices, PR/ROC, threshold curves, feature importances, safe score orientation   |
| `src/inference.py`                 | Batch inference                                                          | Loads `pipeline.joblib`, aligns schema from `meta.json`, warns on Python version mismatch   |
| `runs/`                            | Per‑run artifacts                                                        | `metrics.json`, `figures/`, `pipeline.joblib`, `meta.json`, and `cv_results/params`         |
| `data_processed/`                  | Processed artifacts used to train                                        | Include only columns actually used by the final model                                       |

---

## Quick commands

### Supervised — Binary (label map, calibration, threshold selection, random search)
```bash
python -m src.train_supervised \
  --data data_processed/flows_clean.csv \
  --task binary --target label \
  --label-map data_processed/label_category_map.csv \
  --categorical-cols protocol_type service flag \
  --model xgb --class-weight none --use-smote \
  --search random --n-iter 40 --cv-folds 5 --seed 42 \
  --calibrate isotonic --threshold-mode max_f1 \
  --outdir runs
```

### Supervised — Multiclass (class weights; no SMOTE)
```bash
python -m src.train_supervised \
  --data data_processed/flows_clean.csv \
  --task multiclass --target label_family \
  --categorical-cols protocol_type service flag \
  --model rf --class-weight balanced \
  --search grid --cv-folds 5 --seed 42 --outdir runs
```

### One‑class baseline
```bash
python -m src.train_oneclass \
  --data data_processed/normal_only.csv \
  --categorical-cols protocol_type service flag \
  --contamination 0.02 --seed 42 --outdir runs \
  --test data_processed/test.csv --test-target is_anom --scorer pr
```

### Cross‑domain evaluation
```bash
python -m src.train_eval_crossdomain \
  --train data_processed/a.csv --test data_processed/b.csv \
  --task multiclass --target label_family \
  --categorical-cols protocol_type service flag \
  --model xgb --cv-folds 5 --seed 42 --outdir runs
```

### Clustering (optional)
```bash
python -m src.train_cluster \
  --data data_processed/flows_clean.csv \
  --categorical-cols protocol_type service flag \
  --method kmeans --k 3 4 5 --outdir runs
```

### Inference
```bash
python -m src.inference \
  --model runs/<timestamp>_<name>/pipeline.joblib \
  --data path/to/new_data.csv \
  --meta runs/<timestamp>_<name>/meta.json \
  --out predictions.csv
```

---

## Outputs (per run)

| File / Folder                 | What it contains                                                                                              |
|---                            |---                                                                                                            |
| `metrics.json`                | `macro_f1`, per‑class report, confusion matrix; **binary** also `average_precision` and `roc_auc`            |
| `figures/`                    | Confusion matrix, PR/ROC curves (binary), threshold curves, (optional) feature importances                   |
| `pipeline.joblib`            | The **entire** sklearn/imbalanced‑learn pipeline (preprocess + model)                                         |
| `meta.json`                  | Classes, positive label, threshold + mode, numeric/categorical schema, dataset hashes, **versions**           |
| `params.json` / `cv_results.csv` | Present when hyperparameter search is used                                                                  |

---

## Leakage policy (must‑follow)

- All preprocessing (impute, scale, one‑hot with `handle_unknown='ignore'`) lives **inside a single Pipeline**.
- Any resampling (SMOTE) is applied **only** within an `imblearn.Pipeline` on training folds during CV.
- Evaluation uses `cross_val_predict` with `StratifiedKFold` (fixed seed).

---

## Reproducibility checklist

- Deterministic CV with fixed `random_state`
- `requirements.txt` and `environment.yml` are pinned
- Every run writes a new timestamped folder under `runs/`
- `meta.json` records library/runtime versions

---

## Tips & common pitfalls

- If `xgboost` isn’t available, start with `--model rf`.  
- Ensure categorical columns exist: `protocol_type`, `service`, `flag`.  
- For binary tasks, default positive label is `"attack"` (anything not `"Normal"`); override with `--pos-label` if needed.  
- Keep only the **final** processed columns in `data_processed/` for a clean submission.

---
