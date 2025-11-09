#!/usr/bin/env python3
"""
Improved training script for UNSW-NB15 that properly utilizes all available data files:
- UNSW-NB15_1-4.csv: Raw network flow data
- NUSW-NB15_GT.csv: Ground truth with timestamps and attack details
- UNSW_NB15_training-set.csv: Preprocessed training data
- UNSW_NB15_testing-set.csv: Preprocessed testing data
"""

from __future__ import annotations

import argparse
import json
import time
import platform
import importlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.metrics import classification_report, average_precision_score, roc_auc_score, precision_recall_curve
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer


def load_ground_truth(gt_path: Path) -> pd.DataFrame:
    """Load the ground truth file with attack information and timestamps."""
    print(f"Loading ground truth from {gt_path}...")
    
    # GT file has different column structure
    gt_df = pd.read_csv(gt_path)
    
    # Rename columns to match our expected format
    gt_df = gt_df.rename(columns={
        'Start time': 'Stime',
        'Last time': 'Ltime',
        'Attack category': 'attack_cat',
        'Attack subcategory': 'attack_subcat',
        'Protocol': 'proto',
        'Source IP': 'srcip',
        'Source Port': 'sport',
        'Destination IP': 'dstip',
        'Destination Port': 'dsport',
        'Attack Name': 'attack_name'
    })
    
    # Add label column (1 for all entries in GT as they're all attacks)
    gt_df['label'] = 1
    
    print(f"Ground truth shape: {gt_df.shape}")
    print(f"Attack categories: {gt_df['attack_cat'].value_counts().head()}")
    
    return gt_df


def load_raw_flows(raw_paths: List[Path], sample_size: Optional[int] = None) -> pd.DataFrame:
    """Load raw UNSW-NB15 flow data files."""
    
    # Headers for raw UNSW-NB15 files (from features.csv)
    raw_headers = [
        "srcip", "sport", "dstip", "dsport", "proto", "state", "dur", "sbytes", "dbytes",
        "sttl", "dttl", "sloss", "dloss", "service", "Sload", "Dload", "Spkts", "Dpkts",
        "swin", "dwin", "stcpb", "dtcpb", "smeansz", "dmeansz", "trans_depth", "res_bdy_len",
        "Sjit", "Djit", "Stime", "Ltime", "Sintpkt", "Dintpkt", "tcprtt", "synack", "ackdat",
        "is_sm_ips_ports", "ct_state_ttl", "ct_flw_http_mthd", "is_ftp_login", "ct_ftp_cmd",
        "ct_srv_src", "ct_srv_dst", "ct_dst_ltm", "ct_src_ltm", "ct_src_dport_ltm",
        "ct_dst_sport_ltm", "ct_dst_src_ltm", "attack_cat", "Label"
    ]
    
    all_flows = []
    
    for path in raw_paths:
        if path.exists():
            print(f"Loading raw flows from {path}...")
            df = pd.read_csv(path, header=None, names=raw_headers)
            all_flows.append(df)
    
    if not all_flows:
        raise ValueError("No raw flow files found!")
    
    combined = pd.concat(all_flows, ignore_index=True)
    
    # Sample if needed
    if sample_size and len(combined) > sample_size:
        print(f"Sampling {sample_size} rows from {len(combined)} total rows...")
        combined = combined.sample(n=sample_size, random_state=42)
    
    print(f"Total raw flows loaded: {len(combined)}")
    
    return combined


