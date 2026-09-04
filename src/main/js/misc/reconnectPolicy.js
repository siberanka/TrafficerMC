export const DEFAULT_REJOIN_DELAY_MIN = 8000
export const DEFAULT_REJOIN_DELAY_MAX = 15000
export const MIN_REJOIN_DELAY = 3000
export const MAX_REJOIN_DELAY = 300000

function toFiniteInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

export function normalizeRejoinRange(values = {}) {
  let min = toFiniteInteger(values.reconnectDelayMin, DEFAULT_REJOIN_DELAY_MIN)
  let max = toFiniteInteger(values.reconnectDelayMax, DEFAULT_REJOIN_DELAY_MAX)
  min = Math.min(MAX_REJOIN_DELAY, Math.max(MIN_REJOIN_DELAY, min))
  max = Math.min(MAX_REJOIN_DELAY, Math.max(MIN_REJOIN_DELAY, max))
  if (min > max) [min, max] = [max, min]
  return { min, max }
}

export function getRandomRejoinDelay(values = {}, random = Math.random) {
  const { min, max } = normalizeRejoinRange(values)
  const sample = Math.min(0.9999999999999999, Math.max(0, Number(random()) || 0))
  return min + Math.floor(sample * (max - min + 1))
}
