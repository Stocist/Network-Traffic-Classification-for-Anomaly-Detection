#!/usr/bin/env python3
"""
Create proper training and testing datasets from raw UNSW-NB15 files.
These will include all features needed: timestamps, ports, and proper labels from ground truth.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
import argparse


def load_ground_truth(gt_path: Path) -> pd.DataFrame:
    """Load ground truth with attack information."""
    print("Loading ground truth...")
    gt_df = pd.read_csv(gt_path)
    
    # Create a matching key
    gt_df['match_key'] = (
        gt_df['Start time'].astype(str) + '_' +
        gt_df['Source IP'].astype(str) + '_' +
        gt_df['Source Port'].astype(str) + '_' +
        gt_df['Destination IP'].astype(str) + '_' +
        gt_df['Destination Port'].astype(str)
    )
    
    return gt_df


def load_and_merge_raw_data(data_dir: Path, gt_df: pd.DataFrame, max_rows: int = None) -> pd.DataFrame:
    """Load raw UNSW-NB15 files and merge with ground truth."""
    
    # Headers for raw files
    raw_headers = [
        "srcip", "sport", "dstip", "dsport", "proto", "state", "dur", "sbytes", "dbytes",
        "sttl", "dttl", "sloss", "dloss", "service", "Sload", "Dload", "Spkts", "Dpkts",
        "swin", "dwin", "stcpb", "dtcpb", "smeansz", "dmeansz", "trans_depth", "res_bdy_len",
        "Sjit", "Djit", "Stime", "Ltime", "Sintpkt", "Dintpkt", "tcprtt", "synack", "ackdat",
        "is_sm_ips_ports", "ct_state_ttl", "ct_flw_http_mthd", "is_ftp_login", "ct_ftp_cmd",
        "ct_srv_src", "ct_srv_dst", "ct_dst_ltm", "ct_src_ltm", "ct_src_dport_ltm",
        "ct_dst_sport_ltm", "ct_dst_src_ltm", "attack_cat", "Label"
    ]
    
    # Load all raw files
    all_data = []
    for i in range(1, 5):
        file_path = data_dir / f"UNSW-NB15_{i}.csv"
        if file_path.exists():
            print(f"Loading {file_path}...")
            df = pd.read_csv(file_path, header=None, names=raw_headers, 
                           dtype={'sport': 'object', 'dsport': 'object'})
            all_data.append(df)
    
    # Combine all data
    combined_df = pd.concat(all_data, ignore_index=True)
    
    # Sample if needed
    if max_rows and len(combined_df) > max_rows:
        print(f"Sampling {max_rows} rows from {len(combined_df)} total...")
        combined_df = combined_df.sample(n=max_rows, random_state=42)
    
    # Create matching key
    combined_df['match_key'] = (
        combined_df['Stime'].astype(str) + '_' +
        combined_df['srcip'].astype(str) + '_' +
        combined_df['sport'].astype(str) + '_' +
        combined_df['dstip'].astype(str) + '_' +
        combined_df['dsport'].astype(str)
    )
    
    # Get attack keys from ground truth
    attack_keys = set(gt_df['match_key'])
    
    # Update labels based on ground truth
    print("Updating labels from ground truth...")
    combined_df['label'] = combined_df['match_key'].isin(attack_keys).astype(int)
    
    # Merge attack categories from ground truth
    combined_df = combined_df.merge(
        gt_df[['match_key', 'Attack category']].drop_duplicates(),
        on='match_key',
        how='left'
    )
    
    # Update attack_cat with ground truth values
    combined_df['attack_cat'] = combined_df['Attack category'].fillna(combined_df['attack_cat'])
    combined_df['attack_cat'] = combined_df['attack_cat'].fillna('Normal')
    
    # Drop temporary columns
    combined_df = combined_df.drop(columns=['match_key', 'Attack category'])
    
    print(f"Final dataset shape: {combined_df.shape}")
    print(f"Label distribution:\n{combined_df['label'].value_counts()}")
    
    return combined_df


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Prepare features for the model."""
    
    # Convert ports to numeric
    df['sport'] = pd.to_numeric(df['sport'], errors='coerce').fillna(0).astype(int)
    df['dsport'] = pd.to_numeric(df['dsport'], errors='coerce').fillna(0).astype(int)
    
    # Compute rate feature
    epsilon = 1e-9
    total_bytes = df['sbytes'] + df['dbytes']
    df['rate'] = total_bytes / (df['dur'] + epsilon)
    df['rate'] = df['rate'].clip(upper=1e10)
    
    # Rename columns to match expected format
    df = df.rename(columns={
        'sport': 'src_port',
        'dsport': 'dst_port',
        'proto': 'protocol_type',
        'state': 'flag',
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
        'Stime': 'timestamp',
        'Ltime': 'last_time'
    })
    
    # Add time-based features
    df['hour'] = (df['timestamp'] % 86400) // 3600
    df['day_part'] = pd.cut(df['hour'], bins=[-1, 6, 12, 18, 24], 
                            labels=['night', 'morning', 'afternoon', 'evening'])
    df['duration_from_times'] = df['last_time'] - df['timestamp']
    df['is_attack'] = df['label']  # For compatibility
    
    # Reorder columns to match the original training set format
    base_cols = [
        'dur', 'protocol_type', 'service', 'flag', 'spkts', 'dpkts', 'sbytes', 'dbytes',
        'rate', 'sttl', 'dttl', 'sload', 'dload', 'sloss', 'dloss', 'sinpkt', 'dinpkt',
        'sjit', 'djit', 'swin', 'dwin', 'stcpb', 'dtcpb', 'smean', 'dmean',
        'trans_depth', 'response_body_len', 'ct_srv_src', 'ct_state_ttl', 'ct_dst_ltm',
        'ct_src_dport_ltm', 'ct_dst_sport_ltm', 'ct_dst_src_ltm', 'is_ftp_login',
        'ct_ftp_cmd', 'ct_flw_http_mthd', 'ct_src_ltm', 'ct_srv_dst', 'is_sm_ips_ports',
        'attack_cat', 'label'
    ]
    
    # Add new features
    extra_cols = ['src_port', 'dst_port', 'timestamp', 'last_time', 'hour', 'day_part', 
                  'duration_from_times', 'is_attack']
    
    # Select columns that exist
    available_cols = [col for col in base_cols + extra_cols if col in df.columns]
    df = df[available_cols]
    
    return df


