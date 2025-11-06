export const LABEL_CANDIDATES = [
  "label_family",
  "label",
  "attack_cat",
  "attack_type",
  "category",
  "threat_type",
  "threat",
  "ground_truth",
  "class",
  "target",
  "is_attack",
  "y"
]

export const POSITIVE_TOKENS = ["attack", "anomaly", "malicious", "1", "true", "positive", "intrusion"]
export const NEGATIVE_TOKENS = ["normal", "benign", "0", "false", "legit", "legitimate", "baseline"]

export function findLabelColumn(columns: string[]): string | null {
  const lowerColumns = new Map(columns.map((column) => [column.toLowerCase(), column]))
  for (const candidate of LABEL_CANDIDATES) {
    const match = lowerColumns.get(candidate)
    if (match) {
      return match
    }
  }
  return null
}

export function normalizeLabel(value: unknown): string | null {
  if (value == null) {
    return null
  }
  const str = String(value).trim()
  return str ? str : null
}

export function inferPositiveLabel(
  labels: string[],
  hint?: string | null,
  fallback?: string | null
): string | null {
  if (!labels.length) {
    return hint ?? fallback ?? null
  }

  const unique = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)))
  const lowerToOriginal = new Map(unique.map((label) => [label.toLowerCase(), label]))

  const hintLower = hint?.toLowerCase()
  if (hintLower && lowerToOriginal.has(hintLower)) {
    return lowerToOriginal.get(hintLower) ?? null
  }

  for (const token of POSITIVE_TOKENS) {
    if (lowerToOriginal.has(token)) {
      return lowerToOriginal.get(token) ?? null
    }
  }

  if (unique.length === 2) {
    for (const label of unique) {
      if (!NEGATIVE_TOKENS.includes(label.toLowerCase())) {
        return label
      }
    }
  }

  if (unique.length > 0) {
    return unique[0]
  }

  return hint ?? fallback ?? null
}
