import { isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Environment for the Melo server. Secrets are read here once and never logged
 * or returned from any route.
 */

function readKey(): Hex | null {
  const raw = process.env.BOT_PRIVATE_KEY?.trim()
  if (!raw) return null
  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error('[melo] BOT_PRIVATE_KEY is set but is not a 32-byte hex key. Ignoring it.')
    return null
  }
  return key
}

function readOwner(): Address | null {
  const raw = process.env.OWNER_ADDRESS?.trim()
  if (!raw) return null
  if (!isAddress(raw)) {
    console.error('[melo] OWNER_ADDRESS is set but is not a valid address. Ignoring it.')
    return null
  }
  return raw
}

export const botKey = readKey()
export const botAddress: Address | null = botKey ? privateKeyToAccount(botKey).address : null
export const ownerAddress = readOwner()

export const adminToken = process.env.ADMIN_TOKEN?.trim() || null
export const port = Number(process.env.PORT ?? process.env.MELO_PORT ?? 8787)
/** Browser origins allowed to call the API cross-site, comma separated (for example your Vercel URL). */
export const allowedOrigins = (process.env.MELO_ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)
export const loopMs = Math.max(10_000, Number(process.env.MELO_LOOP_MS ?? 30_000))

export const NETWORK = {
  name: 'Somnia Tokyo testnet (Hideki)',
  chainId: 50383,
  indexerUrl: 'https://hideki-dev.smk.somnia.host/v1/graphql',
  explorer: 'https://explorer.testnet.somnia.network/tokyo',
} as const

export type Mode = 'linked' | 'direct' | 'readonly'

/** linked: bot key trades OWNER_ADDRESS. direct: bot key trades its own account. readonly: no key. */
export const mode: Mode = botKey ? (ownerAddress ? 'linked' : 'direct') : 'readonly'

/** The account whose margin and position the app reads. */
export const tradingAccount: Address | null = mode === 'linked' ? ownerAddress : botAddress ?? ownerAddress
