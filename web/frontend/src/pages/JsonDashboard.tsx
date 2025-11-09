import { useCallback, useMemo, useState } from "react";
import { InputForm } from "../components/InputForm";
import { CurrentPredictionCard } from "../components/CurrentPredictionCard";
import { StatisticsCard } from "../components/StatisticsCard";
import { ConfidenceTrendChart } from "../components/ConfidenceTrendChart";
import { Toast } from "../components/Toast";
import { useHistory, usePrediction, type PredictRequest } from "../hooks/usePrediction";
import { SidebarNav } from "../components/SidebarNav";

export default function JsonDashboardPage() {
  const { result, loading, error, predict } = usePrediction();
  const { items, enabled, setEnabled } = useHistory(3000);
  const [showToast, setShowToast] = useState(false);
  const [lastPayload, setLastPayload] = useState<PredictRequest | null>(null);

  const onSubmit = useCallback(async (payload: PredictRequest) => {
    setLastPayload(payload);
    await predict(payload);
  }, [predict]);
  
  // * Auto-show toast when error appears
  useMemo(() => {
    if (error) {
      setShowToast(true);
    }
  }, [error]);

  // * Convert result to include flow summary
  const enhancedResult = useMemo(() => {
    if (!result || !lastPayload) return null;
    return {
      ...result,
      flow_summary: {
        src_ip: lastPayload.src_ip,
        dst_ip: lastPayload.dst_ip,
        src_port: lastPayload.src_port,
        dst_port: lastPayload.dst_port,
        protocol: lastPayload.protocol,
        pkt_bytes: lastPayload.pkt_bytes,
      },
    };
  }, [result, lastPayload]);

  // * Convert history items to format expected by charts
  const historyItems = useMemo(() => {
    return items.map(item => ({
      id: item.id,
      label: item.label,
      probability: item.probability,
      timestamp: new Date(item.timestamp).getTime(),
    }));
  }, [items]);

  const handleExport = useCallback(() => {
    if (items.length === 0) {
      alert('No predictions to export');
      return;
    }

    const csv = [
      'timestamp,label,confidence,src_ip,dst_ip,src_port,dst_port,protocol',
      ...items.map(item => {
        const payload = item.payload || {};
        return `${item.timestamp},${item.label},${(item.probability * 100).toFixed(2)}%,${payload.src_ip || ''},${payload.dst_ip || ''},${payload.src_port || ''},${payload.dst_port || ''},${payload.protocol || ''}`;
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [items]);

  const handleClearAll = useCallback(() => {
    if (confirm('Clear all prediction history? This cannot be undone.')) {
      // * TODO: Implement clear all on backend
      window.location.reload();
    }
  }, []);

  return (
    <div className="realtime-prediction">
      <aside className="inference-sidebar">
        <SidebarNav />
      </aside>

      <section className="inference-content">
        <header className="hero">
          <p className="eyebrow">Real-Time Prediction</p>
          <h2>Single Flow Analysis</h2>
          <p>
            Enter network flow parameters to get immediate anomaly detection with confidence scoring.
            Perfect for investigating suspicious connections or testing the model with custom inputs.
          </p>
        </header>

        <section className="input-section">
          <InputForm onSubmit={onSubmit} disabled={loading} />
        </section>

        <section className="results-grid">
          <CurrentPredictionCard result={enhancedResult} />
          <StatisticsCard 
            items={historyItems} 
            onExport={handleExport}
            onClearAll={handleClearAll}
          />
        </section>

        <ConfidenceTrendChart items={historyItems} maxItems={15} />

        <section className="card history-table-card">
          <div className="history-header">
            <h3>Recent Predictions</h3>
            <label className="auto-refresh-toggle">
              <input 
                type="checkbox" 
                checked={enabled} 
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Auto-refresh (3s)</span>
            </label>
          </div>
          
          {items.length === 0 ? (
            <p className="empty-state">No predictions yet. Submit a flow to see history.</p>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Result</th>
                    <th>Confidence</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Protocol</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 20).map((item) => {
                    const isAttack = item.label === 'Attack' || item.label === '1';
                    const payload = item.payload || {};
                    return (
                      <tr key={item.id}>
                        <td className="time-cell">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                        <td>
                          <span className={`label-badge ${isAttack ? 'label-badge--attack' : 'label-badge--normal'}`}>
                            {isAttack ? '🔴 Attack' : '🟢 Normal'}
                          </span>
                        </td>
                        <td className="confidence-cell">
                          {(item.probability * 100).toFixed(1)}%
                        </td>
                        <td className="ip-cell">
                          {payload.src_ip}:{payload.src_port}
                        </td>
                        <td className="ip-cell">
                          {payload.dst_ip}:{payload.dst_port}
                        </td>
                        <td className="protocol-cell">{payload.protocol}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
      
      {/* * Toast notification for errors */}
      {error && showToast && (
        <Toast
          message={
            error.status 
              ? `Error ${error.status}: ${error.message}`
              : error.message
          }
          type="error"
          onClose={() => setShowToast(false)}
          duration={7000}
        />
      )}
    </div>
  );
}

