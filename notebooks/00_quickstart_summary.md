# Quickstart Summary

## Environment Verified
- Python 3.11+
- pandas, numpy, scikit-learn installed
- Optional: xgboost, imbalanced-learn

## Processed Datasets
- `data_processed/flows_clean.csv` - UNSW-NB15 features (no target)
- `data_processed/label_category_map.csv` - Label mappings
- `data_processed/cesnet_windows_train.csv` - CESNET training windows
- `data_processed/cesnet_windows_test.csv` - CESNET test windows with `is_anom`

## Key Runs
- `runs/20251007_211611_unsw_lr_fixed/` - UNSW binary LR (leakage-safe)
- `runs/20251008_130459_cesnet_iforest_perm/` - CESNET IsolationForest
- `runs/20251008_140820_cesnet_regression_plots_final/` - CESNET regression plots

## Commands (from README.md)
See README.md "Quick commands" section for exact preprocessing and training commands.

## Next Steps
- Review `Data_Analysis_and_Visualization.ipynb` for EDA
- Review `Data_Processing.ipynb` for processing details
- Start report writing with figures from `runs/*/figures/`
