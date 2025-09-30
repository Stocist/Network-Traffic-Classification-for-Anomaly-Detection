Network Traffic Classification for Anomaly Detection

Project scaffolding for reproducible training, evaluation, and model persistence using sklearn Pipelines. This structure prevents data leakage, supports class imbalance strategies, and makes marking straightforward.

Structure
- src/data_prep.py — load CSV(s), infer feature types, utilities
- src/pipeline.py — ColumnTransformer + optional SMOTE + estimator
- src/train_supervised.py — StratifiedKFold CV via cross_val_predict, macro‑F1, PR/ROC curves, thresholding, hyperparam search; saves full pipeline + run artifacts
- src/train_oneclass.py — IsolationForest baseline for one-class with PR/ROC + recall@FPR and histograms
- src/train_eval_crossdomain.py — Train on dataset A, evaluate on B (cross-domain generalisation)
- src/train_cluster.py — Optional clustering (KMeans/DBSCAN) with silhouette/DB index
- src/eval_utils.py — confusion matrix, PR/ROC, thresholds, feature importances
- src/inference.py — load saved pipeline and predict on CSV (schema-checked)
- runs/ — per-run artifacts (metrics, figures, pipeline, meta)
- data_processed/ — optional processed artifacts used for training

Environment
- Python = 3.11
- Install dependencies:
  pip install -r requirements.txt

Supervised training
Binary (with label map, calibration, threshold selection, random search):
  python -m src.train_supervised \
    --data data_processed/flows_clean.csv \
    --task binary --target label \
    --label-map data_processed/label_category_map.csv \
    --categorical-cols protocol_type service flag \
    --model xgb --class-weight none --use-smote \
    --search random --n-iter 40 --cv-folds 5 --seed 42 \
    --calibrate isotonic --threshold-mode max_f1 \
    --outdir runs

Multiclass (no SMOTE, class weights):
  python -m src.train_supervised \
    --data data_processed/flows_clean.csv \
    --task multiclass --target label_family \
    --categorical-cols protocol_type service flag \
    --model rf --class-weight balanced \
    --search grid --cv-folds 5 --seed 42 --outdir runs

Outputs per run in runs/<timestamp>_<name>/:
- metrics.json — macro-F1, classification report, confusion matrix, average_precision (AP) and roc_auc for binary
- figures/ — confusion matrix, PR/ROC curves, threshold curves, (optional) feature importances
- params.json, cv_results.csv (if search enabled)
- pipeline.joblib + meta.json (classes, threshold, schema, versions)

One-class baseline
Train on normal-only data (optional labeled test for PR/ROC + recall@FPR):
  python -m src.train_oneclass \
    --data data_processed/normal_only.csv \
    --categorical-cols protocol_type service flag \
    --contamination 0.02 --seed 42 --outdir runs \
    --test data_processed/test.csv --test-target is_anom --scorer pr

Inference
Run predictions on a CSV (schema validated from meta.json; missing required columns auto-filled as NA):
  python -m src.inference \
    --model runs/<timestamp>_<name>/pipeline.joblib \
    --data path/to/new_data.csv --meta runs/<timestamp>_<name>/meta.json \
    --out predictions.csv

Cross-domain evaluation
  python -m src.train_eval_crossdomain \
    --train data_processed/a.csv --test data_processed/b.csv \
    --task multiclass --target label_family \
    --categorical-cols protocol_type service flag \
    --model xgb --cv-folds 5 --seed 42 --outdir runs

Clustering (optional)
  python -m src.train_cluster --data data_processed/flows_clean.csv \
    --categorical-cols protocol_type service flag --method kmeans --k 3 4 5 --outdir runs

Leakage policy
- All preprocessing (impute, scale, one-hot with handle_unknown='ignore') is inside a single Pipeline.
- Any resampling (SMOTE) is inside an imblearn.Pipeline so it only acts on training folds during CV.
- Evaluation uses cross_val_predict with StratifiedKFold (fixed seed) to avoid leakage.

Reproducibility
- Deterministic CV with fixed random_state
- requirements.txt and environment.yml included
- Metrics and artifacts saved to timestamped run folders under runs/