def merge_with_ground_truth(flows_df: pd.DataFrame, gt_df: pd.DataFrame) -> pd.DataFrame:
    """
    Merge raw flows with ground truth to get accurate labels and attack categories.
    Match based on timestamp, IPs, and ports.
    """
    print("Merging flows with ground truth...")
    
    # Create a key for matching in ground truth
    gt_df['match_key'] = (
        gt_df['Stime'].astype(str) + '_' +
        gt_df['srcip'].astype(str) + '_' +
        gt_df['sport'].astype(str) + '_' +
        gt_df['dstip'].astype(str) + '_' +
        gt_df['dsport'].astype(str)
    )
    
    # Create a key for matching in flows
    flows_df['match_key'] = (
        flows_df['Stime'].astype(str) + '_' +
        flows_df['srcip'].astype(str) + '_' +
        flows_df['sport'].astype(str) + '_' +
        flows_df['dstip'].astype(str) + '_' +
        flows_df['dsport'].astype(str)
    )
    
    # Create a set of attack keys for fast lookup
    attack_keys = set(gt_df['match_key'])
    
    # Update labels based on ground truth
    flows_df['is_attack'] = flows_df['match_key'].isin(attack_keys).astype(int)
    
    # Merge to get attack categories for attack flows
    flows_df = flows_df.merge(
        gt_df[['match_key', 'attack_cat', 'attack_subcat']].drop_duplicates(),
        on='match_key',
        how='left',
        suffixes=('', '_gt')
    )
    
    # Use ground truth attack_cat where available
    if 'attack_cat_gt' in flows_df.columns:
        flows_df['attack_cat'] = flows_df['attack_cat_gt'].fillna(flows_df['attack_cat'])
        flows_df = flows_df.drop(columns=['attack_cat_gt'])
    
    # Clean up
    flows_df = flows_df.drop(columns=['match_key'])
    
    # Update the Label column to match ground truth
    flows_df['Label'] = flows_df['is_attack']
    
    print(f"After merging - Attacks: {flows_df['Label'].sum()}, Normal: {(flows_df['Label'] == 0).sum()}")
    
    return flows_df


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Prepare and engineer features for training."""
    
    # * Compute rate feature if missing
    if 'rate' not in df.columns:
        epsilon = 1e-9
        total_bytes = df['sbytes'].fillna(0) + df['dbytes'].fillna(0)
        df['rate'] = total_bytes / (df['dur'].fillna(epsilon) + epsilon)
        df['rate'] = df['rate'].clip(upper=1e10)
    
    # * Create time-based features from timestamps
    if 'Stime' in df.columns:
        df['hour'] = (df['Stime'] % 86400) // 3600
        df['day_part'] = pd.cut(df['hour'], bins=[-1, 6, 12, 18, 24], 
                                labels=['night', 'morning', 'afternoon', 'evening'])
        
        # Time difference between start and last
        if 'Ltime' in df.columns:
            df['duration_from_times'] = df['Ltime'] - df['Stime']
    
    # * Fix column names to match model expectations
    column_mapping = {
        'Label': 'label',
        'Stime': 'timestamp',
        'Spkts': 'spkts',
        'Dpkts': 'dpkts',
        'Sload': 'sload',
        'Dload': 'dload',
        'Sjit': 'sjit',
        'Djit': 'djit',
        'Sintpkt': 'sinpkt',
        'Dintpkt': 'dinpkt',
        'smeansz': 'smean',
        'dmeansz': 'dmean',
        'res_bdy_len': 'response_body_len',
        'proto': 'protocol_type',
        'state': 'flag',
        'sport': 'src_port',
        'dsport': 'dst_port'
    }
    
    df = df.rename(columns=column_mapping)
    
    # * Handle data types
    # Ensure consistent types for categorical columns
    categorical_cols = ['protocol_type', 'flag', 'service', 'attack_cat', 'attack_subcat', 'day_part']
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).replace('nan', 'unknown')
    
    # Ensure numeric columns are numeric (including ports)
    numeric_cols = ['dur', 'sbytes', 'dbytes', 'rate', 'sttl', 'dttl', 'sloss', 'dloss',
                   'sload', 'dload', 'spkts', 'dpkts', 'swin', 'dwin', 'sjit', 'djit',
                   'sinpkt', 'dinpkt', 'tcprtt', 'synack', 'ackdat', 'smean', 'dmean',
                   'trans_depth', 'response_body_len', 'src_port', 'dst_port', 'hour']
    
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    return df


def combine_datasets(raw_flows: pd.DataFrame, train_df: pd.DataFrame, 
                    test_df: pd.DataFrame, use_ratio: Dict[str, float]) -> pd.DataFrame:
    """
    Combine raw flows with preprocessed training/testing data.
    
    use_ratio: Dict with keys 'raw', 'train', 'test' indicating proportion to use
    """
    datasets = []
    
    # Sample from raw flows
    if use_ratio.get('raw', 0) > 0:
        n_raw = int(len(raw_flows) * use_ratio['raw'])
        # Stratified sampling to maintain class balance
        raw_sample = raw_flows.groupby('label', group_keys=False).apply(
            lambda x: x.sample(min(len(x), n_raw // 2), random_state=42)
        )
        datasets.append(raw_sample)
        print(f"Using {len(raw_sample)} raw flow samples")
    
    # Use training data
    if use_ratio.get('train', 0) > 0:
        n_train = int(len(train_df) * use_ratio['train'])
        train_sample = train_df.sample(n=min(n_train, len(train_df)), random_state=42)
        datasets.append(train_sample)
        print(f"Using {len(train_sample)} training samples")
    
    # Use testing data
    if use_ratio.get('test', 0) > 0:
        n_test = int(len(test_df) * use_ratio['test'])
        test_sample = test_df.sample(n=min(n_test, len(test_df)), random_state=42)
        datasets.append(test_sample)
        print(f"Using {len(test_sample)} testing samples")
    
    # Combine all datasets
    combined = pd.concat(datasets, ignore_index=True)
    
    # Shuffle
    combined = combined.sample(frac=1, random_state=42).reset_index(drop=True)
    
    print(f"Combined dataset size: {len(combined)}")
    print(f"Label distribution:\n{combined['label'].value_counts()}")
    
    return combined


def build_pipeline(numeric_features: List[str], categorical_features: List[str]) -> Pipeline:
    """Build the preprocessing and classification pipeline."""
    
    # Numeric preprocessing: impute then scale
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    # Categorical preprocessing: impute then one-hot encode
    categorical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='constant', fill_value='unknown')),
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    # Combine preprocessing
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_features),
            ('cat', categorical_transformer, categorical_features)
        ]
    )
    
    # Full pipeline with classifier
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(
            n_estimators=300,
            max_depth=20,
            min_samples_split=5,
            min_samples_leaf=2,
            max_features='sqrt',
            class_weight='balanced',
            random_state=42,
            n_jobs=-1
        ))
    ])
    
    return pipeline


def evaluate_model(pipeline: Pipeline, X: pd.DataFrame, y: pd.Series, cv_folds: int = 5):
    """Evaluate model using cross-validation."""
    
    print("\n=== Cross-Validation ===")
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
    
    # Get predictions
    y_pred = cross_val_predict(pipeline, X, y, cv=cv, n_jobs=-1)
    y_scores = cross_val_predict(pipeline, X, y, cv=cv, n_jobs=-1, method='predict_proba')
    
    # Classification report
    print("\nClassification Report:")
    print(classification_report(y, y_pred))
    
    # Binary classification metrics
    if len(np.unique(y)) == 2:
        y_binary = (y == 1).astype(int)
        y_scores_pos = y_scores[:, 1] if y_scores.ndim > 1 else y_scores
        
        # Calculate PR curve metrics
        precision, recall, thresholds = precision_recall_curve(y_binary, y_scores_pos)
        
        # Average precision (area under PR curve)
        ap = average_precision_score(y_binary, y_scores_pos)
        
        # ROC AUC
        auc = roc_auc_score(y_binary, y_scores_pos)
        
        # Find optimal threshold for F1
        f1_scores = 2 * (precision * recall) / (precision + recall + 1e-10)
        best_f1_idx = np.argmax(f1_scores[:-1])  # Exclude last point
        best_threshold = thresholds[best_f1_idx] if best_f1_idx < len(thresholds) else 0.5
        best_f1 = f1_scores[best_f1_idx]
        
        print(f"\n=== PR Curve Metrics ===")
        print(f"Average Precision: {ap:.3f}")
        print(f"ROC AUC: {auc:.3f}")
        print(f"Best F1 Score: {best_f1:.3f} at threshold {best_threshold:.3f}")
        print(f"Precision at best F1: {precision[best_f1_idx]:.3f}")
        print(f"Recall at best F1: {recall[best_f1_idx]:.3f}")
        
        return {
            'average_precision': float(ap),
            'roc_auc': float(auc),
            'best_f1': float(best_f1),
            'best_threshold': float(best_threshold)
        }
    
    return {}


def main():
    parser = argparse.ArgumentParser(description="Train improved model with all UNSW-NB15 data")
    parser.add_argument("--data-dir", required=True, help="Path to UNSW-NB15 CSV Files directory")
    parser.add_argument("--output", default="models/improved_model", help="Output directory")
    parser.add_argument("--sample-size", type=int, default=200000, help="Max samples from raw data")
    parser.add_argument("--use-raw", type=float, default=0.2, help="Proportion of raw data to use")
    parser.add_argument("--use-train", type=float, default=1.0, help="Proportion of training set to use")
    parser.add_argument("--use-test", type=float, default=1.0, help="Proportion of test set to use")
    args = parser.parse_args()
    
    # Setup paths
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load ground truth
    gt_path = data_dir / "NUSW-NB15_GT.csv"
    gt_df = load_ground_truth(gt_path)
    
    # Load raw flow files
    raw_paths = [
        data_dir / "UNSW-NB15_1.csv",
        data_dir / "UNSW-NB15_2.csv",
        data_dir / "UNSW-NB15_3.csv",
        data_dir / "UNSW-NB15_4.csv"
    ]
    raw_flows = load_raw_flows([p for p in raw_paths if p.exists()], args.sample_size)
    
    # Merge with ground truth for accurate labels
    raw_flows = merge_with_ground_truth(raw_flows, gt_df)
    
    # Load preprocessed datasets
    train_path = data_dir / "Training and Testing Sets" / "UNSW_NB15_training-set.csv"
    test_path = data_dir / "Training and Testing Sets" / "UNSW_NB15_testing-set.csv"
    
    print(f"\nLoading preprocessed training data from {train_path}...")
    train_df = pd.read_csv(train_path)
    
    print(f"Loading preprocessed testing data from {test_path}...")
    test_df = pd.read_csv(test_path)
    
    # Prepare features for all datasets
    print("\n=== Preparing Features ===")
    raw_flows = prepare_features(raw_flows)
    train_df = prepare_features(train_df)
    test_df = prepare_features(test_df)
    
    # Combine datasets
    print("\n=== Combining Datasets ===")
    use_ratio = {
        'raw': args.use_raw,
        'train': args.use_train,
        'test': args.use_test
    }
    combined_df = combine_datasets(raw_flows, train_df, test_df, use_ratio)
    
    # Select features for training
    # Exclude non-feature columns
    exclude_cols = ['label', 'attack_cat', 'attack_subcat', 'attack_name', 
                   'srcip', 'dstip', 'src_ip', 'dst_ip', 'id', 'timestamp', 'Ltime']
    
    feature_cols = [col for col in combined_df.columns if col not in exclude_cols]
    
    # Separate numeric and categorical features
    # IMPORTANT: Explicitly define categorical features to avoid misclassification
    categorical_features = ['protocol_type', 'flag', 'service', 'day_part']
    categorical_features = [f for f in categorical_features if f in feature_cols]
    
    # Everything else that's numeric
    numeric_features = [f for f in feature_cols if f not in categorical_features 
                       and combined_df[f].dtype in ['int64', 'float64']]
    
    # Ensure ct_ftp_cmd is treated as numeric if it exists and is not already
    if 'ct_ftp_cmd' in categorical_features and 'ct_ftp_cmd' in combined_df.columns:
        # Convert to numeric
        combined_df['ct_ftp_cmd'] = pd.to_numeric(combined_df['ct_ftp_cmd'], errors='coerce').fillna(0)
        categorical_features.remove('ct_ftp_cmd')
        if 'ct_ftp_cmd' not in numeric_features:
            numeric_features.append('ct_ftp_cmd')
    
    print(f"\nNumeric features ({len(numeric_features)}): {numeric_features[:5]}...")
    print(f"Categorical features ({len(categorical_features)}): {categorical_features}")
    
    # Prepare data for training
    X = combined_df[feature_cols]
    y = combined_df['label']
    
    # Build pipeline
    print("\n=== Building Pipeline ===")
    pipeline = build_pipeline(numeric_features, categorical_features)
    
    # Evaluate model
    metrics = evaluate_model(pipeline, X, y)
    
    # Train final model on all data
    print("\n=== Training Final Model ===")
    pipeline.fit(X, y)
    
    # Save model
    model_path = output_dir / "pipeline.joblib"
    dump(pipeline, model_path)
    print(f"Model saved to: {model_path}")
    
    # Save metadata
    meta = {
        "task": "binary",
        "target": "label",
        "classes": [0, 1],
        "positive_label": 1,
        "feature_numeric": numeric_features,
        "feature_categorical": categorical_features,
        "has_timestamp": 'timestamp' in combined_df.columns,
        "data_info": {
            "ground_truth_attacks": len(gt_df),
            "raw_samples": len(raw_flows),
            "train_samples": len(train_df),
            "test_samples": len(test_df),
            "combined_samples": len(combined_df),
            "use_ratio": use_ratio
        },
        "performance": metrics,
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
    print(f"Metadata saved to: {meta_path}")
    
    # Save sample of data for verification
    sample_path = output_dir / "training_sample.csv"
    combined_df.head(1000).to_csv(sample_path, index=False)
    print(f"Training sample saved to: {sample_path}")
    
    print("\n=== Training Complete ===")
    if metrics:
        print(f"Final Average Precision: {metrics['average_precision']:.3f}")


if __name__ == "__main__":
    main()
