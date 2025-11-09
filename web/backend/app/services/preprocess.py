from __future__ import annotations

from typing import Dict

import pandas as pd

from ..schemas import PredictRequest
from ..services.artifacts import ModelArtifacts


def request_to_features(req: PredictRequest, artifacts: ModelArtifacts) -> pd.DataFrame:
  """
  Map a single PredictRequest into a dataframe aligned with the model's
  expected input features. Derive as many features as possible from limited input.
  """
  # * Calculate derived features from available data
  duration = req.inter_arrival_ms * req.pkt_count / 1000.0  # Total flow duration
  total_bytes = req.pkt_bytes * req.pkt_count  # Approximate total bytes
  rate = total_bytes / duration if duration > 0 else 0
  
  # * Estimate bidirectional stats (assume symmetric flow for demo)
  # In reality we only see one direction, but model expects bidirectional features
  spkts = req.pkt_count  # Source packets = pkt_count
  dpkts = max(1, int(req.pkt_count * 0.8))  # Destination ~80% of source
  sbytes = req.pkt_bytes * spkts  # Source bytes
  dbytes = int(req.pkt_bytes * dpkts * 0.9)  # Destination slightly smaller
  
  # * Calculate load (bytes/sec per direction)
  sload = sbytes / duration if duration > 0 else 0
  dload = dbytes / duration if duration > 0 else 0
  
  # * Mean packet size per direction
  smean = req.pkt_bytes
  dmean = int(req.pkt_bytes * 0.9)
  
  # * Inter-packet arrival time (convert from ms to seconds)
  sinpkt = req.inter_arrival_ms / 1000.0
  dinpkt = sinpkt * 1.1  # Slightly slower response
  
  # * Jitter (variance in inter-arrival time)
  # Attacks have very low jitter (automated), normal traffic has higher variance
  is_flood = req.pkt_count > 1000 or req.inter_arrival_ms < 5
  is_scan = req.pkt_count <= 3 and req.pkt_bytes < 100
  
  if is_flood:
    sjit = 0.00001  # Nearly zero for bots
    djit = 0.00001
  elif is_scan:
    sjit = 0.0001
    djit = 0.0001
  else:
    sjit = req.inter_arrival_ms * 0.2 / 1000.0
    djit = sjit * 1.3
  
  # * Detect attack patterns and set categorical features accordingly
  # High-risk ports (SSH, Telnet, RDP, SMB, SQL)
  high_risk_ports = {22, 23, 3389, 445, 139, 135, 1433, 3306}
  is_high_risk_port = req.dst_port in high_risk_ports
  
  # * Determine service and flag based on port and protocol
  service = "-"
  flag = "CON"  # Default connection state
  
  if req.protocol.upper() == "TCP":
    port_services = {
      80: "http", 443: "https", 22: "ssh", 23: "telnet", 
      25: "smtp", 53: "dns", 3389: "rdp", 21: "ftp",
      143: "imap", 993: "imaps", 587: "smtp"
    }
    service = port_services.get(req.dst_port, "-")
    # Scans typically have incomplete connections
    if is_scan or is_high_risk_port:
      flag = "S0"  # SYN sent, no response (scan pattern)
    elif is_flood:
      flag = "SF"  # Many successful connections (flood)
  elif req.protocol.upper() == "UDP":
    if req.dst_port == 53:
      service = "dns"
    elif req.dst_port == 67 or req.dst_port == 68:
      service = "dhcp"
    flag = "CON"
  elif req.protocol.upper() == "ICMP":
    service = "-"
    flag = "CON"
  
  # * Connection tracking features (important for attack detection!)
  # These simulate how many times similar connections have been seen
  # High values = potential scanning or repeated attack attempts
  ct_srv_src = min(255, req.pkt_count) if is_flood else 1
  ct_state_ttl = min(255, req.pkt_count // 10) if is_flood else 1
  ct_dst_ltm = min(255, req.pkt_count // 100) if is_flood else 1
  ct_srv_dst = min(255, req.pkt_count // 50) if is_flood else 1
  ct_src_ltm = min(255, req.pkt_count // 200) if is_flood else 1
  
  # Best-effort mapping based on common flow column names.
  base: Dict[str, object] = {
    "src_ip": req.src_ip,
    "dst_ip": req.dst_ip,
    "src_port": req.src_port,
    "dst_port": req.dst_port,
    "protocol_type": req.protocol.lower(),
    "service": service,
    "flag": flag,
    "dur": duration,
    "spkts": spkts,
    "dpkts": dpkts,
    "sbytes": sbytes,
    "dbytes": dbytes,
    "rate": rate,
    "sload": sload,
    "dload": dload,
    "smean": smean,
    "dmean": dmean,
    "sinpkt": sinpkt,
    "dinpkt": dinpkt,
    "sjit": sjit,
    "djit": djit,
    # Window sizes
    "swin": 8192 if req.protocol.upper() == "TCP" else 0,
    "dwin": 8192 if req.protocol.upper() == "TCP" else 0,
    # TTL values (typical)
    "sttl": 64,
    "dttl": 64,
    # Loss (attacks often have packet loss)
    "sloss": min(10, req.pkt_count // 1000) if is_flood else 0,
    "dloss": min(5, req.pkt_count // 2000) if is_flood else 0,
    # Connection tracking features
    "ct_srv_src": ct_srv_src,
    "ct_state_ttl": ct_state_ttl,
    "ct_dst_ltm": ct_dst_ltm,
    "ct_srv_dst": ct_srv_dst,
    "ct_src_ltm": ct_src_ltm,
    "ct_src_dport_ltm": min(255, req.pkt_count // 150) if is_flood else 1,
    "ct_dst_sport_ltm": min(255, req.pkt_count // 150) if is_flood else 1,
    "ct_dst_src_ltm": min(255, req.pkt_count // 100) if is_flood else 1,
    # Protocol-specific features
    "is_sm_ips_ports": 1 if is_scan else 0,
    "is_ftp_login": 1 if service == "ftp" else 0,
    "ct_ftp_cmd": 0,
    "ct_flw_http_mthd": 1 if service in ("http", "https") else 0,
    # Time-based features
    "hour": 12,
    "day_part": "afternoon",
    "is_attack": 0,
    "duration_from_times": duration,
    # TCP-specific
    "stcpb": 0,
    "dtcpb": 0,
    "tcprtt": 0.01 if req.protocol.upper() == "TCP" else 0,
    "synack": 0.005 if req.protocol.upper() == "TCP" else 0,
    "ackdat": 0.003 if req.protocol.upper() == "TCP" else 0,
    # HTTP-specific
    "trans_depth": 1 if service in ("http", "https") else 0,
    "response_body_len": req.pkt_bytes if service in ("http", "https") else 0,
  }

  # Ensure all required features are present in the row; fill with neutral defaults.
  row: Dict[str, object] = {}
  numeric = set(artifacts.meta.get("feature_numeric") or [])
  categorical = set(artifacts.meta.get("feature_categorical") or [])
  for col in artifacts.required_features:
    if col in base:
      row[col] = base[col]
    elif col in numeric:
      row[col] = 0
    elif col in categorical:
      row[col] = "unknown"
    else:
      row[col] = None

  df = pd.DataFrame([row])
  # Keep columns ordered per the training metadata to reduce surprises downstream.
  df = df.loc[:, artifacts.ordered_feature_columns(df.columns)]
  return df

