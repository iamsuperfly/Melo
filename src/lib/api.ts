export interface StrategyConfig {
  entryBps8h: number
  exitBps8h: number
  targetNotional: number
  slippageBps: number
  trimHealthBps: number
  closeHealthBps: number
  trimFraction: number
}

export type Decision =
  | { action: 'hold'; reason: string }
  | { action: 'open'; isBid: boolean; notional: number; reason: string }
  | { action: 'trim'; fraction: number; reason: string }
  | { action: 'close'; reason: string }

export interface Signal {
  kind: 'ready' | 'smaller' | 'blocked' | 'idle' | 'guard'
  title: string
  detail: string
  quantity?: string
}

export interface Status {
  at: number
  network: { name: string; chainId: number; explorer: string }
  mode: 'linked' | 'direct' | 'readonly'
  account: string | null
  botAddress: string | null
  enabled: boolean
  running: boolean
  controlsEnabled: boolean
  loopMs: number
  config: StrategyConfig
  market: {
    symbol: string
    pool: string
    marginBank: string
    mark: string
    markOk: boolean
    fundingBps8h: number
    aprPct: number
    openInterest: string
    maxLeverage: number
  }
  position: null | {
    side: 'long' | 'short' | 'flat'
    size: string
    entry: string
    notional: string
    unrealizedPnl: string | null
    accruedFunding: string | null
    liqPrice: string | null
  }
  margin: null | {
    equity: string
    unlocked: string
    locked: string
    mmReq: string
    healthRatio: number | null
    status: string
  }
  decision: Decision
  signal: Signal
  lastTick: { at: number; summary: string } | null
}

export interface MarketSummary {
  symbol: string
  pool: string
  mark: string | null
  fundingBps8h: number
  aprPct: number
  maxLeverage: number
}

export interface Receipt {
  id: string
  ts: number
  kind: 'open' | 'trim' | 'close'
  symbol: string
  side: 'buy' | 'sell'
  quantity: string
  price: string
  hash: string | null
  status: 'confirmed' | 'reverted' | 'skipped' | 'error'
  reason: string
  detail?: string
}

export interface ProofFill {
  id: string
  symbol: string | null
  side: 'buy' | 'sell' | null
  role: 'taker' | 'maker'
  price: string
  quantity: string
  timestamp: number
  txHash: string
  placedByMelo: boolean
}

export interface Proof {
  account: string
  explorer: string
  fills: ProofFill[]
  receipts: Receipt[]
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`)
  return body as T
}

export const api = {
  status: () => request<Status>('/api/status'),
  markets: () => request<{ markets: MarketSummary[] }>('/api/markets').then((r) => r.markets),
  receipts: () => request<{ receipts: Receipt[]; explorer: string }>('/api/receipts'),
  proof: (address?: string) =>
    request<Proof>(`/api/proof${address ? `?address=${encodeURIComponent(address)}` : ''}`),
  control: (token: string, body: unknown, path = '/api/control') =>
    request<Status & { summary?: string; hash?: string }>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
}
