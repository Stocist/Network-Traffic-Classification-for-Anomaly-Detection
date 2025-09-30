from __future__ import annotations

from typing import List, Optional

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV

try:
    from imblearn.pipeline import Pipeline as ImbPipeline
    from imblearn.over_sampling import SMOTE
except Exception:  # pragma: no cover - optional dependency
    ImbPipeline = None
    SMOTE = None

try:
    from xgboost import XGBClassifier  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    XGBClassifier = None


def build_preprocessor(numeric: List[str], categorical: List[str]) -> ColumnTransformer:
    num_pipe = SkPipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    # use sparse=False for broader sklearn version compatibility
    cat_pipe = SkPipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse=False)),
        ]
    )

    pre = ColumnTransformer(
        transformers=[
            ("num", num_pipe, numeric),
            ("cat", cat_pipe, categorical),
        ]
    )
    return pre


def build_estimator(
    model: str = "rf",
    class_weight: Optional[str] = None,
    random_state: int = 42,
):
    model = model.lower()
    if model in ("logreg", "lr"):
        # lbfgs is a good default for multi-class; avoid n_jobs for broad compatibility
        return LogisticRegression(
            max_iter=1000,
            class_weight=class_weight,
            solver="lbfgs",
        )
    if model in ("rf", "randomforest"):
        return RandomForestClassifier(
            n_estimators=300,
            random_state=random_state,
            n_jobs=-1,
            class_weight=class_weight,
        )
    if model in ("gb", "gbc", "gradientboosting"):
        return GradientBoostingClassifier(random_state=random_state)
    if model in ("lsvc", "svm"):
        return LinearSVC(class_weight=class_weight, random_state=random_state)
    if model in ("xgb", "xgboost"):
        if XGBClassifier is None:
            raise RuntimeError("xgboost is not installed. Install with: pip install xgboost")
        # scale_pos_weight is user-controlled outside; class_weight not supported natively
        return XGBClassifier(
            n_estimators=300,
            learning_rate=0.1,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=1.0,
            reg_lambda=1.0,
            n_jobs=-1,
            random_state=random_state,
            eval_metric="logloss",
            tree_method="hist",
        )
    raise ValueError(f"Unknown model: {model}")


def make_pipeline(
    numeric: List[str],
    categorical: List[str],
    model: str = "rf",
    use_smote: bool = False,
    class_weight: Optional[str] = None,
    random_state: int = 42,
    calibrate: Optional[str] = None,
):
    pre = build_preprocessor(numeric, categorical)
    est = build_estimator(model=model, class_weight=class_weight, random_state=random_state)

    # Optional calibration wrapper; keep inside the pipeline to avoid leakage
    if calibrate and calibrate.lower() != "none":
        method = "isotonic" if calibrate.lower() == "isotonic" else "sigmoid"
        est = CalibratedClassifierCV(estimator=est, method=method, cv=5)

    if use_smote:
        if ImbPipeline is None or SMOTE is None:
            raise RuntimeError("imblearn is not installed but use_smote=True was set.\n"
                               "Install with: pip install imbalanced-learn")
        return ImbPipeline(steps=[
            ("preprocess", pre),
            ("smote", SMOTE(random_state=random_state)),
            ("clf", est),
        ])
    else:
        return SkPipeline(steps=[
            ("preprocess", pre),
            ("clf", est),
        ])
