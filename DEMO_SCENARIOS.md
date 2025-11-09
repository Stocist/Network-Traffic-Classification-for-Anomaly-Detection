# Real-Time Prediction Demo Scenarios

## 🎯 Scenarios that Show Clear Differences

The model has limited features from single-flow input (only 8 params vs 46 model features),
so we need EXTREME differences to see clear attack vs normal predictions.

---

### ✅ Scenario A: Normal Web Traffic (Baseline)
**Expected: Normal / Low confidence (10-30%)**

```
Source IP: 192.168.1.10
Source Port: 49152
Destination IP: 172.217.14.206
Destination Port: 443
Protocol: TCP
Packet Bytes: 1500
Packet Count: 10
Inter-arrival Time: 50
```

**Why Normal**: HTTPS on standard port, reasonable size, human-paced

---

### 🔴 Scenario B: High-Volume Flood Attack
**Expected: Attack / High confidence (70-95%)**

```
Source IP: 203.45.123.89
Source Port: 54321
Destination IP: 192.168.1.100
Destination Port: 80
Protocol: UDP
Packet Bytes: 512
Packet Count: 50000      ← MASSIVE (creates extreme sload/dload)
Inter-arrival Time: 0.1   ← VERY FAST (creates high rate)
```

**Why Attack**: 
- **rate** = 512 × 50000 / (0.1 × 50000 / 1000) = ~512 MB/s (extreme!)
- **sload/dload** = Extremely high (calculated from rate)
- **Low jitter** = Automated traffic pattern
- **UDP protocol** = Unusual for high-volume traffic

---

### 🔴 Scenario C: Data Exfiltration Pattern
**Expected: Attack / Medium-High confidence (60-85%)**

```
Source IP: 192.168.1.55
Source Port: 8080
Destination IP: 45.33.32.156
Destination Port: 443
Protocol: TCP
Packet Bytes: 15000       ← LARGE
Packet Count: 5000        ← HIGH VOLUME
Inter-arrival Time: 2
```

**Why Attack**: Huge packet size + high volume = data exfiltration

---

### ✅ Scenario D: Low-Activity Normal
**Expected: Normal / Very Low confidence (5-20%)**

```
Source IP: 10.1.1.50
Source Port: 143
Destination IP: 74.125.224.108
Destination Port: 993
Protocol: TCP
Packet Bytes: 800
Packet Count: 3           ← LOW
Packet Bytes: 800
Inter-arrival Time: 200   ← SLOW
```

**Why Normal**: Low volume, slow pace, standard ports

---

### 🔴 Scenario E: ICMP Flood
**Expected: Attack / High confidence (75-95%)**

```
Source IP: 172.16.5.99
Source Port: 0
Destination IP: 192.168.1.1
Destination Port: 0
Protocol: ICMP            ← UNUSUAL
Packet Bytes: 56
Packet Count: 50000       ← MASSIVE
Inter-arrival Time: 0.05  ← EXTREMELY FAST
```

**Why Attack**: ICMP flood (ping flood) - massive count, ultra-fast

---

## 📊 Demo Flow Recommendation

1. **Start with A (Normal)** → Show ~15-25% confidence
2. **Switch to B (Flood)** → Show jump to ~80-90% confidence
3. **Try C (Exfiltration)** → Show ~70% confidence  
4. **Back to D (Normal)** → Show drop to ~10-20%
5. **End with E (ICMP Flood)** → Show ~85-95% confidence

**Key Talking Points:**
- "The model looks at packet count, timing, and protocol patterns"
- "Watch how extreme values trigger high confidence scores"
- "The trend chart shows our testing pattern over time"
- "Export feature lets you document these test results"

---

## 🔑 What Actually Matters for Detection

Since only 8 features are sent, these have the biggest impact:

| Feature | Normal Range | Attack Pattern |
|---------|-------------|----------------|
| **pkt_count** | 1-100 | 1000-50000 |
| **inter_arrival_ms** | 20-200ms | 0.1-5ms |
| **pkt_bytes** | 500-2000 | 64 or 10000+ |
| **protocol** | TCP | UDP, ICMP |
| **dst_port** | 80, 443, 25 | Random high ports |

Focus on these for dramatic demo differences!

