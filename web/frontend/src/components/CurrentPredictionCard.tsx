import { useMemo } from 'react';

type PredictionResult = {
  label: string;
  probability: number;
  flow_summary?: {
    src_ip: string;
    dst_ip: string;
    src_port: number;
    dst_port: number;
    protocol: string;
    pkt_bytes: number;
  };
};

type Props = {
  result: PredictionResult | null;
};

export function CurrentPredictionCard({ result }: Props) {
  const riskLevel = useMemo(() => {
    if (!result) return null;
    const conf = result.probability;
    if (conf >= 0.8) return { label: 'High', color: '#d32f2f' };
    if (conf >= 0.5) return { label: 'Medium', color: '#f57c00' };
    return { label: 'Low', color: '#fdd835' };
  }, [result]);

  const isAttack = result?.label === 'Attack' || result?.label === '1';

  if (!result) {
    return (
      <article className="card prediction-card prediction-card--empty">
        <h3>Current Prediction</h3>
        <p className="empty-state">Submit a flow to see prediction results</p>
      </article>
    );
  }

  return (
    <article className="card prediction-card">
      <h3>Current Prediction</h3>
      
      <div className="prediction-result">
        <div className={`prediction-badge ${isAttack ? 'prediction-badge--attack' : 'prediction-badge--normal'}`}>
          <span className="prediction-icon">{isAttack ? '🔴' : '🟢'}</span>
          <span className="prediction-label">
            {isAttack ? 'ATTACK DETECTED' : 'NORMAL TRAFFIC'}
          </span>
        </div>
        
        <div className="prediction-metrics">
          <div className="metric-item">
            <span className="metric-label">Confidence</span>
            <span className="metric-value">{(result.probability * 100).toFixed(1)}%</span>
          </div>
          
          {riskLevel && (
            <div className="metric-item">
              <span className="metric-label">Risk Level</span>
              <span 
                className="metric-value" 
                style={{ color: riskLevel.color, fontWeight: 600 }}
              >
                {riskLevel.label}
              </span>
            </div>
          )}
        </div>

        {result.flow_summary && (
          <div className="flow-details">
            <h4>Flow Details</h4>
            <ul>
              <li>
                <strong>Source:</strong> {result.flow_summary.src_ip}:{result.flow_summary.src_port}
              </li>
              <li>
                <strong>Destination:</strong> {result.flow_summary.dst_ip}:{result.flow_summary.dst_port}
              </li>
              <li>
                <strong>Protocol:</strong> {result.flow_summary.protocol}
              </li>
              <li>
                <strong>Packet Bytes:</strong> {result.flow_summary.pkt_bytes.toLocaleString()}
              </li>
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

