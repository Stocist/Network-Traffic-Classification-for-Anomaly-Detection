/**
 * Maps raw feature names from the model pipeline to human-friendly labels.
 * Handles categorical features (e.g., cat__service_ssh → Service: SSH)
 * and numeric features with clearer descriptions.
 */

// * Feature name mappings for UNSW-NB15 dataset
const FEATURE_LABELS: Record<string, string> = {
  // Network flow timing
  dur: "Duration",
  rate: "Data Rate",
  sttl: "Source TTL",
  dttl: "Destination TTL",
  
  // Packet statistics
  spkts: "Source Packets",
  dpkts: "Destination Packets",
  sbytes: "Source Bytes",
  dbytes: "Destination Bytes",
  
  // Load metrics
  sload: "Source Load",
  dload: "Destination Load",
  sloss: "Source Loss",
  dloss: "Destination Loss",
  
  // Inter-packet timing
  sinpkt: "Source Inter-packet Time",
  dinpkt: "Destination Inter-packet Time",
  sjit: "Source Jitter",
  djit: "Destination Jitter",
  
  // TCP window
  swin: "Source Window Size",
  dwin: "Destination Window Size",
  stcpb: "Source TCP Base",
  dtcpb: "Destination TCP Base",
  
  // TCP timing
  tcprtt: "TCP Round-trip Time",
  synack: "SYN-ACK Time",
  ackdat: "ACK Data Time",
  
  // Packet size
  smean: "Source Mean Packet Size",
  dmean: "Destination Mean Packet Size",
  
  // HTTP specific
  trans_depth: "HTTP Transaction Depth",
  response_body_len: "HTTP Response Body Length",
  
  // Connection tracking
  ct_srv_src: "Connections to Same Service",
  ct_state_ttl: "Connections with Same State",
  ct_dst_ltm: "Connections to Destination (last 100)",
  ct_src_dport_ltm: "Connections from Source to Dest Port (last 100)",
  ct_dst_sport_ltm: "Connections from Dest to Source Port (last 100)",
  ct_dst_src_ltm: "Connections between Dest-Source (last 100)",
  ct_src_ltm: "Connections from Source (last 100)",
  ct_srv_dst: "Connections to Same Destination Service",
  
  // Boolean flags
  is_ftp_login: "FTP Login Attempt",
  is_sm_ips_ports: "Same IPs and Ports",
  
  // FTP commands
  ct_ftp_cmd: "FTP Command Count",
  ct_flw_http_mthd: "HTTP Method Flow Count",
  
  // Categorical features (base names)
  protocol_type: "Protocol Type",
  service: "Service",
  flag: "TCP Flag",
};

/**
 * Converts a raw feature name to a friendly display label.
 * Handles categorical encodings like "cat__service_ssh" → "Service: SSH"
 */
export function getFriendlyFeatureName(rawName: string): string {
  // ? Handle categorical encoded features (e.g., cat__service_ssh)
  if (rawName.startsWith("cat__")) {
    const parts = rawName.substring(5).split("_");
    if (parts.length >= 2) {
      const category = parts[0]; // e.g., "service"
      const value = parts.slice(1).join("_").toUpperCase(); // e.g., "SSH"
      const categoryLabel = FEATURE_LABELS[category] || category;
      return `${categoryLabel}: ${value}`;
    }
  }
  
  // ? Return mapped label or clean up the raw name
  return FEATURE_LABELS[rawName] || rawName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Gets a brief description for a feature (for tooltips).
 */
export function getFeatureDescription(rawName: string): string {
  const descriptions: Record<string, string> = {
    dur: "Total duration of the network flow in seconds",
    rate: "Data transmission rate (bytes/sec)",
    sttl: "Time-to-live value from source",
    dttl: "Time-to-live value from destination",
    spkts: "Number of packets sent from source",
    dpkts: "Number of packets sent from destination",
    sbytes: "Total bytes sent from source",
    dbytes: "Total bytes sent from destination",
    sload: "Source bits per second",
    dload: "Destination bits per second",
    tcprtt: "TCP round-trip time (ms)",
    synack: "Time between SYN and SYN-ACK",
    trans_depth: "Number of HTTP requests in connection",
    ct_srv_src: "Count of connections to same service from this source",
    is_ftp_login: "Whether this is an FTP login attempt (1=yes, 0=no)",
  };
  
  const key = rawName.startsWith("cat__") 
    ? rawName.substring(5).split("_")[0]
    : rawName;
    
  return descriptions[key] || `Feature: ${getFriendlyFeatureName(rawName)}`;
}

