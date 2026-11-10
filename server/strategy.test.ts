import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_CONFIG,
  decide,
  fundingBps8h,
  healthBps,
  iocPrice,
  parseConfig,
  quantityForNotional,
  reduceQuantity,
} from './strategy'

const E18 = 10n ** 18n
const cfg = DEFAULT_CONFIG
const base = { positionSize: 0n, equity: 1000n * E18, mmReq: 0n, markOk: true, cfg }

describe('fundingBps8h', () => {
  test('converts a 1e18 fraction to bps', () => {
    expect(fundingBps8h(E18 / 1000n)).toBe(10) // 0.1% = 10 bps
    expect(fundingBps8h(-E18 / 2000n)).toBe(-5)
  })
})

describe('decide: funding harvest', () => {
  test('flat and positive funding opens a short', () => {
    const d = decide({ ...base, fundingRate: E18 / 1000n })
    expect(d.action).toBe('open')
    if (d.action === 'open') expect(d.isBid).toBe(false)
  })
  test('flat and negative funding opens a long', () => {
    const d = decide({ ...base, fundingRate: -E18 / 1000n })
    expect(d.action).toBe('open')
    if (d.action === 'open') expect(d.isBid).toBe(true)
  })
  test('flat and small funding holds', () => {
    expect(decide({ ...base, fundingRate: E18 / 100_000n }).action).toBe('hold')
  })
  test('short keeps collecting while funding stays positive', () => {
    const d = decide({ ...base, positionSize: -5n * E18, mmReq: 10n * E18, fundingRate: E18 / 1000n })
    expect(d.action).toBe('hold')
  })
  test('closes when funding flips against the position', () => {
    const d = decide({ ...base, positionSize: -5n * E18, mmReq: 10n * E18, fundingRate: -E18 / 1000n })
    expect(d.action).toBe('close')
  })
  test('closes when the edge fades', () => {
    const d = decide({ ...base, positionSize: 5n * E18, mmReq: 10n * E18, fundingRate: -E18 / 1_000_000n })
    expect(d.action).toBe('close')
  })
  test('stale mark blocks new entries', () => {
    expect(decide({ ...base, markOk: false, fundingRate: E18 / 1000n }).action).toBe('hold')
  })
})

describe('decide: liquidation shield', () => {
  const held = { ...base, positionSize: -5n * E18, mmReq: 100n * E18, fundingRate: E18 / 1000n }
  test('healthy account is left alone', () => {
    expect(decide({ ...held, equity: 300n * E18 }).action).toBe('hold')
  })
  test('trims below the trim line', () => {
    expect(decide({ ...held, equity: 140n * E18 }).action).toBe('trim')
  })
  test('closes below the close line', () => {
    expect(decide({ ...held, equity: 110n * E18 }).action).toBe('close')
  })
  test('closes at zero or negative equity', () => {
    expect(decide({ ...held, equity: 0n }).action).toBe('close')
    expect(decide({ ...held, equity: -5n * E18 }).action).toBe('close')
  })
  test('shield wins even when the mark is stale', () => {
    expect(decide({ ...held, equity: 110n * E18, markOk: false }).action).toBe('close')
  })
  test('healthBps is null with no requirement', () => {
    expect(healthBps(10n, 0n)).toBeNull()
  })
})

describe('sizing', () => {
  test('quantityForNotional aligns down to the lot grid', () => {
    // 100 USDso at 50,000 per BTC with 8 decimals = 0.002 BTC = 200_000 raw, lot 1_000
    const q = quantityForNotional(100, 50_000n * E18, 8, 18, 1_000n)
    expect(q).toBe(200_000n)
    expect(quantityForNotional(100, 50_000n * E18, 8, 18, 150_000n)).toBe(150_000n)
  })
  test('zero price gives zero', () => {
    expect(quantityForNotional(100, 0n, 8, 18, 1n)).toBe(0n)
  })
  test('iocPrice crosses the mark on the tick grid', () => {
    const mark = 1000n * E18
    const tick = E18 / 100n
    const bid = iocPrice(mark, true, 50, tick)
    const ask = iocPrice(mark, false, 50, tick)
    expect(bid > mark).toBe(true)
    expect(ask < mark).toBe(true)
    expect(bid % tick).toBe(0n)
    expect(ask % tick).toBe(0n)
  })
  test('reduceQuantity trims, never exceeds the position, falls back to full close', () => {
    expect(reduceQuantity(-1000n, 0.5, 10n, 100n)).toBe(500n)
    expect(reduceQuantity(1000n, 1, 10n, 100n)).toBe(1000n)
    expect(reduceQuantity(150n, 0.5, 10n, 100n)).toBe(150n)
  })
})

describe('parseConfig', () => {
  test('merges valid input', () => {
    expect(parseConfig({ targetNotional: 250 }, cfg).targetNotional).toBe(250)
  })
  test('rejects out of range and wrong types', () => {
    expect(() => parseConfig({ targetNotional: 1e9 }, cfg)).toThrow()
    expect(() => parseConfig({ slippageBps: '50' }, cfg)).toThrow()
    expect(() => parseConfig(null, cfg)).toThrow()
  })
  test('rejects inverted thresholds', () => {
    expect(() => parseConfig({ exitBps8h: 20 }, cfg)).toThrow()
    expect(() => parseConfig({ closeHealthBps: 20000 }, cfg)).toThrow()
  })
})
