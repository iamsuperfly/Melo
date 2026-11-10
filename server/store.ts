import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type StrategyConfig } from './strategy'

const DIR = join(process.cwd(), 'data')

export interface PersistedState {
  enabled: boolean
  symbol: string
  config: StrategyConfig
}

export type ReceiptKind = 'open' | 'trim' | 'close'
export type ReceiptStatus = 'confirmed' | 'reverted' | 'skipped' | 'error'

export interface Receipt {
  id: string
  ts: number
  kind: ReceiptKind
  symbol: string
  side: 'buy' | 'sell'
  /** Human units of the base asset. */
  quantity: string
  /** Human units of USDso per base. */
  price: string
  hash: string | null
  status: ReceiptStatus
  reason: string
  detail?: string
}

function load<T>(file: string, fallback: T): T {
  try {
    const path = join(DIR, file)
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (err) {
    console.error(`[melo] could not read ${file}:`, err instanceof Error ? err.message : err)
    return fallback
  }
}

function save(file: string, value: unknown): void {
  mkdirSync(DIR, { recursive: true })
  const path = join(DIR, file)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}

let state: PersistedState = (() => {
  const saved = load<Partial<PersistedState>>('state.json', {})
  return {
    enabled: saved.enabled === true,
    symbol: typeof saved.symbol === 'string' ? saved.symbol : 'BTC',
    config: { ...DEFAULT_CONFIG, ...(saved.config ?? {}) },
  }
})()

let receipts: Receipt[] = load<Receipt[]>('receipts.json', [])
const MAX_RECEIPTS = 500

export const getState = (): PersistedState => state

export function setState(patch: Partial<PersistedState>): PersistedState {
  state = { ...state, ...patch }
  save('state.json', state)
  return state
}

export const getReceipts = (): Receipt[] => receipts

export function addReceipt(r: Omit<Receipt, 'id' | 'ts'>): Receipt {
  const full: Receipt = { ...r, id: `${Date.now()}-${receipts.length}`, ts: Date.now() }
  receipts = [full, ...receipts].slice(0, MAX_RECEIPTS)
  save('receipts.json', receipts)
  return full
}
