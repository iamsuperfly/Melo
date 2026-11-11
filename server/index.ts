import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { formatUnits, isAddress, type Address } from 'viem'
import { claimVoucher, client, depositToMargin } from './chain'
import { getMarkets, getSnapshot, listMarketSummaries, loopRunning, recentReceipts, startLoop, stopLoop, tick } from './engine'
import { adminToken, allowedOrigins, loopMs, mode, NETWORK, port, tradingAccount } from './env'
import { getState, initStore, setState } from './store'
import { parseConfig } from './strategy'

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(text)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 10_000) throw new HttpError(413, 'Body too large')
    chunks.push(chunk as Buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Body is not valid JSON')
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest()

function requireAdmin(req: IncomingMessage) {
  if (!adminToken) throw new HttpError(503, 'Controls are disabled: set ADMIN_TOKEN on the server')
  const header = req.headers.authorization ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!timingSafeEqual(digest(given), digest(adminToken))) throw new HttpError(401, 'Wrong admin token')
}

async function proof(address: string | null) {
  const target = address ?? tradingAccount
  if (!target) throw new HttpError(400, 'No account to look up. Pass ?address=0x...')
  if (!isAddress(target)) throw new HttpError(400, 'Not a valid address')
  const rows = await getMarkets()
  const symbolByPool = new Map(rows.map((r) => [r.poolAddress.toLowerCase(), r]))
  const receipts = recentReceipts(200)
  const mine = new Set(receipts.filter((r) => r.hash).map((r) => r.hash?.toLowerCase()))

  const page = await client.getUserFillsPage(target, { marketType: 'PERP', limit: 50 })
  const fills = page.fills.map((f) => {
    const m = symbolByPool.get(f.pool.toLowerCase())
    const isTaker = (f.takerOrder?.owner ?? f.taker ?? '').toLowerCase() === target.toLowerCase()
    const side = f.takerIsBid === null ? null : isTaker === f.takerIsBid ? 'buy' : 'sell'
    return {
      id: f.id,
      symbol: m?.baseSymbol ?? null,
      side,
      role: isTaker ? 'taker' : 'maker',
      price: formatUnits(BigInt(f.fillPrice), m?.quoteDecimals ?? 18),
      quantity: formatUnits(BigInt(f.quantity), m?.baseDecimals ?? 18),
      timestamp: Number(f.timestamp) * 1000,
      txHash: f.txHash,
      placedByMelo: mine.has(f.txHash.toLowerCase()),
    }
  })
  return {
    account: target as Address,
    explorer: NETWORK.explorer,
    fills,
    receipts: receipts.filter((r) => r.status === 'confirmed' || r.status === 'reverted').slice(0, 50),
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, mode })
  if (method === 'GET' && path === '/api/markets') return send(res, 200, { markets: await listMarketSummaries() })
  if (method === 'GET' && path === '/api/status') {
    return send(res, 200, { ...(await getSnapshot(url.searchParams.has('force'))), running: loopRunning(), controlsEnabled: adminToken !== null })
  }
  if (method === 'GET' && path === '/api/receipts') return send(res, 200, { receipts: recentReceipts(100), explorer: NETWORK.explorer })
  if (method === 'GET' && path === '/api/proof') return send(res, 200, await proof(url.searchParams.get('address')))

  if (method === 'POST' && path === '/api/control') {
    requireAdmin(req)
    const body = (await readJson(req)) as { enabled?: unknown; symbol?: unknown; config?: unknown }
    const patch: Partial<ReturnType<typeof getState>> = {}
    if (body.symbol !== undefined) {
      if (typeof body.symbol !== 'string') throw new HttpError(400, 'symbol must be a string')
      const known = (await getMarkets()).some((m) => m.baseSymbol === body.symbol)
      if (!known) throw new HttpError(400, `Unknown market ${body.symbol}`)
      patch.symbol = body.symbol
    }
    if (body.config !== undefined) {
      try {
        patch.config = parseConfig(body.config, getState().config)
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'Bad config')
      }
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false')
      if (body.enabled && mode === 'readonly') throw new HttpError(400, 'No bot key on the server, so autopilot cannot trade')
      patch.enabled = body.enabled
    }
    setState(patch)
    if (getState().enabled) startLoop()
    else stopLoop()
    return send(res, 200, { ...(await getSnapshot(true)), running: loopRunning(), controlsEnabled: true })
  }
  if (method === 'POST' && path === '/api/control/tick') {
    requireAdmin(req)
    const summary = await tick()
    return send(res, 200, { summary })
  }
  if (method === 'POST' && path === '/api/control/claim-voucher') {
    requireAdmin(req)
    const snap = await getSnapshot()
    try {
      return send(res, 200, { hash: await claimVoucher(snap.market.marginBank as Address) })
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message.slice(0, 200) : 'Claim failed')
    }
  }
  if (method === 'POST' && path === '/api/control/deposit') {
    requireAdmin(req)
    const body = (await readJson(req)) as { amount?: unknown }
    if (body.amount !== undefined && (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0)) {
      throw new HttpError(400, 'amount must be a positive number')
    }
    const snap = await getSnapshot()
    try {
      return send(res, 200, await depositToMargin(snap.market.marginBank as Address, body.amount as number | undefined))
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message.slice(0, 200) : 'Deposit failed')
    }
  }
  throw new HttpError(404, 'Not found')
}

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  }
}

const server = createServer((req, res) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  route(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message })
    console.error('[melo] request failed:', err instanceof Error ? err.message : err)
    send(res, 500, { error: 'Something went wrong reading the chain. Try again.' })
  })
})

await initStore()

server.listen(port, () => {
  console.log(`[melo] api on :${port} (${mode} mode, loop ${loopMs / 1000}s, controls ${adminToken ? 'on' : 'off'}, cors origins ${allowedOrigins.length})`)
  if (getState().enabled && mode !== 'readonly') {
    console.log('[melo] autopilot was on before restart, resuming')
    startLoop()
  }
})