def main():
    parser = argparse.ArgumentParser(description="Create proper UNSW-NB15 datasets")
    parser.add_argument("--data-dir", required=True, help="Path to UNSW-NB15 CSV Files directory")
    parser.add_argument("--output-dir", default="data_processed", help="Output directory")
    parser.add_argument("--max-rows", type=int, default=500000, help="Maximum rows to process")
    parser.add_argument("--test-size", type=float, default=0.3, help="Test set proportion")
    args = parser.parse_args()
    
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load ground truth
    gt_path = data_dir / "NUSW-NB15_GT.csv"
    gt_df = load_ground_truth(gt_path)
    
    # Load and merge raw data
    full_df = load_and_merge_raw_data(data_dir, gt_df, args.max_rows)
    
    # Prepare features
    print("\nPreparing features...")
    full_df = prepare_features(full_df)
    
    # Split into training and testing
    print(f"\nSplitting data (test_size={args.test_size})...")
    train_df, test_df = train_test_split(
        full_df, 
        test_size=args.test_size,
        stratify=full_df['label'],
        random_state=42
    )
    
    print(f"Training set: {len(train_df)} rows")
    print(f"Testing set: {len(test_df)} rows")
    
    # Save datasets
    train_path = output_dir / "UNSW_NB15_training_with_timestamps.csv"
    test_path = output_dir / "UNSW_NB15_testing_with_timestamps.csv"
    
    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path, index=False)
    
    print(f"\nDatasets saved:")
    print(f"  Training: {train_path}")
    print(f"  Testing: {test_path}")
    
    # Save metadata
    metadata = {
        "total_rows": int(len(full_df)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "features": list(full_df.columns),
        "label_distribution": {
            "full": {str(k): int(v) for k, v in full_df['label'].value_counts().items()},
            "train": {str(k): int(v) for k, v in train_df['label'].value_counts().items()},
            "test": {str(k): int(v) for k, v in test_df['label'].value_counts().items()}
        },
        "attack_categories": {str(k): int(v) for k, v in full_df['attack_cat'].value_counts().items()}
    }
    
    import json
    meta_path = output_dir / "dataset_metadata.json"
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"  Metadata: {meta_path}")
    print("\nDone!")


if __name__ == "__main__":
    main()
