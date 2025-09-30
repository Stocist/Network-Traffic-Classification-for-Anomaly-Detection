from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import pandas as pd


@dataclass
class FeatureSpec:
    numeric: List[str]
    categorical: List[str]


def load_csvs(paths: List[str]) -> pd.DataFrame:
    frames = []
    for p in paths:
        df = pd.read_csv(p)
        frames.append(df)
    if not frames:
        raise ValueError("No input CSVs provided")
    return pd.concat(frames, axis=0, ignore_index=True)


def infer_feature_types(
    df: pd.DataFrame,
    target: str,
    categorical_cols: Optional[List[str]] = None,
) -> FeatureSpec:
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found in data columns: {list(df.columns)}")

    cat_set = set(categorical_cols or [])

    inferred_cat = set(df.select_dtypes(include=["object", "category"]).columns)

    categorical = []
    numeric = []
    for col in df.columns:
        if col == target:
            continue
        if col in cat_set or col in inferred_cat:
            categorical.append(col)
        else:
            numeric.append(col)

    return FeatureSpec(numeric=numeric, categorical=categorical)


def save_processed(df: pd.DataFrame, outdir: str | Path, name: str = "features") -> Path:
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"{name}.csv"
    df.to_csv(path, index=False)
    # Write a small manifest for reproducibility
    manifest = {
        "rows": len(df),
        "cols": list(df.columns),
    }
    (outdir / f"{name}.meta.json").write_text(json.dumps(manifest, indent=2))
    return path


def split_Xy(df: pd.DataFrame, target: str) -> Tuple[pd.DataFrame, pd.Series]:
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found")
    X = df.drop(columns=[target])
    y = df[target]
    return X, y

