import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { getFriendlyFeatureName, getFeatureDescription } from "../../utils/featureLabels";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Props = { features: { name: string; contribution: number }[]; onClickFeature?: (name: string) => void };

export function FeatureImportance({ features, onClickFeature }: Props) {
  const rawNames = features.map((f) => f.name);
  const labels = features.map((f) => getFriendlyFeatureName(f.name));
  const values = features.map((f) => Math.abs(f.contribution));
  
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: "Importance",
            data: values,
            backgroundColor: values.map((v) => 
              v > 0.1 ? "rgba(211, 47, 47, 0.7)" : "rgba(255, 152, 0, 0.6)"
            ),
            borderColor: values.map((v) => 
              v > 0.1 ? "rgba(211, 47, 47, 1)" : "rgba(255, 152, 0, 1)"
            ),
            borderWidth: 1,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y" as const,
        scales: { 
          x: { 
            beginAtZero: true,
            title: {
              display: true,
              text: "Contribution Magnitude",
            },
          },
          y: {
            ticks: {
              font: {
                size: 11,
              },
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items[0]) return "";
                const idx = items[0].dataIndex;
                return getFriendlyFeatureName(rawNames[idx]);
              },
              label: (context) => {
                return `Impact: ${(context.parsed.x || 0).toFixed(4)}`;
              },
              afterLabel: (context) => {
                const idx = context.dataIndex;
                return getFeatureDescription(rawNames[idx]);
              },
            },
          },
        },
        onClick: (_, elements) => {
          const el = (elements as any)[0];
          if (!el) return;
          const name = rawNames[el.index];
          onClickFeature?.(name);
        },
      }}
    />
  );
}

