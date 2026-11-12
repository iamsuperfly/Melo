/**
 * Optional Supabase storage over its REST API. No extra packages.
 * Needs two tables, see the README. Uses the service key, which must stay on the server.
 */

const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
const key = process.env.SUPABASE_SERVICE_KEY?.trim() ?? ''
const enabled = url !== '' && key !== ''

/**
 * New secret keys (sb_secret_...) are not JWTs and go on the apikey header only.
 * Legacy service_role keys are JWTs (eyJ...) and also take a bearer header.
 */
const isJwt = key.startsWith('eyJ')

const headers = (extra?: Record<string, string>) => ({
  apikey: key,
  ...(isJwt ? { authorization: `Bearer ${key}` } : {}),
  'content-type': 'application/json',
  ...extra,
})

async function call(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
    throw new Error(`Supabase ${res.status} on ${path.split('?')[0]}: ${text}`)
  }
  return res
}

export const remote = {
  enabled,

  async loadState(): Promise<unknown | null> {
    const res = await call('melo_state?id=eq.main&select=value', { headers: headers() })
    const rows = (await res.json()) as { value: unknown }[]
    return rows[0]?.value ?? null
  },

  async saveState(value: unknown): Promise<void> {
    await call('melo_state?on_conflict=id', {
      method: 'POST',
      headers: headers({ prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: 'main', value, updated_at: new Date().toISOString() }),
    })
  },

  async loadReceipts(limit: number): Promise<unknown[]> {
    const res = await call(`melo_receipts?select=data&order=ts.desc&limit=${limit}`, { headers: headers() })
    const rows = (await res.json()) as { data: unknown }[]
    return rows.map((r) => r.data)
  },

  async addReceipt(r: { id: string; ts: number }): Promise<void> {
    await call('melo_receipts?on_conflict=id', {
      method: 'POST',
      headers: headers({ prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: r.id, ts: r.ts, data: r }),
    })
  },
}
