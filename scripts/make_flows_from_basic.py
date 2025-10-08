#!/usr/bin/env python
from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Process convenor 4Network basic dataset into training-ready CSVs")
    p.add_argument("--basic", required=True, help="Path to 4Network/basic_data_4.csv")
    p.add_argument("--label-map", required=True, help="Path to 4Network/label_category_map.csv")
    p.add_argument("--outdir", default="data_processed", help="Output directory for processed artifacts")
    return p.parse_args()


def main():
    args = parse_args()
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.basic)
    lm = pd.read_csv(args.label_map)

    # Ensure expected categoricals exist and are normalized
    for c in ["protocol_type", "service", "flag"]:
        if c not in df.columns:
            df[c] = "UNK"
        df[c] = df[c].fillna("UNK").replace(["", "-"], "UNK")

    # Basic sanity: label must exist
    if "label" not in df.columns:
        raise SystemExit("Expected a 'label' column in the basic dataset.")

    # Save processed artifacts
    out_csv = outdir / "basic_flows_clean.csv"
    df.to_csv(out_csv, index=False)

    lm_out = outdir / "basic_label_category_map.csv"
    lm.to_csv(lm_out, index=False)

    print(f"Saved {out_csv} shape={df.shape}")
    print(f"Saved {lm_out} shape={lm.shape}")


if __name__ == "__main__":
    main()


