import { annualizedFundingRate } from '@somnia-chain/markets-sdk'
import type { PerpMarket } from '@somnia-chain/markets-sdk'
import { formatUnits, type Address } from 'viem'
import { client, placeIoc } from './chain'
import { botAddress, loopMs, mode, NETWORK, tradingAccount } from './env'
import { addReceipt, getReceipts, getState, type ReceiptKind } from './store'
import {
  decide,
  fundingBps8h,
  healthBps,
  iocPrice,
  quantityForNotional,
  reduceQuantity,
  type Decision,
} from './strategy'

export interface Signal {
  kind: 'ready' | 'smaller' | 'blocked' | 'idle' | 'guard'
  title: string
  detail: string
  /** Human units of the base asset, when an order is planned. */
  quantity?: string
}

export interface Snapshot {
  at: number
  network: { name: string; chainId: number; explorer: string }
  mode: typeof mode
  account: string | null
  botAddress: string | null
  enabled: boolean
  loopMs: number
  config: ReturnType<typeof getState>['config']
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
    /** Net PnL (price move minus funding paid) as a percent of notional. */
    pnlPct: number | null
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

interface PlannedOrder {
  kind: ReceiptKind
  isBid: boolean
  price: bigint
  quantity: bigint
  reason: string
}

const USD = 18
const fmt = (v: bigint, d: number) => formatUnits(v, d)

// ---------- markets ----------

let marketsCache: { at: number; rows: PerpMarket[] } | null = null

/**
 * Tradeable perp markets. The indexer can lag or drop a market that is still live,
 * so the factory on chain is the source of truth and the indexer only fills in history.
 */
export async function getMarkets(): Promise<PerpMarket[]> {
  if (marketsCache && Date.now() - marketsCache.at < 30_000) return marketsCache.rows
  const indexed = await client.listPerpMarkets()
  let rows = indexed
  try {
    const first = indexed[0]
    if (first) {
      const cfg = await client.getPerpSystemConfig(first.marginBank)
      const statuses = await client.listPerpPoolStatuses({ factory: cfg.perpPoolFactory })
      const live = statuses.filter((st) => st.tradeable)
      const liveSet = new Set(live.map((st) => st.pool.toLowerCase()))
      const known = new Set(indexed.map((r) => r.poolAddress.toLowerCase()))
      rows = indexed.filter((r) => liveSet.has(r.poolAddress.toLowerCase()))
      const missing = live.filter((st) => !known.has(st.pool.toLowerCase()))
      const built = await Promise.allSettled(
        missing.map((status) =>
          client.readPerpMarketFromChain({
            status,
            collateralToken: cfg.collateralToken,
            collateralDecimals: USD,
            collateralSymbol: 'USDso',
            factory: cfg.perpPoolFactory,
          }),
        ),
      )
      for (const b of built) if (b.status === 'fulfilled') rows.push(b.value)
    }
  } catch (e) {
    console.error('[melo] could not read markets from chain, using the indexer list:', e instanceof Error ? e.message : e)
  }
  marketsCache = { at: Date.now(), rows }
  return rows
}

let summaryCache: { at: number; list: MarketSummary[] } | null = null

interface MarketSummary {
  symbol: string
  pool: string
  mark: string | null
  fundingBps8h: number
  aprPct: number
  maxLeverage: number
}

export async function listMarketSummaries(): Promise<MarketSummary[]> {
  if (summaryCache && Date.now() - summaryCache.at < 20_000) return summaryCache.list
  const rows = (await getMarkets()).filter((r) => r.baseSymbol)
  const reads = await Promise.allSettled(rows.map((r) => client.getPerpState(r.poolAddress as Address)))
  const list: MarketSummary[] = []
  rows.forEach((r, i) => {
    const read = reads[i]
    if (!read || read.status !== 'fulfilled') return
    const st = read.value
    list.push({
      symbol: r.baseSymbol as string,
      pool: r.poolAddress,
      mark: st.markPriceOk ? fmt(st.markPrice, r.quoteDecimals) : null,
      fundingBps8h: fundingBps8h(st.fundingRate),
      aprPct: annualizedFundingRate(st.fundingRate, st.fundingWindowSec) * 100,
      maxLeverage: Math.round(10_000 / r.initialMarginBps),
    })
  })
  list.sort((a, b) => Math.abs(b.fundingBps8h) - Math.abs(a.fundingBps8h))
  summaryCache = { at: Date.now(), list }
  return list
}

/** True while a confirmed take profit or stop loss on this market is inside the cool-down window. */
function recentlyStopped(symbol: string, cooldownMin: number): boolean {
  if (cooldownMin <= 0) return false
  const since = Date.now() - cooldownMin * 60_000
  return getReceipts().some(
    (r) =>
      r.symbol === symbol &&
      r.kind === 'close' &&
      r.status === 'confirmed' &&
      r.ts >= since &&
      (r.reason.startsWith('Take profit') || r.reason.startsWith('Stop loss')),
  )
}

// ---------- snapshot ----------

let lastTick: Snapshot['lastTick'] = null
let cached: { at: number; snap: Snapshot } | null = null
let inflight: Promise<Snapshot> | null = null

export function getSnapshot(force = false): Promise<Snapshot> {
  if (!force && cached && Date.now() - cached.at < 4_000) return Promise.resolve(cached.snap)
  inflight ??= buildSnapshot()
    .then((snap) => {
      cached = { at: Date.now(), snap }
      return snap
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

interface Plan {
  snapshot: Snapshot
  order: PlannedOrder | null
}

async function buildSnapshot(): Promise<Snapshot> {
  return (await buildPlan()).snapshot
}

async function buildPlan(): Promise<Plan> {
  const st = getState()
  const rows = await getMarkets()
  const m = rows.find((r) => r.baseSymbol === st.symbol) ?? rows[0]
  if (!m) throw new Error('No tradeable perp markets found')

  const pool = m.poolAddress as Address
  const marginBank = m.marginBank as Address
  const chainState = await client.getPerpState(pool)
  const account = tradingAccount

  const tick = BigInt(m.tickSize)
  const lot = BigInt(m.lotSize)
  const minQty = BigInt(m.minQuantity)

  let position: Snapshot['position'] = null
  let margin: Snapshot['margin'] = null
  let size = 0n
  let equity = 0n
  let mmReq = 0n

  if (account) {
    const [pos, acct] = await Promise.all([
      client.getPerpPosition({ marginBank, account, pool }),
      client.getMarginAccount(marginBank, account),
    ])
    size = pos.size
    equity = acct.equity
    mmReq = acct.mmReq
    const hb = healthBps(equity, mmReq)
    margin = {
      equity: fmt(equity, USD),
      unlocked: fmt(acct.unlockedCollateralBalance, USD),
      locked: fmt(acct.lockedCollateral, USD),
      mmReq: fmt(mmReq, USD),
      healthRatio: hb === null ? null : hb / 10_000,
      status: acct.marginStatus,
    }
    let unrealizedPnl: string | null = null
    let accruedFunding: string | null = null
    let notional = '0'
    let liqPrice: string | null = null
    let pnlPctValue: number | null = null
    if (size !== 0n) {
      try {
        const a = await client.getPerpPositionAnalytics({ marginBank, pool, account })
        if (a.priceable) {
          unrealizedPnl = fmt(a.unrealizedPnl, USD)
          accruedFunding = fmt(a.accruedFunding, USD)
          notional = fmt(a.notional, USD)
          if (a.notional > 0n) {
            // accruedFunding is positive when the account owes funding.
            const net = a.unrealizedPnl - a.accruedFunding
            pnlPctValue = Number((net * 1_000_000n) / a.notional) / 10_000
          }
        }
        const lp = await client.getLiquidationPrice({ marginBank, pool, account })
        liqPrice = lp === null ? null : fmt(lp, USD)
      } catch (e) {
        console.error('[melo] analytics read failed:', e instanceof Error ? e.message : e)
      }
    }
    position = {
      side: size === 0n ? 'flat' : size > 0n ? 'long' : 'short',
      size: fmt(size < 0n ? -size : size, m.baseDecimals),
      entry: fmt(pos.avgEntryPrice, USD),
      notional,
      unrealizedPnl,
      accruedFunding,
      liqPrice,
      pnlPct: pnlPctValue,
    }
  }

  const decision = decide({
    fundingRate: chainState.fundingRate,
    positionSize: size,
    equity,
    mmReq,
    markOk: chainState.markPriceOk,
    pnlPct: position?.pnlPct ?? null,
    entryBlocked: recentlyStopped(m.baseSymbol ?? st.symbol, st.config.reentryCooldownMin),
    cfg: st.config,
  })

  const mark = chainState.markPrice
  let order: PlannedOrder | null = null
  let signal: Signal = { kind: 'idle', title: 'No entry', detail: decision.action === 'hold' ? decision.reason : '' }

  if (decision.action === 'open') {
    const isBid = decision.isBid
    const price = iocPrice(mark, isBid, st.config.slippageBps, tick)
    const want = quantityForNotional(decision.notional, mark, m.baseDecimals, m.quoteDecimals, lot)
    if (!account) {
      signal = { kind: 'blocked', title: 'Cannot execute', detail: 'No trading account configured' }
    } else if (want < minQty) {
      signal = { kind: 'blocked', title: 'Cannot execute', detail: 'Target size is below the market minimum order' }
    } else {
      const max = await client.getMaxPerpOrderSize({ pool, marginBank, account, isBid, price, autoPull: mode === 'direct' })
      if (!max.priceable) {
        signal = { kind: 'blocked', title: 'Cannot execute', detail: 'No live mark price to size against' }
      } else if (!max.placeable || max.maxQuantity < minQty) {
        signal = { kind: 'blocked', title: 'Cannot execute', detail: `Account cannot open more here: limited by ${max.limitedBy}` }
      } else if (want > max.maxQuantity) {
        signal = {
          kind: 'smaller',
          title: 'Smaller size',
          detail: `Limited by ${max.limitedBy}. ${decision.reason}`,
          quantity: fmt(max.maxQuantity, m.baseDecimals),
        }
        order = { kind: 'open', isBid, price, quantity: max.maxQuantity, reason: decision.reason }
      } else {
        signal = { kind: 'ready', title: 'Ready', detail: decision.reason, quantity: fmt(want, m.baseDecimals) }
        order = { kind: 'open', isBid, price, quantity: want, reason: decision.reason }
      }
    }
  } else if (decision.action === 'trim' || decision.action === 'close') {
    const isBid = size < 0n // buy back a short, sell out of a long
    const fraction = decision.action === 'trim' ? decision.fraction : 1
    const quantity = reduceQuantity(size, fraction, lot, minQty)
    const price = iocPrice(mark, isBid, st.config.slippageBps, tick)
    const shield = decision.reason.startsWith('Shield')
    const stop = decision.reason.startsWith('Stop loss')
    const tp = decision.reason.startsWith('Take profit')
    if (quantity <= 0n || !chainState.markPriceOk) {
      signal = { kind: 'blocked', title: 'Cannot execute', detail: chainState.markPriceOk ? 'Position is below one lot' : 'Mark price feed is stale' }
    } else {
      signal = {
        kind: shield || stop ? 'guard' : 'ready',
        title: shield ? 'Shield active' : stop ? 'Stop loss hit' : tp ? 'Take profit hit' : 'Ready',
        detail: decision.reason,
        quantity: fmt(quantity, m.baseDecimals),
      }
      order = { kind: decision.action, isBid, price, quantity, reason: decision.reason }
    }
  }

  const snapshot: Snapshot = {
    at: Date.now(),
    network: { name: NETWORK.name, chainId: NETWORK.chainId, explorer: NETWORK.explorer },
    mode,
    account,
    botAddress,
    enabled: st.enabled,
    loopMs,
    config: st.config,
    market: {
      symbol: m.baseSymbol ?? st.symbol,
      pool,
      marginBank,
      mark: fmt(mark, m.quoteDecimals),
      markOk: chainState.markPriceOk,
      fundingBps8h: fundingBps8h(chainState.fundingRate),
      aprPct: annualizedFundingRate(chainState.fundingRate, chainState.fundingWindowSec) * 100,
      openInterest: fmt(chainState.openInterest, m.baseDecimals),
      maxLeverage: Math.round(10_000 / m.initialMarginBps),
    },
    position,
    margin,
    decision,
    signal,
    lastTick,
  }
  return { snapshot, order }
}

// ---------- execution ----------

let busy = false
let cooldownUntil = 0
let lastSkipKey = ''

export async function tick(): Promise<string> {
  if (busy) return 'Previous tick still running'
  busy = true
  try {
    const { snapshot, order } = await buildPlan()
    cached = { at: Date.now(), snap: snapshot }
    let summary: string
    if (mode === 'readonly') {
      summary = 'Read-only: no bot key configured'
    } else if (!order) {
      summary = snapshot.signal.kind === 'blocked' ? snapshot.signal.detail : snapshot.decision.reason
      if (snapshot.signal.kind === 'blocked') recordSkip(snapshot, summary)
    } else if (Date.now() < cooldownUntil) {
      summary = 'Cooling down after a failed order'
    } else {
      summary = await execute(snapshot, order)
    }
    lastTick = { at: Date.now(), summary }
    return summary
  } finally {
    busy = false
  }
}

function recordSkip(snapshot: Snapshot, detail: string) {
  const key = `${snapshot.market.symbol}:${detail}`
  if (key === lastSkipKey) return
  lastSkipKey = key
  addReceipt({
    kind: 'open',
    symbol: snapshot.market.symbol,
    side: 'buy',
    quantity: '0',
    price: snapshot.market.mark,
    hash: null,
    status: 'skipped',
    reason: snapshot.decision.action === 'hold' ? snapshot.decision.reason : snapshot.signal.title,
    detail,
  })
}

async function execute(snapshot: Snapshot, o: PlannedOrder): Promise<string> {
  const m = (await getMarkets()).find((r) => r.baseSymbol === snapshot.market.symbol)
  if (!m) return 'Market disappeared'
  const res = await placeIoc({ pool: m.poolAddress as Address, isBid: o.isBid, price: o.price, quantity: o.quantity })
  addReceipt({
    kind: o.kind,
    symbol: snapshot.market.symbol,
    side: o.isBid ? 'buy' : 'sell',
    quantity: fmt(o.quantity, m.baseDecimals),
    price: fmt(o.price, m.quoteDecimals),
    hash: res.hash,
    status: res.status,
    reason: o.reason,
    detail: res.detail,
  })
  if (res.status !== 'confirmed') cooldownUntil = Date.now() + loopMs * 2
  cached = null
  return `${o.kind} ${o.isBid ? 'buy' : 'sell'} ${res.status}`
}

// ---------- autopilot loop ----------

let timer: ReturnType<typeof setInterval> | null = null

export function startLoop(): void {
  if (timer) return
  void runSafely()
  timer = setInterval(() => void runSafely(), loopMs)
}

export function stopLoop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function runSafely() {
  try {
    await tick()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    lastTick = { at: Date.now(), summary: `Tick failed: ${msg.slice(0, 200)}` }
    console.error('[melo] tick failed:', msg)
  }
}

export const loopRunning = () => timer !== null
export const recentReceipts = (n = 100) => getReceipts().slice(0, n)
