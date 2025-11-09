from __future__ import annotations

import io
from collections import Counter
from typing import Any, Dict, List, Optional
from uuid import uuid4

import numpy as np
import pandas as pd

from ..config import settings
from ..schemas import ChartsPayload, LabelBreakdown, PortCount, PredictionResponse, PredictionRow, TimelinePoint, ValidationReport
from .artifacts import ModelArtifacts


class PredictionService:
  COLUMN_ALIASES: Dict[str, str] = {
    "proto": "protocol_type",
    "state": "flag",
    "sport": "src_port",
    "dsport": "dst_port",
    "srcip": "src_ip",
    "dstip": "dst_ip",
    # * UNSW-NB15 raw format uses capitalized names
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
    "Stime": "timestamp",
    "Ltime": "last_time",
    "Label": "label",
  }
  DOWNSAMPLE_FRACTION: float = 0.8

  def __init__(self, artifacts: ModelArtifacts) -> None:
    self.artifacts = artifacts

  def process_upload(self, file_bytes: bytes, filename: str) -> PredictionResponse:
    """End-to-end inference flow that cleans, validates, scores, and packages the uploaded dataset."""
    df = self._load_csv(file_bytes, filename)
    df = self._harmonize_columns(df)
    df, validation = self._validate(df)
    feature_df = df.loc[:, self.artifacts.required_features]
    predictions, scores = self._predict(feature_df)

    enriched_df = df.copy()
    enriched_df["prediction"] = predictions
    if scores is not None:
      enriched_df["score"] = scores

    result_id = uuid4().hex

    charts = self._build_charts(enriched_df, scores)
    prediction_rows = self._build_rows(enriched_df, scores)

    response = PredictionResponse(
      result_id=result_id,
      validation=validation,
      columns=list(enriched_df.columns),
      predictions=prediction_rows,
      charts=charts,
    )

    return response, enriched_df

  def _load_csv(self, file_bytes: bytes, filename: str) -> pd.DataFrame:
    """
    Parse raw upload bytes into a dataframe while handling BOMs and common encoding fallbacks.
    Also handles UNSW-NB15 raw files that have no header row.
    """
    if not file_bytes:
      raise ValueError("Uploaded file is empty.")

    try:
      decoded = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
      decoded = file_bytes.decode("latin-1")

    try:
      # * First attempt: Try reading with headers
      df = pd.read_csv(io.StringIO(decoded))
      
      # * Check if this is UNSW-NB15 raw format (no headers)
      # The raw files have IP addresses as first column, processed files have "dur" or similar
      # Raw files will have IP address (contains dots and all parts are digits) in the header position
      first_col = str(df.columns[0])
      is_raw_unsw = False
      
      # Check if first column looks like an IP address
      if '.' in first_col:
        # Check if it's an IP (all parts between dots are digits)
        parts = first_col.split('.')
        if len(parts) == 4 and all(part.isdigit() for part in parts):
          is_raw_unsw = True
      elif first_col.isdigit():
        # Pure digit in header position suggests raw file
        is_raw_unsw = True
      
      if is_raw_unsw:
        # * This is a headerless UNSW-NB15 raw file - reload with proper headers
        unsw_headers = [
          "srcip", "sport", "dstip", "dsport", "proto", "state", "dur", "sbytes", "dbytes",
          "sttl", "dttl", "sloss", "dloss", "service", "Sload", "Dload", "Spkts", "Dpkts",
          "swin", "dwin", "stcpb", "dtcpb", "smeansz", "dmeansz", "trans_depth", "res_bdy_len",
          "Sjit", "Djit", "Stime", "Ltime", "Sintpkt", "Dintpkt", "tcprtt", "synack", "ackdat",
          "is_sm_ips_ports", "ct_state_ttl", "ct_flw_http_mthd", "is_ftp_login", "ct_ftp_cmd",
          "ct_srv_src", "ct_srv_dst", "ct_dst_ltm", "ct_src_ltm", "ct_src_dport_ltm",
          "ct_dst_sport_ltm", "ct_dst_src_ltm", "attack_cat", "Label"
        ]
        df = pd.read_csv(io.StringIO(decoded), header=None, names=unsw_headers)
        
    except Exception as exc:  # pragma: no cover - pandas error message is adequate
      raise ValueError(f"Unable to parse CSV file {filename}: {exc}") from exc

    if df.empty:
      raise ValueError("Uploaded CSV contains no rows.")

    return df

  def _harmonize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
    """
    Rename common aliases so CSVs with alternate headers still map to the model features.
    Also computes missing features that can be derived from available data.
    """
    rename_map = {}
    for alias, canonical in self.COLUMN_ALIASES.items():
      if alias in df.columns and canonical not in df.columns:
        rename_map[alias] = canonical
    if rename_map:
      df = df.rename(columns=rename_map)
    
    # * Compute 'rate' if missing (raw UNSW-NB15 doesn't have it)
    if "rate" not in df.columns:
      if "sbytes" in df.columns and "dbytes" in df.columns and "dur" in df.columns:
        # Convert to numeric first to handle mixed types
        df["dur"] = pd.to_numeric(df["dur"], errors='coerce').fillna(0)
        df["sbytes"] = pd.to_numeric(df["sbytes"], errors='coerce').fillna(0)
        df["dbytes"] = pd.to_numeric(df["dbytes"], errors='coerce').fillna(0)
        # rate = total_bytes / duration (with epsilon to avoid division by zero)
        epsilon = 1e-9
        total_bytes = df["sbytes"] + df["dbytes"]
        df["rate"] = total_bytes / (df["dur"] + epsilon)
        # ! Cap extreme values to avoid infinity
        df["rate"] = df["rate"].clip(upper=1e10)
    
    # * Add engineered features expected by improved model
    # Add is_attack column (will be populated by predictions)
    if "is_attack" not in df.columns:
      df["is_attack"] = 0  # Default to normal
    
    # Add hour feature from timestamp if available
    if "hour" not in df.columns:
      if "timestamp" in df.columns:
        df["hour"] = (pd.to_numeric(df["timestamp"], errors='coerce').fillna(0) % 86400) // 3600
      elif "Stime" in df.columns:
        df["hour"] = (pd.to_numeric(df["Stime"], errors='coerce').fillna(0) % 86400) // 3600
      else:
        df["hour"] = 12  # Default to noon
    
    # Add day_part feature
    if "day_part" not in df.columns:
      # Convert hour to day_part
      df["day_part"] = "afternoon"  # Default
      if "hour" in df.columns:
        # Map hours to day parts
        hour_vals = pd.to_numeric(df["hour"], errors='coerce').fillna(12)
        conditions = [
          (hour_vals >= 0) & (hour_vals < 6),
          (hour_vals >= 6) & (hour_vals < 12),
          (hour_vals >= 12) & (hour_vals < 18),
          (hour_vals >= 18) & (hour_vals <= 24)
        ]
        choices = ['night', 'morning', 'afternoon', 'evening']
        df["day_part"] = np.select(conditions, choices, default='afternoon')
    
    # Add duration_from_times
    if "duration_from_times" not in df.columns:
      if "timestamp" in df.columns and "last_time" in df.columns:
        df["duration_from_times"] = pd.to_numeric(df["last_time"], errors='coerce').fillna(0) - pd.to_numeric(df["timestamp"], errors='coerce').fillna(0)
      elif "Stime" in df.columns and "Ltime" in df.columns:
        df["duration_from_times"] = pd.to_numeric(df["Ltime"], errors='coerce').fillna(0) - pd.to_numeric(df["Stime"], errors='coerce').fillna(0)
      elif "dur" in df.columns:
        df["duration_from_times"] = pd.to_numeric(df["dur"], errors='coerce').fillna(0)
      else:
        df["duration_from_times"] = 0
    
    # * Add port columns if missing (testing/training sets don't have them)
    # The model expects src_port and dst_port, but testing/training sets don't have any port info
    if "src_port" not in df.columns:
      if "sport" in df.columns:
        df["src_port"] = pd.to_numeric(df["sport"], errors='coerce').fillna(0)
      else:
        # No port info in testing/training sets - use default based on service
        df["src_port"] = 0  # Source port is usually random
    
    if "dst_port" not in df.columns:
      if "dsport" in df.columns:
        df["dst_port"] = pd.to_numeric(df["dsport"], errors='coerce').fillna(0)
      else:
        # Try to infer from service column
        if "service" in df.columns:
          service_ports = {
            'http': 80, 'https': 443, 'dns': 53, 'ssh': 22,
            'ftp': 21, 'ftp-data': 20, 'smtp': 25, 'pop3': 110, 
            'imap': 143, 'telnet': 23, 'snmp': 161, 'dhcp': 67,
            'radius': 1812, 'ssl': 443, '-': 0
          }
          # Map service to common port
          df["dst_port"] = df["service"].apply(
            lambda x: service_ports.get(str(x).lower().strip(), 0) if pd.notna(x) else 0
          )
        else:
          df["dst_port"] = 0
    
    # * Add missing TCP-related columns that the improved model expects
    if "tcprtt" not in df.columns:
      df["tcprtt"] = 0.0
    if "synack" not in df.columns:
      df["synack"] = 0.0
    if "ackdat" not in df.columns:
      df["ackdat"] = 0.0
    
    return df

  def _validate(self, df: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    """Ensure required features exist and downsample extremely large uploads to keep processing bounded."""
    missing = [col for col in self.artifacts.required_features if col not in df.columns]
    if missing:
      raise ValueError(f"Uploaded CSV is missing required columns: {', '.join(missing)}")

    extra = [c for c in df.columns if c not in self.artifacts.required_features]
    original_row_count = len(df)
    max_rows_exceeded = original_row_count > settings.max_rows
    if max_rows_exceeded:
      # Keep a deterministic subset whenever the input is huge so downstream charts stay responsive.
      target_fraction = self.DOWNSAMPLE_FRACTION
      sample_size = max(int(original_row_count * target_fraction), 1)
      sample_size = min(sample_size, settings.max_rows)
      df = df.sample(n=sample_size, random_state=42).sort_index()
      sample_fraction = len(df) / original_row_count if original_row_count else None
    else:
      sample_fraction = None

    report = ValidationReport(
      missing_columns=missing,
      extra_columns=extra,
      row_count=len(df),
      max_rows_exceeded=max_rows_exceeded,
      downsampled=max_rows_exceeded,
      original_row_count=original_row_count if max_rows_exceeded else None,
      sampling_fraction=sample_fraction,
    )
    return df, report

  def _predict(self, features: pd.DataFrame) -> tuple[List[str], Optional[List[float]]]:
    """Run the model pipeline and extract class probabilities when available."""
    preds = self.artifacts.pipeline.predict(features)
    scores: Optional[List[float]] = None

    if hasattr(self.artifacts.pipeline, "predict_proba"):
      proba = self.artifacts.pipeline.predict_proba(features)
      positive_label = self.artifacts.positive_label
      if positive_label and positive_label in self.artifacts.pipeline.classes_:
        pos_index = list(self.artifacts.pipeline.classes_).index(positive_label)
      else:
        # Default to the second column for binary problems or the sole column for one-class scores.
        pos_index = 1 if proba.shape[1] > 1 else 0
      scores = proba[:, pos_index].astype(np.float64).tolist()

    return preds.tolist(), scores

  def _build_rows(self, df: pd.DataFrame, scores: Optional[List[float]]) -> List[PredictionRow]:
    """Convert dataframe rows into serializable payloads for the UI table."""
    rows: List[PredictionRow] = []
    score_column = "score" if scores is not None else None

    for idx, row in df.iterrows():
      data_payload = {k: self._to_serializable(v) for k, v in row.items() if k not in {"prediction", "score"}}
      score_value = None
      if score_column:
        raw_score = row.get(score_column)
        if pd.notna(raw_score):
          score_value = float(raw_score)
      rows.append(
        PredictionRow(
          row_index=int(idx),
          prediction=str(row["prediction"]),
          score=score_value,
          data=data_payload,
        )
      )
    return rows

  def _build_charts(self, df: pd.DataFrame, scores: Optional[List[float]]) -> ChartsPayload:
    """Build derived aggregates that power the dashboard visualisations."""
    label_counts = Counter(df["prediction"])
    # * Convert label keys to strings for Pydantic schema
    label_counts_str = {str(k): v for k, v in label_counts.items()}

    # * Extract attack taxonomy from ground truth labels if available
    attack_taxonomy = self._extract_attack_taxonomy(df)

    # * Generate port × attack type heatmap data
    port_heatmap = self._port_attack_heatmap(df)

    timeline = self._timeline(df)
    
    # * Get top targeted services (http, dns, ftp, etc.) for bar chart
    # This complements the port heatmap by showing service-level patterns
    service_counts = self._top_services(df)

    return ChartsPayload(
      label_breakdown=LabelBreakdown(counts=label_counts_str),
      attack_taxonomy=attack_taxonomy,
      port_attack_heatmap=port_heatmap,
      anomalies_over_time=timeline,
      top_destination_ports=service_counts,  # * Now contains services, not ports
    )

  def _timeline(self, df: pd.DataFrame) -> List[TimelinePoint]:
    """Aggregate anomalies by minute using the best-effort timestamp column heuristic."""
    timestamp_col = self._find_timestamp_column(df)
    if not timestamp_col:
      return []

    timestamp_series = pd.to_datetime(df[timestamp_col], errors="coerce")
    mask_valid = timestamp_series.notna()
    if not mask_valid.any():
      return []

    positive_label = self.artifacts.positive_label or "Attack"
    anomaly_mask = (df["prediction"] == positive_label) & mask_valid
    grouped = (
      timestamp_series[anomaly_mask]
      .dt.floor("1min")
      .value_counts()
      .sort_index()
    )

    return [
      TimelinePoint(timestamp=ts.isoformat(), count=int(count))
      for ts, count in grouped.items()
    ]

  def _top_services(self, df: pd.DataFrame) -> List[PortCount]:
    """
    Count the most frequently targeted services among anomalous records.
    This provides complementary information to the port heatmap by showing
    service-level patterns (http, dns, ftp, smtp) rather than port numbers.
    
    Returns:
      List of PortCount objects where 'port' field contains service names
    """
    # * Look for service column explicitly
    service_col = None
    for col in ["service", "app_protocol", "protocol"]:
      if col in df.columns:
        service_col = col
        break
    
    if not service_col:
      return []

    positive_label = self.artifacts.positive_label or "Attack"
    anomaly_df = df[df["prediction"] == positive_label].copy()
    if anomaly_df.empty:
      return []

    # * Filter to rows with valid attack taxonomy (consistency with heatmap)
    attack_col = None
    for col in ["attack_cat", "attack_type", "category"]:
      if col in anomaly_df.columns:
        attack_col = col
        break
    
    if attack_col:
      # * Keep only rows with non-empty, non-Normal attack categories
      valid_attacks = ~anomaly_df[attack_col].astype(str).str.lower().isin(['normal', 'nan', 'none', ''])
      anomaly_df = anomaly_df[valid_attacks]
      
      if anomaly_df.empty:
        return []

    # * Extract and clean service names
    service_series = anomaly_df[service_col].astype(str)
    
    # * Filter out invalid/empty services
    valid_mask = ~service_series.str.lower().isin(["nan", "none", "", "-", "0"])
    service_series = service_series[valid_mask]
    
    if service_series.empty:
      return []
    
    # * Get top 10 most targeted services
    counts = service_series.value_counts().head(10)

    return [PortCount(port=str(service), count=int(count)) for service, count in counts.items()]

  @staticmethod
  def _to_serializable(value: Any) -> Any:
    if pd.isna(value):
      return None
    if isinstance(value, (np.integer, np.floating)):
      return value.item()
    return value

  @staticmethod
  def _find_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    candidates = ["timestamp", "time", "event_time", "datetime", "capture_time"]
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
      if cand in lower_map:
        return lower_map[cand]
    for col in df.columns:
      if "time" in col.lower():
        return col
    return None

  @staticmethod
  def _find_port_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find the best column representing destination ports or services.
    Priority: actual port numbers > service names > None
    """
    # * Priority 1: Look for actual destination port columns
    port_candidates = ["dst_port", "dport", "destination_port", "dest_port", "dstport"]
    lower_map = {c.lower(): c for c in df.columns}
    for cand in port_candidates:
      if cand in lower_map:
        return lower_map[cand]
    
    # * Priority 2: Check for service column (http, dns, ftp, etc.)
    service_candidates = ["service", "protocol", "app_protocol"]
    for cand in service_candidates:
      if cand in lower_map:
        col_name = lower_map[cand]
        # ! Only use service column if it has meaningful values (not just "-" or numbers)
        sample = df[col_name].dropna().head(100)
        if len(sample) > 0:
          # Check if column contains service names (strings with letters)
          non_dash = sample[sample != "-"]
          if len(non_dash) > 0 and non_dash.astype(str).str.contains('[a-zA-Z]').any():
            return col_name
    
    # * Priority 3: Don't fallback to random columns with "port" in name
    # (UNSW-NB15 has ct_src_dport_ltm which is a count, not a port)
    return None

  def _extract_attack_taxonomy(self, df: pd.DataFrame) -> Dict[str, int]:
    """
    Extract attack category distribution from ground truth labels in the uploaded dataset.
    
    This method looks for common attack category column names (attack_cat, attack_type, etc.)
    and returns the distribution of attack types among rows predicted as attacks.
    
    Args:
      df: DataFrame with predictions and (optionally) ground truth attack categories
      
    Returns:
      Dictionary mapping attack category names to counts, or empty dict if no categories found
    """
    # * Try various common column names for attack taxonomy
    candidates = ["attack_cat", "attack_type", "category", "label_detail", "subcategory"]
    
    for col in candidates:
      if col in df.columns:
        # * Filter to rows predicted as attacks
        positive_label = self.artifacts.positive_label or "Attack"
        attack_df = df[df["prediction"] == positive_label]
        
        if not attack_df.empty:
          # * Count occurrences of each attack category
          category_counts = attack_df[col].value_counts().to_dict()
          
          # * Clean up the results - remove Normal, NaN, None, empty strings
          cleaned_counts = {}
          for category, count in category_counts.items():
            # Convert to string for consistent comparison
            cat_str = str(category).strip()
            cat_lower = cat_str.lower()
            
            # * Skip invalid/normal categories
            if (cat_str and 
                cat_lower not in ["normal", "nan", "none", "", "0"] and
                not pd.isna(category)):
              cleaned_counts[cat_str] = int(count)
          
          # * Return if we found valid attack categories
          if cleaned_counts:
            return cleaned_counts
    
    # * Fallback: If no attack_cat column, return empty dict
    # The frontend will show "No attack taxonomy data available"
    return {}

  def _port_attack_heatmap(self, df: pd.DataFrame) -> Dict[str, Any]:
    """
    Generate a heatmap showing which destination ports are targeted by which attack types.
    
    Returns a structure suitable for D3 heatmap visualization:
    {
      "ports": [80, 443, 22, ...],
      "attack_types": ["DoS", "Exploits", ...],
      "matrix": [[count, count, ...], ...]  # attack_types × ports
    }
    """
    # * Find destination port column
    port_col = None
    for col in ["dst_port", "dsport", "dport", "destination_port"]:
      if col in df.columns:
        port_col = col
        break
    
    # * Find attack taxonomy column
    attack_col = None
    for col in ["attack_cat", "attack_type", "category"]:
      if col in df.columns:
        attack_col = col
        break
    
    if not port_col or not attack_col:
      return {}
    
    # * Filter to predicted attacks only
    positive_label = self.artifacts.positive_label or "Attack"
    attack_df = df[df["prediction"] == positive_label].copy()
    
    if attack_df.empty:
      return {}
    
    # * Clean port column - convert to numeric and filter valid ports
    attack_df[port_col] = pd.to_numeric(attack_df[port_col], errors='coerce')
    attack_df = attack_df[attack_df[port_col].notna()]
    attack_df = attack_df[(attack_df[port_col] >= 1) & (attack_df[port_col] <= 65535)]
    
    if attack_df.empty:
      return {}
    
    # * Create crosstab of attack_type × port
    try:
      crosstab = pd.crosstab(
        attack_df[attack_col],
        attack_df[port_col].astype(int)
      )
    except Exception:
      return {}
    
    # * Get top 15 most targeted ports
    port_totals = crosstab.sum(axis=0).sort_values(ascending=False)
    top_ports = port_totals.head(15).index.tolist()
    
    if not top_ports:
      return {}
    
    # * Filter crosstab to top ports only
    crosstab = crosstab[top_ports]
    
    # * Remove attack types that are "Normal" or invalid
    valid_attack_mask = ~crosstab.index.str.lower().isin(['normal', 'nan', 'none', ''])
    crosstab = crosstab[valid_attack_mask]
    
    if crosstab.empty:
      return {}
    
    # * Sort attack types by total activity
    attack_totals = crosstab.sum(axis=1).sort_values(ascending=False)
    crosstab = crosstab.loc[attack_totals.index]
    
    # * Convert to format for frontend
    attack_types = crosstab.index.tolist()
    ports = [int(p) for p in crosstab.columns.tolist()]
    matrix = crosstab.values.tolist()
    
    return {
      "ports": ports,
      "attack_types": attack_types,
      "matrix": matrix
    }
