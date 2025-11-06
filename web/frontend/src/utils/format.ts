export function formatSamplingPercent(fraction?: number | null): string | null {
  if (typeof fraction !== "number" || Number.isNaN(fraction)) {
    return null
  }
  const percent = fraction * 100
  if (!Number.isFinite(percent)) {
    return null
  }
  const rounded = Number(percent.toFixed(1))
  if (Number.isNaN(rounded)) {
    return null
  }
  if (Number.isInteger(rounded)) {
    return Math.trunc(rounded).toString()
  }
  return rounded.toString()
}
