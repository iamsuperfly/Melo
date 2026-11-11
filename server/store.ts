import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { remote } from './remote'
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

function normalize(saved: Partial<PersistedState>): PersistedState {
  return {
    enabled: saved.enabled === true,
    symbol: typeof saved.symbol === 'string' ? saved.symbol : 'BTC',
    config: { ...DEFAULT_CONFIG, ...(saved.config ?? {}) },
  }
}

let state: PersistedState = normalize(load<Partial<PersistedState>>('state.json', {}))

let receipts: Receipt[] = load<Receipt[]>('receipts.json', [])
const MAX_RECEIPTS = 500

export const getState = (): PersistedState => state

/**
 * Load saved state and the order log from Supabase when it is configured.
 * Without it the server keeps using local files, which a free host wipes on redeploy.
 */
export async function initStore(): Promise<void> {
  if (!remote.enabled) {
    console.log('[melo] storage: local files only (set SUPABASE_URL and SUPABASE_SERVICE_KEY to keep data across redeploys)')
    return
  }
  try {
    const saved = await remote.loadState()
    if (saved) state = normalize(saved as Partial<PersistedState>)
    else await remote.saveState(state)
    const rows = await remote.loadReceipts(MAX_RECEIPTS)
    receipts = rows as Receipt[]
    console.log(`[melo] storage: Supabase (${receipts.length} receipts loaded)`)
  } catch (err) {
    console.error('[melo] Supabase unavailable, falling back to local files:', err instanceof Error ? err.message : err)
  }
}

export function setState(patch: Partial<PersistedState>): PersistedState {
  state = { ...state, ...patch }
  save('state.json', state)
  if (remote.enabled) void remote.saveState(state).catch(logRemote)
  return state
}

export const getReceipts = (): Receipt[] => receipts

export function addReceipt(r: Omit<Receipt, 'id' | 'ts'>): Receipt {
  const full: Receipt = { ...r, id: `${Date.now()}-${randomUUID().slice(0, 8)}`, ts: Date.now() }
  receipts = [full, ...receipts].slice(0, MAX_RECEIPTS)
  save('receipts.json', receipts)
  if (remote.enabled) void remote.addReceipt(full).catch(logRemote)
  return full
}

function logRemote(err: unknown) {
  console.error('[melo] Supabase write failed:', err instanceof Error ? err.message : err)
}
