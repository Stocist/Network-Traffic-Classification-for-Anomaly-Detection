# Runs directory

This folder contains timestamped run artifacts produced by CLI scripts and notebooks. Each run is immutable and self-contained.

## Final runs to cite in the report
- [20251007_211611_unsw_lr_fixed](20251007_211611_unsw_lr_fixed) — UNSW-NB15 binary Logistic Regression (calibrated, max-F1). Figures + metrics.json
- [20251008_130459_cesnet_iforest_perm](20251008_130459_cesnet_iforest_perm) — CESNET IsolationForest (leak-free 3σ labels). PR-AUC, recall@1% FPR, score hist, PR curve
- [20251008_151600_cesnet_regression_plots_clipped](20251008_151600_cesnet_regression_plots_clipped) — CESNET regression visuals in MB with non-negative predictions for plotting only (metrics unchanged)

## Intermediate runs kept for provenance
- [20251008_140820_cesnet_regression_plots_final](20251008_140820_cesnet_regression_plots_final) — MB regression visuals prior to clipping negative predictions in plots
- [20251008_124545_cesnet_regression_plots_mb](20251008_124545_cesnet_regression_plots_mb) — First MB conversion of regression visuals
- [20251008_123844_cesnet_regression_plots](20251008_123844_cesnet_regression_plots) — Initial regression visuals (aggregate actual vs predicted)

## Reproduce key runs
See project README "Quick commands" for exact CLI invocations. Typical examples:

```
# IsolationForest (one-class)
python -m src.train_oneclass \
  --data data_processed/cesnet_windows_train.csv \
  --categorical-cols id_institution \
  --contamination 0.02 --n-estimators 200 \
  --max-train-rows 100000 --seed 42 --outdir runs \
  --run-name cesnet_iforest_perm \
  --test data_processed/cesnet_windows_test.csv \
  --test-target is_anom --max-test-rows 200000 \
  --scorer pr --fpr-target 0.01
```

Notes
- Units in CESNET plots are MB. Labels via per-IP 3σ residuals (leak-free).
- Clipping to zero is applied in plots only; metrics/residuals are unchanged.


### Key figures (final)
- residual_hist (MB): [open](20251008_151600_cesnet_regression_plots_clipped/figures/residual_hist_mb.png)
- residual_z_hist: [open](20251008_151600_cesnet_regression_plots_clipped/figures/residual_z_hist.png)
- residual_scatter (MB): [open](20251008_151600_cesnet_regression_plots_clipped/figures/residual_scatter_mb.png)
- high-traffic IP: [open](20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip11069_mb.png)
- low-traffic IP: [open](20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip1654964_mb.png)
