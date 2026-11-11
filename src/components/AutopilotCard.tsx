import { useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Status, type StrategyConfig } from '@/lib/api'
import { ago } from '@/lib/format'

const FIELDS: { key: keyof StrategyConfig; label: string; hint: string; step: number }[] = [
  { key: 'targetNotional', label: 'Position size (USDso)', hint: 'Notional to open', step: 10 },
  { key: 'entryBps8h', label: 'Enter at funding (bps / 8h)', hint: 'Open when funding is at least this', step: 0.5 },
  { key: 'exitBps8h', label: 'Exit below funding (bps / 8h)', hint: 'Close when the edge fades under this', step: 0.5 },
  { key: 'slippageBps', label: 'Price band (bps)', hint: 'IOC limit around the mark', step: 5 },
  { key: 'trimHealthBps', label: 'Trim at health (bps)', hint: '15000 = 1.5x maintenance', step: 500 },
  { key: 'closeHealthBps', label: 'Close at health (bps)', hint: '12000 = 1.2x maintenance', step: 500 },
]

type Action = 'toggle' | 'save' | 'tick' | 'claim' | 'deposit' | null

export function AutopilotCard({
  status,
  token,
  setToken,
  refresh,
}: {
  status: Status
  token: string
  setToken: (t: string) => void
  refresh: () => void
}) {
  const [draft, setDraft] = useState<StrategyConfig | null>(null)
  const form = draft ?? status.config
  const dirty = draft !== null
  const [busy, setBusy] = useState<Action>(null)

  const canControl = status.controlsEnabled && token.length > 0
  const canTrade = status.mode !== 'readonly'

  async function run(action: Exclude<Action, null>, fn: () => Promise<string | void>) {
    setBusy(action)
    try {
      const msg = await fn()
      if (msg) toast.success(msg)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const toggle = () =>
    run('toggle', async () => {
      await api.control(token, { enabled: !status.enabled })
      return status.enabled ? 'Autopilot stopped' : 'Autopilot started'
    })
  const save = () =>
    run('save', async () => {
      await api.control(token, { config: form })
      setDraft(null)
      return 'Settings saved'
    })
  const tickOnce = () => run('tick', async () => (await api.control(token, {}, '/api/control/tick')).summary)
  const claim = () =>
    run('claim', async () => {
      await api.control(token, {}, '/api/control/claim-voucher')
      return 'Paper USDso claimed'
    })

  const deposit = () =>
    run('deposit', async () => {
      const r = await api.control(token, {}, '/api/control/deposit')
      return `Deposited ${r.deposited ?? ''} USDso to margin`.replace('  ', ' ')
    })

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="label">Autopilot</span>
        <span className="chip" style={{ color: status.running ? 'var(--success)' : 'var(--subtle)' }}>
          {status.running ? 'Running on the server' : 'Stopped'}
        </span>
      </div>
      <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        {status.lastTick ? `${status.lastTick.summary} (${ago(status.lastTick.at)})` : 'No cycle has run yet.'}
      </p>

      <label className="mt-4 block">
        <span className="label">Admin token</span>
        <input
          className="field mono mt-1"
          type="password"
          autoComplete="off"
          placeholder={status.controlsEnabled ? 'Paste the ADMIN_TOKEN from your server .env' : 'Set ADMIN_TOKEN on the server to unlock controls'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={!status.controlsEnabled}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary flex items-center gap-2" disabled={!canControl || !canTrade || busy !== null} onClick={() => void toggle()}>
          {busy === 'toggle' ? <Loader2 size={16} className="animate-spin" /> : status.enabled ? <Square size={16} /> : <Play size={16} />}
          {status.enabled ? 'Stop autopilot' : 'Start autopilot'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={!canControl || !canTrade || busy !== null} onClick={() => void tickOnce()}>
          {busy === 'tick' ? 'Running...' : 'Run one cycle'}
        </button>
        {status.mode === 'direct' && (
          <button type="button" className="btn btn-ghost" disabled={!canControl || busy !== null} onClick={() => void claim()}>
            {busy === 'claim' ? 'Claiming...' : 'Claim paper USDso'}
          </button>
        )}
        {status.mode === 'direct' && (
          <button type="button" className="btn btn-ghost" disabled={!canControl || busy !== null} onClick={() => void deposit()}>
            {busy === 'deposit' ? 'Depositing...' : 'Deposit wallet USDso'}
          </button>
        )}
      </div>
      {!canTrade && (
        <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
          Autopilot needs BOT_PRIVATE_KEY on the server.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {f.label}
            </span>
            <input
              className="field num mono mt-1"
              type="number"
              inputMode="decimal"
              step={f.step}
              value={form[f.key]}
              onChange={(e) => {
                setDraft({ ...form, [f.key]: Number(e.target.value) })
              }}
            />
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              {f.hint}
            </span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-ghost mt-4" disabled={!canControl || !dirty || busy !== null} onClick={() => void save()}>
        {busy === 'save' ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  )
}
