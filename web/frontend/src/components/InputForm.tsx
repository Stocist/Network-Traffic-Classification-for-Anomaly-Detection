import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PredictRequest } from "../hooks/usePrediction";

// * More strict IPv4 validation: each octet must be 0-255
const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const schema = z.object({
  src_ip: z.string().regex(ipRegex, "Invalid IPv4 address (e.g., 192.168.1.10)"),
  dst_ip: z.string().regex(ipRegex, "Invalid IPv4 address (e.g., 10.0.0.5)"),
  src_port: z.coerce.number().int().min(0, "Port must be 0-65535").max(65535, "Port must be 0-65535"),
  dst_port: z.coerce.number().int().min(0, "Port must be 0-65535").max(65535, "Port must be 0-65535"),
  protocol: z.enum(["TCP", "UDP", "ICMP", "GRE", "ESP", "AH", "OTHER"]),
  pkt_bytes: z.coerce.number().min(0, "Must be non-negative"),
  pkt_count: z.coerce.number().int().min(1, "Must be at least 1"),
  inter_arrival_ms: z.coerce.number().min(0, "Must be non-negative"),
});

type Props = {
  onSubmit: (payload: PredictRequest) => Promise<void> | void;
  disabled?: boolean;
};

export function InputForm({ onSubmit, disabled }: Props) {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<PredictRequest>({
    resolver: zodResolver(schema) as any,
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
        {/* * IP Addresses Row */}
        <label className="form-field">
          Source IP Address
          <input 
            {...register("src_ip")} 
            placeholder="192.168.1.10" 
            aria-label="Source IP address"
            aria-invalid={errors.src_ip ? "true" : "false"}
          />
          {errors.src_ip ? (
            <p className="field-error">{errors.src_ip.message}</p>
          ) : (
            <p className="form-hint">IPv4 format (e.g., 192.168.1.10)</p>
          )}
        </label>
        <label className="form-field">
          Destination IP Address
          <input 
            {...register("dst_ip")} 
            placeholder="10.0.0.5" 
            aria-label="Destination IP address"
            aria-invalid={errors.dst_ip ? "true" : "false"}
          />
          {errors.dst_ip ? (
            <p className="field-error">{errors.dst_ip.message}</p>
          ) : (
            <p className="form-hint">IPv4 format (e.g., 10.0.0.5)</p>
          )}
        </label>
        <label className="form-field">
          Source Port
          <input 
            type="number" 
            min="0" 
            max="65535" 
            {...register("src_port")} 
            aria-label="Source port"
            aria-invalid={errors.src_port ? "true" : "false"}
          />
          {errors.src_port ? (
            <p className="field-error">{errors.src_port.message}</p>
          ) : (
            <p className="form-hint">Range: 0-65535</p>
          )}
        </label>
        <label className="form-field">
          Destination Port
          <input 
            type="number" 
            min="0" 
            max="65535" 
            {...register("dst_port")} 
            aria-label="Destination port"
            aria-invalid={errors.dst_port ? "true" : "false"}
          />
          {errors.dst_port ? (
            <p className="field-error">{errors.dst_port.message}</p>
          ) : (
            <p className="form-hint">Range: 0-65535</p>
          )}
        </label>
        {/* * Protocol & Packet Bytes Row */}
        <label className="form-field">
          Protocol
          <select 
            {...register("protocol")} 
            aria-label="Network protocol"
            aria-invalid={errors.protocol ? "true" : "false"}
          > 
            {(["TCP","UDP","ICMP","GRE","ESP","AH","OTHER"] as const).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.protocol && <p className="field-error">{errors.protocol.message}</p>}
        </label>
        <label className="form-field">
          Packet Bytes
          <input 
            type="number" 
            min="0" 
            {...register("pkt_bytes")} 
            aria-label="Total packet bytes"
            aria-invalid={errors.pkt_bytes ? "true" : "false"}
          />
          {errors.pkt_bytes ? (
            <p className="field-error">{errors.pkt_bytes.message}</p>
          ) : (
            <p className="form-hint">Total bytes transferred</p>
          )}
        </label>
        <label className="form-field">
          Packet Count
          <input 
            type="number" 
            min="1" 
            {...register("pkt_count")} 
            aria-label="Number of packets"
            aria-invalid={errors.pkt_count ? "true" : "false"}
          />
          {errors.pkt_count ? (
            <p className="field-error">{errors.pkt_count.message}</p>
          ) : (
            <p className="form-hint">Number of packets in flow</p>
          )}
        </label>
        <label className="form-field">
          Inter-arrival Time (ms)
          <input 
            type="number" 
            min="0" 
            step="0.1" 
            {...register("inter_arrival_ms")} 
            aria-label="Inter-arrival time in milliseconds"
            aria-invalid={errors.inter_arrival_ms ? "true" : "false"}
          />
          {errors.inter_arrival_ms ? (
            <p className="field-error">{errors.inter_arrival_ms.message}</p>
          ) : (
            <p className="form-hint">Average time between packets</p>
          )}
        </label>
      </div>
      <div className="actions">
        <button type="submit" disabled={!isValid || disabled}>Predict</button>
      </div>
    </form>
  );
}

