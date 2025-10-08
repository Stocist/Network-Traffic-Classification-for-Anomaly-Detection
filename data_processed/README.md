# Processed Data Directory

This directory contains all preprocessed datasets ready for model training.

## Files:

### UNSW-NB15 Processed Data (from scripts/make_flows_from_unsw.py):
- `flows_clean.csv` (49MB) - Combined training + testing flows with harmonized columns
- `label_category_map.csv` - UNSW-NB15 attack type → family mapping (Analysis, Backdoor, DoS, etc. → Attack/Normal)

### Multi-Dataset Processed Splits (from notebooks/Data_Processing.ipynb):
- `X_train_processed.csv` (467MB) - Training features (merged from 4Network, UNSW-NB15, CESNET)
- `X_test_processed.csv` (62MB) - Testing features
- `y_train_processed.csv` (2.5MB) - Training labels
- `y_test_processed.csv` (374KB) - Testing labels

### 4Network Label Map:
- `label_category_map_4network.csv` - KDD/NSL-KDD style mapping (back, neptune, smurf, etc. → DoS/Probe/R2L/U2R)

## Usage:

**For UNSW-NB15 only training:**
```python
df = pd.read_csv('data_processed/flows_clean.csv')
```

**For multi-dataset training:**
```python
X_train = pd.read_csv('data_processed/X_train_processed.csv')
y_train = pd.read_csv('data_processed/y_train_processed.csv')
```

> Note: X_train_processed.csv / X_test_processed.csv are legacy EDA splits and are **not used** by final models. Authoritative CESNET inputs are `cesnet_windows_{train,test}.csv`.
