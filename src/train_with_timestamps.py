#!/usr/bin/env python3
"""
Train a model on UNSW-NB15 data with proper timestamp handling.
This script combines raw UNSW-NB15 data (which has timestamps) with the preprocessed
training/testing sets to create a model that performs well while preserving temporal information.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
import platform
import importlib
import io
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.metrics import classification_report, average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict, RandomizedSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder

from .data_prep import FeatureSpec, split_Xy
from .eval_utils import (
    compute_classification_metrics,
    save_confusion_matrix,
    plot_pr_curve,
    plot_roc_curve,
    threshold_curve_plot,
    best_f1_threshold,
)


def load_raw_unsw_data(file_path: Path, sample_size: Optional[int] = None) -> pd.DataFrame:
    """Load raw UNSW-NB15 data with proper headers."""
    
    # * UNSW-NB15 raw format headers
    unsw_headers = [
        "srcip", "sport", "dstip", "dsport", "proto", "state", "dur", "sbytes", "dbytes",
        "sttl", "dttl", "sloss", "dloss", "service", "Sload", "Dload", "Spkts", "Dpkts",
        "swin", "dwin", "stcpb", "dtcpb", "smeansz", "dmeansz", "trans_depth", "res_bdy_len",
        "Sjit", "Djit", "Stime", "Ltime", "Sintpkt", "Dintpkt", "tcprtt", "synack", "ackdat",
        "is_sm_ips_ports", "ct_state_ttl", "ct_flw_http_mthd", "is_ftp_login", "ct_ftp_cmd",
        "ct_srv_src", "ct_srv_dst", "ct_dst_ltm", "ct_src_ltm", "ct_src_dport_ltm",
        "ct_dst_sport_ltm", "ct_dst_src_ltm", "attack_cat", "Label"
    ]
    
    print(f"Loading raw data from {file_path}...")
    df = pd.read_csv(file_path, header=None, names=unsw_headers)
    
    if sample_size and len(df) > sample_size:
        print(f"Sampling {sample_size} rows from {len(df)} total rows...")
        df = df.sample(n=sample_size, random_state=42)
    
    return df


def load_processed_unsw_data(train_path: Path, test_path: Path) -> pd.DataFrame:
    """Load the preprocessed training and testing sets."""
    print(f"Loading processed training data from {train_path}...")
    train_df = pd.read_csv(train_path)
    
    print(f"Loading processed testing data from {test_path}...")
    test_df = pd.read_csv(test_path)
    
    # Combine them
    df = pd.concat([train_df, test_df], ignore_index=True)
    return df


def harmonize_columns(raw_df: pd.DataFrame, processed_df: pd.DataFrame) -> pd.DataFrame:
    """
    Harmonize raw and processed data to create a unified dataset.
    This function aligns column names and computes missing features.
    """
    
    # * Map raw column names to processed format
    column_mapping = {
        # Raw format uses different capitalization
        "Spkts": "spkts",
        "Dpkts": "dpkts",
        "Sload": "sload",
        "Dload": "dload",
        "Sjit": "sjit",
        "Djit": "djit",
        "Sintpkt": "sinpkt",
        "Dintpkt": "dinpkt",
        "smeansz": "smean",
        "dmeansz": "dmean",
        "res_bdy_len": "response_body_len",
        "Stime": "timestamp",  # ! Important: preserve timestamp
        "Ltime": "last_time",
        "Label": "label",
        "proto": "protocol_type",
        "state": "flag",
        "sport": "src_port",
        "dsport": "dst_port",
        "srcip": "src_ip",
        "dstip": "dst_ip",
    }
    
    # Rename columns in raw data
    raw_df = raw_df.rename(columns=column_mapping)
    
    # * Compute missing 'rate' feature if not present
    if "rate" not in raw_df.columns and all(col in raw_df.columns for col in ["sbytes", "dbytes", "dur"]):
        print("Computing 'rate' feature...")
        epsilon = 1e-9
        total_bytes = raw_df["sbytes"] + raw_df["dbytes"]
        raw_df["rate"] = total_bytes / (raw_df["dur"] + epsilon)
        raw_df["rate"] = raw_df["rate"].clip(upper=1e10)
    
    # * Add synthetic timestamps to processed data
    if "timestamp" not in processed_df.columns and "timestamp" in raw_df.columns:
        print("Adding synthetic timestamps to processed data...")
        # Use timestamp range from raw data
        min_ts = raw_df["timestamp"].min()
        max_ts = raw_df["timestamp"].max()
        # Distribute processed data timestamps evenly across the range
        n_processed = len(processed_df)
        timestamps = np.linspace(min_ts, max_ts, n_processed)
        # Add some noise to make it more realistic
        noise = np.random.normal(0, (max_ts - min_ts) / (n_processed * 10), n_processed)
        processed_df["timestamp"] = timestamps + noise
    
    # * Ensure both datasets have the same columns
    # Get common columns
    common_cols = list(set(raw_df.columns) & set(processed_df.columns))
    
    # Add missing columns with default values
    for col in processed_df.columns:
        if col not in raw_df.columns:
            print(f"Adding missing column '{col}' to raw data...")
            if col == "id":
                raw_df[col] = range(len(raw_df))
            else:
                # Use median for numeric, mode for categorical
                if processed_df[col].dtype in ['float64', 'int64']:
                    raw_df[col] = processed_df[col].median()
                else:
                    raw_df[col] = processed_df[col].mode()[0] if len(processed_df[col].mode()) > 0 else "unknown"
    
    for col in raw_df.columns:
        if col not in processed_df.columns:
            print(f"Adding missing column '{col}' to processed data...")
            if raw_df[col].dtype in ['float64', 'int64']:
                processed_df[col] = raw_df[col].median()
            else:
                processed_df[col] = raw_df[col].mode()[0] if len(raw_df[col].mode()) > 0 else "unknown"
    
    return raw_df, processed_df


def create_combined_dataset(raw_df: pd.DataFrame, processed_df: pd.DataFrame, 
                          raw_ratio: float = 0.3) -> pd.DataFrame:
    """
    Combine raw and processed data in a specified ratio.
    This helps the model learn from both high-quality processed data
    and timestamp-rich raw data.
    """
    
    # Sample from each dataset
    n_raw = int(len(raw_df) * raw_ratio)
    n_processed = len(processed_df)
    
    # Balance the classes when sampling
    if "label" in raw_df.columns:
        # Stratified sampling from raw data
        raw_sample = raw_df.groupby("label", group_keys=False).apply(
            lambda x: x.sample(min(len(x), n_raw // 2), random_state=42)
        )
    else:
        raw_sample = raw_df.sample(n=min(n_raw, len(raw_df)), random_state=42)
    
    print(f"Using {len(raw_sample)} raw samples and {n_processed} processed samples")
    
    # Combine datasets
    combined = pd.concat([processed_df, raw_sample], ignore_index=True)
    
    # Shuffle the combined dataset
    combined = combined.sample(frac=1, random_state=42).reset_index(drop=True)
    
    return combined


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Additional feature engineering for better model performance."""
    
    # * Handle missing values
    numeric_columns = df.select_dtypes(include=['float64', 'int64']).columns
    categorical_columns = df.select_dtypes(include=['object']).columns
    
    # Fill numeric NaNs with median
    for col in numeric_columns:
        if col != 'label' and col != 'timestamp':
            df[col] = df[col].fillna(df[col].median())
    
    # Fill categorical NaNs with mode or 'unknown'
    for col in categorical_columns:
        if col != 'attack_cat':
            mode_val = df[col].mode()
            if len(mode_val) > 0:
                df[col] = df[col].fillna(mode_val[0])
            else:
                df[col] = df[col].fillna('unknown')
    
    # * Ensure consistent data types for all columns
    # Convert mixed-type columns to strings
    for col in df.columns:
        if col not in ['label', 'timestamp'] and df[col].dtype == 'object':
            # Check if column has mixed types
            try:
                df[col] = df[col].astype(str)
            except:
                pass
    
    # * Create additional time-based features if timestamp exists
    if 'timestamp' in df.columns:
        print("Creating time-based features...")
        df['hour'] = (df['timestamp'] % 86400) // 3600  # Hour of day
        df['day_segment'] = pd.cut(df['hour'], bins=[0, 6, 12, 18, 24], 
                                   labels=['night', 'morning', 'afternoon', 'evening'])
    
    return df


