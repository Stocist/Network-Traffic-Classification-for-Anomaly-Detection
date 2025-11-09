import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type HistoryItem = {
  id: string;
  label: string;
  probability: number;
  timestamp: number;
};

type Props = {
  items: HistoryItem[];
  maxItems?: number;
};

export function ConfidenceTrendChart({ items, maxItems = 15 }: Props) {
  const chartData = useMemo(() => {
    // * Take the most recent N items
    const recentItems = items.slice(0, maxItems).reverse();
    
    if (recentItems.length === 0) {
      return null;
    }

    const labels = recentItems.map((item, idx) => {
      const date = new Date(item.timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    const confidences = recentItems.map(item => item.probability * 100);
    const pointColors = recentItems.map(item => 
      item.label === 'Attack' || item.label === '1' ? '#ef5350' : '#66bb6a'
    );
    const pointBorderColors = recentItems.map(item => 
      item.label === 'Attack' || item.label === '1' ? '#d32f2f' : '#388e3c'
    );

    return {
      labels,
      datasets: [
        {
          label: 'Confidence',
          data: confidences,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointBorderColors,
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }, [items, maxItems]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 3,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const item = items[maxItems - 1 - context.dataIndex];
            if (!item) return '';
            const label = item.label === 'Attack' || item.label === '1' ? 'Attack' : 'Normal';
            return `${label}: ${context.parsed.y.toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value: any) => `${value}%`,
          font: { size: 10 },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        ticks: {
          font: { size: 9 },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          display: false,
        },
      },
    },
  }), [items, maxItems]);

  if (!chartData) {
    return (
      <article className="card trend-chart-card trend-chart-card--empty">
        <h3>Confidence Trend</h3>
        <p className="empty-state">Prediction history will appear here as you submit flows</p>
      </article>
    );
  }

  return (
    <article className="card trend-chart-card">
      <h3>Confidence Trend (Last {Math.min(items.length, maxItems)} Predictions)</h3>
      <p className="chart-hint">
        <span className="legend-item">
          <span className="legend-dot legend-dot--normal"></span> Normal
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-dot--attack"></span> Attack
        </span>
      </p>
      <div className="chart-container">
        <Line data={chartData} options={options} />
      </div>
    </article>
  );
}

