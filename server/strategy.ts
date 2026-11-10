/**
 * Melo strategy core. Pure functions only: no network, no clock, no randomness.
 * Every trading decision comes from here so it can be unit tested and replayed.
 */

export interface StrategyConfig {
  /** Open a funding-harvest position when |funding| per 8h is at or above this (bps). */
  entryBps8h: number
  /** Close the position when |funding| per 8h falls below this (bps). */
  exitBps8h: number
  /** Position size to target, in USDso notional. */
  targetNotional: number
  /** Price band around the mark for IOC orders (bps). */
  slippageBps: number
  /** equity / maintenance margin below this ratio trims the position (bps, 15000 = 1.5x). */
  trimHealthBps: number
  /** equity / maintenance margin below this ratio closes the position (bps). */
  closeHealthBps: number
  /** Share of the position removed on a trim (0 to 1). */
  trimFraction: number
}

export const DEFAULT_CONFIG: StrategyConfig = {
  entryBps8h: 5,
  exitBps8h: 1,
  targetNotional: 100,
  slippageBps: 50,
  trimHealthBps: 15000,
  closeHealthBps: 12000,
  trimFraction: 0.5,
}

export const LIMITS = {
  maxNotional: 10_000,
  maxSlippageBps: 300,
} as const

export type Decision =
  | { action: 'hold'; reason: string }
  | { action: 'open'; isBid: boolean; notional: number; reason: string }
  | { action: 'trim'; fraction: number; reason: string }
  | { action: 'close'; reason: string }

const ONE = 10n ** 18n

/** Funding rate (1e18 fraction per 8h window) as basis points, two decimals kept. */
export function fundingBps8h(rate: bigint): number {
  return Number((rate * 1_000_000n) / ONE) / 100
}

/** equity / maintenance margin in bps. Null when nothing is held against it. */
export function healthBps(equity: bigint, mmReq: bigint): number | null {
  if (mmReq <= 0n) return null
  if (equity <= 0n) return 0
  return Number((equity * 10_000n) / mmReq)
}

export interface DecideInput {
  fundingRate: bigint
  positionSize: bigint
  equity: bigint
  mmReq: bigint
  markOk: boolean
  cfg: StrategyConfig
}

export function decide(i: DecideInput): Decision {
  const { cfg, positionSize } = i
  const held = positionSize !== 0n

  // 1. Liquidation shield always runs first and never depends on the funding view.
  if (held) {
    const h = healthBps(i.equity, i.mmReq)
    if (h !== null && h < cfg.closeHealthBps) {
      return { action: 'close', reason: `Shield: margin health ${(h / 10000).toFixed(2)}x is below the close line` }
    }
    if (h !== null && h < cfg.trimHealthBps) {
      return { action: 'trim', fraction: cfg.trimFraction, reason: `Shield: margin health ${(h / 10000).toFixed(2)}x is below the trim line` }
    }
  }

  if (!i.markOk) return { action: 'hold', reason: 'Mark price feed is stale' }

  // 2. Funding harvest. Positive funding means longs pay shorts, so sit short.
  const fb = fundingBps8h(i.fundingRate)
  const abs = Math.abs(fb)

  if (!held) {
    if (abs >= cfg.entryBps8h) {
      const isBid = fb < 0
      return {
        action: 'open',
        isBid,
        notional: cfg.targetNotional,
        reason: `Funding ${fb.toFixed(2)} bps per 8h: ${isBid ? 'shorts pay longs' : 'longs pay shorts'}`,
      }
    }
    return { action: 'hold', reason: `Funding ${fb.toFixed(2)} bps per 8h is under the ${cfg.entryBps8h} bps entry line` }
  }

  const isLong = positionSize > 0n
  const collecting = (isLong && fb < 0) || (!isLong && fb > 0)
  if (!collecting && abs >= cfg.exitBps8h) {
    return { action: 'close', reason: `Funding flipped to ${fb.toFixed(2)} bps per 8h, this side now pays` }
  }
  if (abs < cfg.exitBps8h) {
    return { action: 'close', reason: `Funding edge faded to ${fb.toFixed(2)} bps per 8h` }
  }
  return { action: 'hold', reason: `Collecting funding at ${abs.toFixed(2)} bps per 8h` }
}

/** Quantity in raw base units for a notional, rounded down to the lot grid. */
export function quantityForNotional(
  notional: number,
  price: bigint,
  baseDecimals: number,
  quoteDecimals: number,
  lotSize: bigint,
): bigint {
  if (price <= 0n || notional <= 0) return 0n
  const notionalRaw = BigInt(Math.floor(notional * 1_000_000)) * 10n ** BigInt(quoteDecimals) / 1_000_000n
  const qty = (notionalRaw * 10n ** BigInt(baseDecimals)) / price
  return alignDown(qty, lotSize)
}

export function alignDown(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value
  return (value / step) * step
}

export function alignUp(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value
  return ((value + step - 1n) / step) * step
}

/** IOC limit price: bids sit above the mark, asks below, both on the tick grid. */
export function iocPrice(mark: bigint, isBid: boolean, slippageBps: number, tickSize: bigint): bigint {
  const bps = BigInt(Math.round(slippageBps))
  if (isBid) return alignUp((mark * (10_000n + bps)) / 10_000n, tickSize)
  return alignDown((mark * (10_000n - bps)) / 10_000n, tickSize)
}

/** Order size that shrinks a position. Falls back to a full close when a trim would be below the minimum. */
export function reduceQuantity(
  positionSize: bigint,
  fraction: number,
  lotSize: bigint,
  minQuantity: bigint,
): bigint {
  const abs = positionSize < 0n ? -positionSize : positionSize
  const full = alignDown(abs, lotSize)
  if (fraction >= 1) return full
  const part = alignDown((abs * BigInt(Math.round(fraction * 10_000))) / 10_000n, lotSize)
  return part >= minQuantity ? part : full
}

type Unknownish = Record<string, unknown>

/** Validate and merge a partial config coming from the control API. Throws on bad input. */
export function parseConfig(input: unknown, base: StrategyConfig): StrategyConfig {
  if (typeof input !== 'object' || input === null) throw new Error('config must be an object')
  const src = input as Unknownish
  const next: StrategyConfig = { ...base }
  const num = (key: keyof StrategyConfig, min: number, max: number) => {
    if (src[key] === undefined) return
    const v = src[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      throw new Error(`${key} must be a number between ${min} and ${max}`)
    }
    next[key] = v
  }
  num('entryBps8h', 0.1, 1000)
  num('exitBps8h', 0, 1000)
  num('targetNotional', 1, LIMITS.maxNotional)
  num('slippageBps', 1, LIMITS.maxSlippageBps)
  num('trimHealthBps', 10_001, 100_000)
  num('closeHealthBps', 10_001, 100_000)
  num('trimFraction', 0.05, 1)
  if (next.exitBps8h >= next.entryBps8h) throw new Error('exitBps8h must be lower than entryBps8h')
  if (next.closeHealthBps >= next.trimHealthBps) throw new Error('closeHealthBps must be lower than trimHealthBps')
  return next
}