def main():
    parser = argparse.ArgumentParser(description="Train model with timestamp-aware data")
    parser.add_argument("--raw-data", required=True, help="Path to raw UNSW-NB15 CSV file")
    parser.add_argument("--train-data", required=True, help="Path to processed training set")
    parser.add_argument("--test-data", required=True, help="Path to processed testing set")
    parser.add_argument("--output", default="models/timestamp_model", help="Output directory for model")
    parser.add_argument("--sample-size", type=int, default=100000, help="Sample size from raw data")
    parser.add_argument("--raw-ratio", type=float, default=0.3, help="Ratio of raw data to use (0-1)")
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load data
    print("\n=== Loading Data ===")
    raw_df = load_raw_unsw_data(Path(args.raw_data), args.sample_size)
    processed_df = load_processed_unsw_data(Path(args.train_data), Path(args.test_data))
    
    print(f"Raw data shape: {raw_df.shape}")
    print(f"Processed data shape: {processed_df.shape}")
    
    # Harmonize columns
    print("\n=== Harmonizing Data ===")
    raw_df, processed_df = harmonize_columns(raw_df, processed_df)
    
    # Combine datasets
    print("\n=== Combining Datasets ===")
    combined_df = create_combined_dataset(raw_df, processed_df, args.raw_ratio)
    
    # Prepare features
    print("\n=== Preparing Features ===")
    combined_df = prepare_features(combined_df)
    
    # Split features and target
    target_col = 'label'
    feature_cols = [col for col in combined_df.columns 
                   if col not in [target_col, 'attack_cat', 'id', 'src_ip', 'dst_ip']]
    
    X = combined_df[feature_cols]
    y = combined_df[target_col]
    
    print(f"\nFeature shape: {X.shape}")
    print(f"Target distribution:\n{y.value_counts()}")
    
    # Identify feature types
    numeric_features = X.select_dtypes(include=['int64', 'float64']).columns.tolist()
    categorical_features = X.select_dtypes(include=['object']).columns.tolist()
    
    # Remove timestamp from training features but keep it for later use
    if 'timestamp' in numeric_features:
        numeric_features.remove('timestamp')
        timestamp_col = X['timestamp'].copy()
        X = X.drop(columns=['timestamp'])
    else:
        timestamp_col = None
    
    print(f"\nNumeric features: {len(numeric_features)}")
    print(f"Categorical features: {len(categorical_features)}")
    
    # Create preprocessing pipeline
    print("\n=== Building Model Pipeline ===")
    
    numeric_transformer = StandardScaler()
    categorical_transformer = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_features),
            ('cat', categorical_transformer, categorical_features)
        ]
    )
    
    # Use RandomForest with good hyperparameters
    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        max_features='sqrt',
        class_weight='balanced',  # Handle class imbalance
        random_state=42,
        n_jobs=-1
    )
    
    # Create full pipeline
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('classifier', clf)
    ])
    
    # Cross-validation
    print("\n=== Cross-Validation ===")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    # Get cross-validated predictions
    y_pred = cross_val_predict(pipeline, X, y, cv=cv, n_jobs=-1)
    y_scores = cross_val_predict(pipeline, X, y, cv=cv, n_jobs=-1, method='predict_proba')
    
    # Calculate metrics
    from sklearn.metrics import classification_report, confusion_matrix
    print("\nClassification Report:")
    print(classification_report(y, y_pred))
    
    # For binary classification, calculate PR and ROC curves
    if len(np.unique(y)) == 2:
        # Assuming 1 is the positive class (attack)
        pos_label = 1
        y_binary = (y == pos_label).astype(int)
        y_scores_pos = y_scores[:, 1] if y_scores.ndim > 1 else y_scores
        
        ap = average_precision_score(y_binary, y_scores_pos)
        auc = roc_auc_score(y_binary, y_scores_pos)
        
        print(f"\nAverage Precision: {ap:.3f}")
        print(f"ROC AUC: {auc:.3f}")
    
    # Train final model on all data
    print("\n=== Training Final Model ===")
    pipeline.fit(X, y)
    
    # Save model and metadata
    print("\n=== Saving Model ===")
    model_path = output_dir / "pipeline.joblib"
    dump(pipeline, model_path)
    
    # Save metadata
    meta = {
        "task": "binary",
        "target": target_col,
        "classes": [int(c) for c in sorted(y.unique())],
        "positive_label": 1,
        "feature_numeric": numeric_features,
        "feature_categorical": categorical_features,
        "has_timestamp": timestamp_col is not None,
        "data_info": {
            "raw_samples": len(raw_df),
            "processed_samples": len(processed_df),
            "combined_samples": len(combined_df),
            "raw_ratio": args.raw_ratio
        },
        "performance": {
            "average_precision": float(ap) if 'ap' in locals() else None,
            "roc_auc": float(auc) if 'auc' in locals() else None
        },
        "timestamp": time.strftime("%Y%m%d_%H%M%S"),
        "versions": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "sklearn": importlib.import_module("sklearn").__version__
        }
    }
    
    meta_path = output_dir / "meta.json"
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    
    print(f"\nModel saved to: {model_path}")
    print(f"Metadata saved to: {meta_path}")
    
    # Save sample of combined data for verification
    sample_path = output_dir / "training_sample.csv"
    combined_df.head(1000).to_csv(sample_path, index=False)
    print(f"Training sample saved to: {sample_path}")


if __name__ == "__main__":
    main()
