import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

type Props = { probability: number; threshold?: number };

export function PredictionGauge({ probability, threshold = 0.5 }: Props) {
  const pct = Math.max(0, Math.min(1, probability));
  
  // * Determine if current probability exceeds threshold
  const isAtRisk = pct >= threshold;
  
  const data = {
    labels: ["Attack Probability", "Normal Probability"],
    datasets: [
      {
        label: "Confidence",
        data: [pct, 1 - pct],
        backgroundColor: [isAtRisk ? "#d32f2f" : "#ff9800", "#66bb6a"],
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };
  
  const options = {
    circumference: 180,
    rotation: -90,
    cutout: "70%",
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || "";
            const value = context.parsed || 0;
            return `${label}: ${(value * 100).toFixed(1)}%`;
          },
        },
      },
    },
  };
  
  const plugins = [
    {
      id: "thresholdMarker",
      afterDraw(chart: any) {
        const { ctx, chartArea } = chart;
        const centerX = chart.getDatasetMeta(0).data[0]?.x || chartArea.left + chartArea.width / 2;
        const centerY = chart.getDatasetMeta(0).data[0]?.y || chartArea.top + chartArea.height / 2;
        const radius = chart.getDatasetMeta(0).data[0]?.outerRadius || 100;
        
        // * Draw threshold marker line
        const angle = -90 + (180 * threshold); // -90 to 90 degrees
        const rad = (angle * Math.PI) / 180;
        const x2 = centerX + radius * Math.cos(rad);
        const y2 = centerY + radius * Math.sin(rad);
        
        ctx.save();
        ctx.strokeStyle = "#ffa726";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // * Draw threshold label
        ctx.fillStyle = "#333";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `Threshold: ${Math.round(threshold * 100)}%`,
          centerX,
          centerY + 40
        );
        
        // * Draw status indicator
        ctx.font = "12px sans-serif";
        ctx.fillStyle = isAtRisk ? "#d32f2f" : "#66bb6a";
        ctx.fillText(
          isAtRisk ? "⚠️ At Risk" : "✓ Normal",
          centerX,
          centerY + 60
        );
        
        ctx.restore();
      },
    },
  ];
  
  return <Doughnut data={data} options={options} plugins={plugins as any} />;
}

