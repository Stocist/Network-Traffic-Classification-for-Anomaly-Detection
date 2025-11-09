import { useMemo } from 'react';

type HistoryItem = {
  id: string;
  label: string;
  probability: number;
  timestamp: number;
};

type Props = {
  items: HistoryItem[];
  onExport?: () => void;
  onClearAll?: () => void;
};

export function StatisticsCard({ items, onExport, onClearAll }: Props) {
  const stats = useMemo(() => {
    if (items.length === 0) {
      return {
        total: 0,
        attacks: 0,
        attackPercent: 0,
        avgConfidence: 0,
      };
    }

    const attacks = items.filter(i => i.label === 'Attack' || i.label === '1').length;
    const avgConf = items.reduce((sum, i) => sum + i.probability, 0) / items.length;

    return {
      total: items.length,
      attacks,
      attackPercent: (attacks / items.length) * 100,
      avgConfidence: avgConf * 100,
    };
  }, [items]);

  return (
    <article className="card statistics-card">
      <h3>Statistics</h3>
      
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Total Predictions</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        
        <div className="stat-item">
          <span className="stat-label">Attacks Detected</span>
          <span className="stat-value stat-value--danger">
            {stats.attacks} <span className="stat-percent">({stats.attackPercent.toFixed(1)}%)</span>
          </span>
        </div>
        
        <div className="stat-item">
          <span className="stat-label">Avg Confidence</span>
          <span className="stat-value">{stats.avgConfidence.toFixed(1)}%</span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="stats-actions">
          {onExport && (
            <button 
              className="btn-secondary btn-sm" 
              onClick={onExport}
              title="Export prediction history to CSV"
            >
              📥 Export CSV
            </button>
          )}
          {onClearAll && (
            <button 
              className="btn-secondary btn-sm btn-danger" 
              onClick={onClearAll}
              title="Clear all prediction history"
            >
              🗑️ Clear All
            </button>
          )}
        </div>
      )}
    </article>
  );
}

