import { Chart as ChartJS, Tooltip, Legend, CategoryScale, LinearScale, ColorScale, PointElement } from "chart.js";
import { MatrixController, MatrixElement } from "chartjs-chart-matrix";
import { Chart } from "react-chartjs-2";

ChartJS.register(MatrixController, MatrixElement, Tooltip, Legend, CategoryScale, LinearScale, ColorScale, PointElement);

type Props = {
  labels: string[];
  matrix: number[][]; // rows: actual, cols: predicted
  onCellClick?: (actual: string, predicted: string) => void;
};

export function ConfusionMatrix({ labels, matrix, onCellClick }: Props) {
  const data = [] as any[];
  const size = labels.length;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      data.push({ x: labels[j], y: labels[i], v: matrix[i][j] || 0 });
    }
  }
  return (
    <Chart
      type="matrix"
      data={{ datasets: [{ label: "Confusion", data, backgroundColor: (ctx:any) => {
        const v = ctx.raw.v as number; const max = Math.max(...data.map(d => d.v), 1);
        const alpha = Math.min(1, v / max);
        return `rgba(25,118,210,${0.2 + 0.8*alpha})`;
      }}]}}
      options={{
        parsing: { xAxisKey: "x", yAxisKey: "y", key: "v" },
        scales: { x: { type: "category" }, y: { type: "category" } },
        plugins: { tooltip: { callbacks: { label: (ctx:any) => `Count: ${ctx.raw.v}` } } },
        onClick: (_, elements) => {
          const el = (elements as any)[0];
          if (!el) return;
          const { x, y } = data[el.index];
          onCellClick?.(y, x);
        },
      }}
    />
  );
}

