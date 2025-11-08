import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PredictRequest } from "../hooks/usePrediction";

const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const schema = z.object({
  src_ip: z.string().regex(ipRegex, "Invalid IPv4"),
  dst_ip: z.string().regex(ipRegex, "Invalid IPv4"),
  src_port: z.coerce.number().min(1).max(65535),
  dst_port: z.coerce.number().min(1).max(65535),
  protocol: z.enum(["TCP", "UDP", "ICMP", "GRE", "ESP", "AH", "OTHER"]),
  pkt_bytes: z.coerce.number().min(0),
  pkt_count: z.coerce.number().min(1),
  inter_arrival_ms: z.coerce.number().min(0),
});

type Props = {
  onSubmit: (payload: PredictRequest) => Promise<void> | void;
  disabled?: boolean;
};

export function InputForm({ onSubmit, disabled }: Props) {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<PredictRequest>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      src_ip: "192.168.1.10",
      dst_ip: "10.0.0.5",
      src_port: 443,
      dst_port: 51515,
      protocol: "TCP",
      pkt_bytes: 1500,
      pkt_count: 10,
      inter_arrival_ms: 12,
    }
  });

  return (
    <form className="input-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid">
        <label>
          Src IP
          <input {...register("src_ip")} placeholder="192.168.1.10" />
          {errors.src_ip && <span className="err">{errors.src_ip.message}</span>}
        </label>
        <label>
          Dst IP
          <input {...register("dst_ip")} placeholder="10.0.0.5" />
          {errors.dst_ip && <span className="err">{errors.dst_ip.message}</span>}
        </label>
        <label>
          Src Port
          <input type="number" {...register("src_port")} />
          {errors.src_port && <span className="err">{errors.src_port.message}</span>}
        </label>
        <label>
          Dst Port
          <input type="number" {...register("dst_port")} />
          {errors.dst_port && <span className="err">{errors.dst_port.message}</span>}
        </label>
        <label>
          Protocol
          <select {...register("protocol")}> 
            {(["TCP","UDP","ICMP","GRE","ESP","AH","OTHER"] as const).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.protocol && <span className="err">{errors.protocol.message}</span>}
        </label>
        <label>
          Packet bytes
          <input type="number" {...register("pkt_bytes")} />
          {errors.pkt_bytes && <span className="err">{errors.pkt_bytes.message}</span>}
        </label>
        <label>
          Packet count
          <input type="number" {...register("pkt_count")} />
          {errors.pkt_count && <span className="err">{errors.pkt_count.message}</span>}
        </label>
        <label>
          Inter-arrival (ms)
          <input type="number" {...register("inter_arrival_ms")} />
          {errors.inter_arrival_ms && <span className="err">{errors.inter_arrival_ms.message}</span>}
        </label>
      </div>
      <div className="actions">
        <button type="submit" disabled={!isValid || disabled}>Predict</button>
      </div>
    </form>
  );
}

