export function price(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 8
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })
}

export function usd(v: string | number | null | undefined, compact = false): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact && Math.abs(n) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: compact && Math.abs(n) >= 100_000 ? 2 : 2,
  })
}

export function qty(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : 6 })
}

export function signed(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`
}

export function shortHash(h: string): string {
  return `${h.slice(0, 8)}...${h.slice(-6)}`
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

/** Tx links assume the explorer serves transactions under /tx/<hash>. */
export const txUrl = (explorer: string, hash: string) => `${explorer}/tx/${hash}`
