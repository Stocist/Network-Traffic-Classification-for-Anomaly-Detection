# Software Vulnerabilities Dataset — Classroom Edition

This dataset is tailored for teaching **software vulnerability detection** and **secure coding**. Each record describes a concrete vulnerability instance, including a short description and a minimal code snippet that illustrates the issue, along with exploitation hints and mitigation ideas. The format is lightweight and ready for text- and code-based machine learning.

---

## What’s Inside

- **Format:** JSON Lines (`.jsonl`) — one JSON object per line  
- **Records:** ~1,000 unique vulnerability entries  
- **Goal:** Build models or rules that can identify and reason about vulnerable code patterns across languages and categories

---

## Schema (per record)

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier (e.g., `vuln-001`) |
| `language` | string | Programming language or framework (e.g., JavaScript, Python, Java, PHP, Ruby, Go, C#, Kotlin, Scala, Rust, Elixir, Perl) |
| `vulnerability_type` | string | Human-readable vulnerability category (e.g., “Cross-Site Scripting (XSS)”, “SQL Injection”) |
| `description` | string | Brief explanation of the underlying flaw |
| `code_snippet` | string | Minimal example demonstrating the vulnerable pattern |
| `exploitation_techniques` | string | How an attacker might exploit the issue (high-level guidance) |
| `mitigation` | string | Recommended fix or secure alternative (e.g., validation, sanitization, parameterization) |

> Tip: You can convert the JSONL to CSV if your workflow prefers tabular data.

---

## Vulnerability Categories (examples)

Includes a wide range of classic and modern categories such as:
- **Cross-Site Scripting (XSS)**
- **SQL Injection**
- **Command Injection**
- **Insecure Deserialization**
- **Server-Side Request Forgery (SSRF)**
- **Insecure File Upload**
- **Insecure Regular Expressions (ReDoS)**
- **Insecure HTTP Headers / Methods**
- **Insecure Session / Token Handling**
- **Insecure CORS / Output Encoding / Password Storage**
- **Dependency / Configuration Weaknesses**, etc.

> You may group categories into broader families (e.g., *Injection*, *Auth/Session*, *Config/Deps*, *Input Validation*) for multi-class tasks.

---

## Quick Start

### Load JSONL → DataFrame (Python)

```python
import json, pandas as pd

path = "basic_data_3.jsonl"  # adjust to your filename
rows = []
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        rows.append(json.loads(line))
df = pd.DataFrame(rows)
print(df.head())
