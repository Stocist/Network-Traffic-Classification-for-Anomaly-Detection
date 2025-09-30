Data Dictionary (skeleton)

Describe each feature used by the models: name, type, description, and source.

Example
- src_ip: string — source IP address (raw, not used for modeling)
- dst_ip: string — destination IP address (raw, not used for modeling)
- protocol_type: categorical — transport protocol (e.g., tcp, udp, icmp)
- service: categorical — application service label
- flag: categorical — connection state flag
- src_bytes: numeric — bytes sent from source to destination
- dst_bytes: numeric — bytes sent from destination to source
- ...

Note: Ensure the final processed columns in data_processed/ match those available at inference; update this file accordingly.
