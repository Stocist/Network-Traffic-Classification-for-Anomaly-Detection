import { useCallback, useMemo, useState } from "react";
import { InputForm } from "../components/InputForm";
import { PredictionGauge } from "../components/Charts/PredictionGauge";
import { FeatureImportance } from "../components/Charts/FeatureImportance";
import { ConfusionMatrix } from "../components/Charts/ConfusionMatrix";
import { useHistory, usePrediction } from "../hooks/usePrediction";

export default function JsonDashboardPage() {
  const { result, loading, error, predict } = usePrediction();
  const { items, enabled, setEnabled } = useHistory(3000);
  const [threshold, setThreshold] = useState(0.5);

  const matrix = useMemo(() => {
    // Fake a 2x2 confusion-like grid from history counts (predicted only)
    const counts: Record<string, number> = {};
    items.forEach((i) => (counts[i.label] = (counts[i.label] || 0) + 1));
    const labels = Object.keys(counts).length ? Object.keys(counts) : ["Normal", "Attack"];
    const size = labels.length;
    const mat = Array.from({ length: size }, () => Array(size).fill(0));
    labels.forEach((l, idx) => { mat[idx][idx] = counts[l] || 0; });
    return { labels, mat };
  }, [items]);

  const onSubmit = useCallback(async (payload: any) => {
    await predict(payload);
  }, [predict]);

  return (
    <div className="json-dash">
      <h2>Real-time Prediction</h2>
      <p>Enter a single flow and get an immediate prediction with confidence and explainability.</p>
      <InputForm onSubmit={onSubmit} disabled={loading} />
      {error ? <p className="upload-error">{String(error)}</p> : null}

      {result && (
        <section className="grid-2">
          <article>
            <h3>Prediction Confidence</h3>
            <PredictionGauge probability={result.probability} threshold={threshold} />
            <div className="controls">
              <label>Threshold
                <input type="range" min={0} max={1} step={0.01} value={threshold} onChange={(e)=> setThreshold(parseFloat(e.target.value))}/>
              </label>
            </div>
          </article>
          <article>
            <h3>Top Feature Contributions</h3>
            <FeatureImportance features={result.top_features} onClickFeature={(n)=> alert(`Feature: ${n}`)} />
          </article>
        </section>
      )}

      <section className="chart-card">
        <div className="row">
          <h3>Recent Predictions</h3>
          <label style={{marginLeft: "auto"}}>
            Auto-refresh
            <input type="checkbox" checked={enabled} onChange={(e)=> setEnabled(e.target.checked)} style={{marginLeft: 8}}/>
          </label>
        </div>
        <div className="history-list">
          {items.length === 0 ? (
            <p style={{color: '#888', fontStyle: 'italic'}}>No predictions yet. Submit a flow to see history.</p>
          ) : (
            items.slice(0, 10).map((i) => (
              <div key={i.id} className="history-item">
                <span>{new Date(i.timestamp).toLocaleTimeString()}</span>
                <b style={{marginLeft: 8}}>{i.label}</b>
                <span style={{marginLeft: 8}}>{(i.probability * 100).toFixed(1)}%</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="chart-card">
        <h3>Predicted Distribution (Confusion-like)</h3>
        <ConfusionMatrix labels={matrix.labels} matrix={matrix.mat} onCellClick={(a,p) => console.log(a,p)} />
      </section>
    </div>
  );
}

