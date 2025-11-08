import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Props = { features: { name: string; contribution: number }[]; onClickFeature?: (name: string) => void };

export function FeatureImportance({ features, onClickFeature }: Props) {
  const labels = features.map((f) => f.name);
  const values = features.map((f) => Math.abs(f.contribution));
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: "Contribution",
            data: values,
            backgroundColor: "rgba(255, 159, 64, 0.6)",
          },
        ],
      }}
      options={{
        scales: { y: { beginAtZero: true } },
        onClick: (_, elements) => {
          const el = (elements as any)[0];
          if (!el) return;
          const name = labels[el.index];
          onClickFeature?.(name);
        },
      }}
    />
  );
}

