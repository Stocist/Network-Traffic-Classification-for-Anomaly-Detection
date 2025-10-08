# Visualisations Guide (What to open and why)

This guide lists the key figures (PNGs) and where to find them, plus what each visual means. Use this to navigate the repo quickly without re-running anything.

Units: MB (CESNET). CESNET labels via per‑IP 3σ regression residuals (leak‑free). Some plots clip predicted throughput at 0 for display only; metrics are unchanged.

---

## 1) Before merging (dataset‑level EDA)

Open: `notebooks/01_eda_flows.ipynb`
- 4Network (basic dataset)
  - Class balance: Normal vs Attack
- UNSW‑NB15 (raw)
  - Attack category distribution and Normal vs Attack
  - Correlation heatmap (subset of numeric features)
  - t‑SNE on a small sample (exploratory only)
- CESNET (time‑series)
  - Quick prevalence/time‑range print (detailed visuals in Section 3)

> These EDA plots are rendered inside the notebook (not saved to `runs/`).

---

## 2) After training/evaluation (final runs)

### 2.1 4Network – Logistic Regression baseline
Run: `runs/20251008_195241_basic_lr/`
- Confusion matrix: [confusion_matrix.png](../runs/20251008_195241_basic_lr/figures/confusion_matrix.png)
- Precision–Recall curve: [pr_curve.png](../runs/20251008_195241_basic_lr/figures/pr_curve.png)
- ROC curve: [roc_curve.png](../runs/20251008_195241_basic_lr/figures/roc_curve.png)
- Threshold curves: [threshold_curves.png](../runs/20251008_195241_basic_lr/figures/threshold_curves.png)
- Metrics JSON: [metrics.json](../runs/20251008_195241_basic_lr/metrics.json)

What it shows
- Confusion matrix: per‑class hits/misses (OOF CV)
- PR/ROC curves: ranking quality; PR is preferred under imbalance
- Threshold curves: how F1/precision/recall change with threshold

### 2.2 UNSW‑NB15 – Logistic Regression
Run: `runs/20251007_211611_unsw_lr_fixed/`
- Confusion matrix: [confusion_matrix.png](../runs/20251007_211611_unsw_lr_fixed/figures/confusion_matrix.png)
- Precision–Recall curve: [pr_curve.png](../runs/20251007_211611_unsw_lr_fixed/figures/pr_curve.png)
- ROC curve: [roc_curve.png](../runs/20251007_211611_unsw_lr_fixed/figures/roc_curve.png)
- (Optional) Feature importance: [feature_importance.png](../runs/20251007_211611_unsw_lr_fixed/figures/feature_importance.png)
- Metrics JSON: [metrics.json](../runs/20251007_211611_unsw_lr_fixed/metrics.json)

What it shows
- Same interpretation as 4Network; demonstrates a stronger, larger dataset baseline

### 2.3 CESNET – IsolationForest (one‑class, evaluated on test)
Run: `runs/20251008_130459_cesnet_iforest_perm/`
- Precision–Recall curve: [pr_curve.png](../runs/20251008_130459_cesnet_iforest_perm/figures/pr_curve.png)
- Score histogram: [score_hist.png](../runs/20251008_130459_cesnet_iforest_perm/figures/score_hist.png)
- Metrics JSON: [metrics.json](../runs/20251008_130459_cesnet_iforest_perm/metrics.json)

What it shows
- PR‑AUC and recall@FPR≈1% for anomaly detection; histograms split by label show separation

---

## 3) CESNET regression residuals (time‑series visuals)
Run: `runs/20251008_151600_cesnet_regression_plots_clipped/`
- Residual histogram (clipped): [residual_hist_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_hist_mb.png)
- Per‑IP z‑scores (clipped): [residual_z_hist.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_z_hist.png)
- Residual vs predicted (MB): [residual_scatter_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_scatter_mb.png)
- Time‑series (high‑traffic IP): [actual_vs_pred_ip11069_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip11069_mb.png)
- Time‑series (low‑traffic IP): [actual_vs_pred_ip1654964_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip1654964_mb.png)

What it shows
- Residual hist & z‑scores: overall residual shape and tails (units MB)
- Scatter: residual behaviour across predicted scale (predictions clipped ≥0 for display)
- Time‑series: representative hosts with anomalies highlighted

---

## 4) Where these come from
- 4Network & UNSW training visuals: saved by `src/train_supervised.py`
- CESNET IF visuals: saved by `src/train_oneclass.py`
- CESNET regression visuals: produced by `scripts/build_cesnet_residuals.py` (no training here)
- EDA visuals: inside `notebooks/01_eda_flows.ipynb`

---

## 5) Suggested figure set for the report
- 4Network LR: confusion matrix, PR curve, ROC curve
- UNSW LR: confusion matrix, PR curve, ROC curve
- CESNET IF: PR curve, score histogram
- CESNET regression: residual hist (MB), z‑scores, 2 time‑series examples

