from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score, davies_bouldin_score
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt

from .data_prep import load_csvs, infer_feature_types
from .pipeline import build_preprocessor


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Unsupervised clustering with KMeans/DBSCAN")
    p.add_argument("--data", nargs="+", required=True)
    p.add_argument("--target", default=None, help="Optional column to drop")
    p.add_argument("--categorical-cols", nargs="*", default=None)
    p.add_argument("--method", choices=["kmeans", "dbscan"], default="kmeans")
    p.add_argument("--k", nargs="*", type=int, default=[2,3,4,5,6,8,10])
    p.add_argument("--eps", nargs="*", type=float, default=[0.5, 1.0, 1.5])
    p.add_argument("--min-samples", nargs="*", type=int, default=[5, 10])
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--outdir", default="runs")
    p.add_argument("--run-name", default=None)
    return p.parse_args()


def main():
    args = parse_args()
    root = Path(args.outdir)
    root.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    run_name = args.run_name or f"cluster_{args.method}"
    run_dir = root / f"{ts}_{run_name}"
    figs_dir = run_dir / "figures"
    run_dir.mkdir(parents=True, exist_ok=True)
    figs_dir.mkdir(parents=True, exist_ok=True)

    df = load_csvs(args.data)
    if args.target and args.target in df.columns:
        df = df.drop(columns=[args.target])
    spec = infer_feature_types(df.assign(_dummy=0), target="_dummy", categorical_cols=args.categorical_cols)
    pre = build_preprocessor(spec.numeric, spec.categorical)
    X = pre.fit_transform(df)

    results = {}
    if args.method == "kmeans":
        best_score = -1
        best_k = None
        for k in args.k:
            km = KMeans(n_clusters=k, random_state=args.seed, n_init=10)
            labels = km.fit_predict(X)
            if len(set(labels)) < 2:
                continue
            sil = silhouette_score(X, labels)
            db = davies_bouldin_score(X, labels)
            results[str(k)] = {"silhouette": float(sil), "davies_bouldin": float(db)}
            if sil > best_score:
                best_score = sil
                best_k = k
        if best_k is not None:
            km = KMeans(n_clusters=best_k, random_state=args.seed, n_init=10)
            labels = km.fit_predict(X)
            # 2D PCA plot
            pca = PCA(n_components=2, random_state=args.seed)
            X2 = pca.fit_transform(X)
            fig, ax = plt.subplots(figsize=(6,5))
            ax.scatter(X2[:,0], X2[:,1], c=labels, s=6, cmap="tab10")
            ax.set_title(f"KMeans PCA view (k={best_k})")
            fig.tight_layout(); fig.savefig(figs_dir / f"kmeans_pca_k{best_k}.png", dpi=160); plt.close(fig)
    else:
        # DBSCAN grid
        best_db = np.inf
        best_cfg = None
        for eps in args.eps:
            for ms in args.min_samples:
                db = DBSCAN(eps=eps, min_samples=ms, n_jobs=-1)
                labels = db.fit_predict(X)
                n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
                if n_clusters < 2:
                    continue
                score = davies_bouldin_score(X, labels)
                results[f"eps={eps},ms={ms}"] = {"clusters": int(n_clusters), "davies_bouldin": float(score)}
                if score < best_db:
                    best_db = score
                    best_cfg = (eps, ms, labels)
        if best_cfg is not None:
            eps, ms, labels = best_cfg
            pca = PCA(n_components=2, random_state=args.seed)
            X2 = pca.fit_transform(X)
            fig, ax = plt.subplots(figsize=(6,5))
            ax.scatter(X2[:,0], X2[:,1], c=labels, s=6, cmap="tab20")
            ax.set_title(f"DBSCAN PCA view (eps={eps}, min_samples={ms})")
            fig.tight_layout(); fig.savefig(figs_dir / f"dbscan_pca.png", dpi=160); plt.close(fig)

    (run_dir / "cluster_metrics.json").write_text(json.dumps(results, indent=2))
    print(f"Saved clustering artifacts to {run_dir}")


if __name__ == "__main__":
    main()

