import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "../api/http";

export type PredictRequest = {
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  protocol: "TCP" | "UDP" | "ICMP" | "GRE" | "ESP" | "AH" | "OTHER";
  pkt_bytes: number;
  pkt_count: number;
  inter_arrival_ms: number;
};

export type FeatureContribution = { name: string; contribution: number };

export type PredictResponse = {
  label: string;
  probability: number;
  top_features: FeatureContribution[];
  timestamp: string;
};

export function usePrediction() {
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const predict = useCallback(async (payload: PredictRequest) => {
    if (inFlight.current) return;
    setError(null);
    setLoading(true);
    inFlight.current = true;
    try {
      const { data } = await http.post<PredictResponse>(`/predict`, payload);
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Prediction failed");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  return { result, loading, error, predict };
}

export type HistoryItem = {
  id: string;
  timestamp: string;
  label: string;
  probability: number;
  payload: Record<string, any>;
};

export function useHistory(pollMs: number | null = 3000) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [enabled, setEnabled] = useState<boolean>(pollMs != null);

  useEffect(() => {
    let timer: any;
    async function tick() {
      try {
        const { data } = await http.get<{ items: HistoryItem[] }>(`/metrics/history?limit=100`);
        setItems(data.items);
      } catch (e) {
        // ignore
      }
      if (enabled && pollMs) {
        timer = setTimeout(tick, pollMs);
      }
    }
    if (enabled && pollMs) tick();
    return () => timer && clearTimeout(timer);
  }, [pollMs, enabled]);

  return { items, enabled, setEnabled };
}

