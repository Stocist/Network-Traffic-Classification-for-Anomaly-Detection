from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform

import pandas as pd
from joblib import load


def parse_args():
    p = argparse.ArgumentParser(description="Load a persisted pipeline and run predictions on a CSV")
    p.add_argument("--model", required=True, help="Path to .joblib pipeline")
    p.add_argument("--data", required=True, help="Path to input CSV with same schema as training features")
    p.add_argument("--meta", default=None, help="Optional path to meta.json (defaults to alongside model)")
    p.add_argument("--out", default=None, help="Optional output CSV to save predictions")
    return p.parse_args()


def main():
    args = parse_args()
    model_path = Path(args.model)
    pipe = load(model_path)
    df = pd.read_csv(args.data)

    # Optional schema alignment using meta.json
    meta_path = Path(args.meta) if args.meta else model_path.parent / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            req_num = meta.get("feature_numeric", [])
            req_cat = meta.get("feature_categorical", [])
            needed = list(req_num) + list(req_cat)
            for c in needed:
                if c not in df.columns:
                    df[c] = pd.NA
            # Reorder columns to place required features first; keep extras at end
            extras = [c for c in df.columns if c not in needed]
            df = df[needed + extras]
            # Soft warn on Python version mismatch (major.minor)
            versions = meta.get("versions", {})
            trained_py = str(versions.get("python", "")).split(".")[:2]
            cur_py = platform.python_version().split(".")[:2]
            if trained_py and trained_py != cur_py:
                print(f"[warn] Python version differs (trained {versions.get('python')} vs runtime {platform.python_version()}).", flush=True)
        except Exception:
            pass

    preds = pipe.predict(df)
    outpath = Path(args.out) if args.out else Path(args.data).with_suffix("")
    if outpath.is_dir() or args.out is None:
        outpath = Path(args.data).with_name(Path(args.data).stem + "_preds.csv")
    out_df = df.copy()
    out_df["prediction"] = preds
    out_df.to_csv(outpath, index=False)
    print(f"Saved predictions to {outpath}")


if __name__ == "__main__":
    main()
