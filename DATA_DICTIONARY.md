## Data Dictionary (final submission)

This dictionary lists the columns present in the processed datasets used by the final models, their types, brief descriptions, and provenance. Categorical columns are one‑hot encoded during modeling; the base names are listed here.

Where a dataset’s official definitions apply (e.g., UNSW‑NB15), see the dataset’s documentation for full semantics. We cite the local copy at `UNSW-NB15/The UNSW-NB15 description.md`.

---

### A) data_processed/flows_clean.csv (UNSW‑NB15 flows, leak‑free)

- dur (numeric): Flow duration (seconds).
- protocol_type (categorical): Transport protocol (e.g., tcp/udp/icmp).
- service (categorical): Application service label.
- flag (categorical): Connection state flag.
- spkts, dpkts (numeric): Packets from source/destination.
- sbytes, dbytes (numeric): Bytes from source/destination.
- rate (numeric): Approx. throughput indicator for the flow.
- sttl, dttl (numeric): Initial TTL values per direction.
- sload, dload (numeric): Per‑direction load (rate proxy).
- sloss, dloss (numeric): Packet loss counters.
- sinpkt, dinpkt (numeric): Inter‑packet time per direction.
- sjit, djit (numeric): Jitter per direction.
- swin, dwin (numeric): TCP window size.
- stcpb, dtcpb (numeric): TCP base sequence number per direction.
- dwin (numeric): Destination TCP window size.
- tcprtt, synack, ackdat (numeric): RTT and TCP handshake timing.
- smean, dmean (numeric): Mean bytes per packet per direction.
- trans_depth (numeric): HTTP transaction depth (if present).
- response_body_len (numeric): HTTP response body length (if present).
- ct_srv_src, ct_state_ttl, ct_dst_ltm, ct_src_dport_ltm, ct_dst_sport_ltm, ct_dst_src_ltm, ct_src_ltm, ct_srv_dst (numeric): Count‑based contextual features.
- is_ftp_login, ct_ftp_cmd, ct_flw_http_mthd, is_sm_ips_ports (categorical/binary): Protocol/method flags.
- label_family (categorical): Target label family (Normal/Attack category). Used as the supervised target; never included as a model feature.

Notes
- Feature definitions follow UNSW‑NB15; see local description for precise semantics.
- During modeling, `label_family` is separated as y and excluded from X to prevent leakage.

---

### B) data_processed/basic_flows_clean_binary.csv (4Network basic, binary)

- duration (numeric): Flow duration (seconds).
- protocol_type (categorical): Transport protocol.
- service (categorical): Application service label.
- flag (categorical): Connection state flag.
- src_bytes, dst_bytes (numeric): Bytes per direction.
- count, srv_count (numeric): Flow counts per host/service window.
- serror_rate (numeric): SYN error rate proxy.
- label (categorical): Binary target {Normal, Attack}. Used as y; excluded from features.

---

### C) data_processed/cesnet_windows_{train,test}.csv (CESNET 10‑minute windows)

Base counters (per window)
- id_institution (categorical): Institution/tenant identifier (one‑hot encoded).
- n_bytes (numeric): Total bytes in window. Regression target for GBR; excluded from features when fitting the regressor.
- n_packets (numeric): Total packets.
- n_flows (numeric): Total flows.
- Optional diversity/ratios (numeric): e.g., n_dest_asns, n_dest_ports, n_dest_ips; tcp_ratio, udp_ratio; direction ratios.

Engineered temporal features
- Lag features: `n_bytes_lag{k}`, `n_flows_lag{k}`, `n_packets_lag{k}` for k in small windows (e.g., 1,2,3,6,12).
- Rolling statistics: `n_bytes_roll{w}_mean`, `n_bytes_roll{w}_std` for windows w (e.g., 3,6,12).
- Calendar features: hour‑of‑week encoded as `how_sin`, `how_cos` (cyclical encoding).

Labels and partitions
- train: Used to fit the Gradient Boosting Regressor (GBR) for forecasting `n_bytes`.
- test: Contains residuals and derived binary labels `is_anom` via per‑IP 3σ on z‑scored residuals (plus small tail heuristic if enabled). `is_anom` is used to evaluate IsolationForest.

Notes
- Units for visuals standardized to MB; predictions in plots may be clipped ≥ 0 for readability (metrics are computed on unclipped values).
- Leak policy: `n_bytes` is the regressor target and is excluded from feature matrices for GBR; IsolationForest is trained on features only and evaluated against `is_anom`.

---

### D) data_processed/label_category_map.csv

- label (categorical): Original attack/normal label (e.g., Analysis, Backdoor, Normal, …).
- category (categorical): Consolidated mapping (e.g., Attack vs Normal) used for binary tasks.

---

Modeling notes (applies across datasets)
- Categorical columns are one‑hot encoded with `handle_unknown='ignore'`.
- Numeric columns are median‑imputed and standardized.
- Targets (`label`, `label_family`, `is_anom`, `n_bytes` for regression) are never included in features.

