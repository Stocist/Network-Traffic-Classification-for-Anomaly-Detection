import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

type Props = { probability: number; threshold?: number };

export function PredictionGauge({ probability, threshold = 0.5 }: Props) {
  const pct = Math.max(0, Math.min(1, probability));
  const data = {
    labels: ["Anomaly", "Normal"],
    datasets: [
      {
        label: "Confidence",
        data: [pct, 1 - pct],
        backgroundColor: ["#d32f2f", "#66bb6a"],
        borderWidth: 1,
      },
    ],
  };
  const plugins = [
    {
      id: "threshold",
      afterDraw(chart: any) {
        const { ctx, chartArea } = chart;
        const x = chart.getDatasetMeta(0).data[0].x;
        const y = chart.getDatasetMeta(0).data[0].y;
        ctx.save();
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Threshold: ${Math.round(threshold * 100)}%`, x, chartArea.bottom - 10);
        ctx.restore();
      },
    },
  ];
  return <Doughnut data={data} plugins={plugins as any} />;
}

