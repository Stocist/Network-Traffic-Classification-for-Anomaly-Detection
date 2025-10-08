# Results and Run Links

Units: MB. CESNET labels via per‑IP 3σ residuals (leak‑free). Plots clip predictions at 0 for display only; metrics unchanged.

## UNSW — Binary Logistic Regression
- Run: [runs/20251007_211611_unsw_lr_fixed](../runs/20251007_211611_unsw_lr_fixed)
- Figures:
  - [confusion_matrix.png](../runs/20251007_211611_unsw_lr_fixed/figures/confusion_matrix.png)
  - [pr_curve.png](../runs/20251007_211611_unsw_lr_fixed/figures/pr_curve.png)
  - [roc_curve.png](../runs/20251007_211611_unsw_lr_fixed/figures/roc_curve.png)

## CESNET — IsolationForest
- Run: [runs/20251008_130459_cesnet_iforest_perm](../runs/20251008_130459_cesnet_iforest_perm)
- Figures:
  - [pr_curve.png](../runs/20251008_130459_cesnet_iforest_perm/figures/pr_curve.png)
  - [score_hist.png](../runs/20251008_130459_cesnet_iforest_perm/figures/score_hist.png)
- Metrics: [metrics.json](../runs/20251008_130459_cesnet_iforest_perm/metrics.json)
  - PR‑AUC ≈ 0.277, recall@~1% FPR ≈ 0.11

## CESNET — Regression Residuals (visuals)
- Final (clipped visuals): [runs/20251008_151600_cesnet_regression_plots_clipped](../runs/20251008_151600_cesnet_regression_plots_clipped)
  - [residual_hist_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_hist_mb.png)
  - [residual_z_hist.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_z_hist.png)
  - [residual_scatter_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/residual_scatter_mb.png)
  - [actual_vs_pred_ip11069_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip11069_mb.png)
  - [actual_vs_pred_ip1654964_mb.png](../runs/20251008_151600_cesnet_regression_plots_clipped/figures/actual_vs_pred_ip1654964_mb.png)

Provenance (older):
- [20251008_140820_cesnet_regression_plots_final](../runs/20251008_140820_cesnet_regression_plots_final)
- [20251008_124545_cesnet_regression_plots_mb](../runs/20251008_124545_cesnet_regression_plots_mb)
- [20251008_123844_cesnet_regression_plots](../runs/20251008_123844_cesnet_regression_plots)
