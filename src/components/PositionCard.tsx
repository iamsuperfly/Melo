import type { Status } from '@/lib/api'
import { price, qty, shortAddr, signed, usd } from '@/lib/format'

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="num mono" style={{ color: tone }}>
        {value}
      </span>
    </div>
  )
}

/** Health bar: 0x to 3x of maintenance margin, with the trim and close lines marked. */
function HealthBar({ status }: { status: Status }) {
  const h = status.margin?.healthRatio ?? null
  const trim = status.config.trimHealthBps / 10_000
  const close = status.config.closeHealthBps / 10_000
  const max = 3
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`
  const tone = h === null ? 'var(--subtle)' : h < close ? 'var(--danger)' : h < trim ? 'var(--warn)' : 'var(--success)'
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="label">Margin health</span>
        <span className="num mono" style={{ color: tone }}>
          {h === null ? 'No position' : `${h.toFixed(2)}x maintenance`}
        </span>
      </div>
      <div className="relative mt-2 h-3 rounded-full" style={{ background: 'rgba(0,0,0,0.3)' }}>
        <div className="h-3 rounded-full" style={{ width: h === null ? '0%' : pct(h), background: tone, transition: 'width 0.4s' }} />
        <span className="absolute -top-1 h-5 w-px" style={{ left: pct(close), background: 'var(--danger)' }} title="Close line" />
        <span className="absolute -top-1 h-5 w-px" style={{ left: pct(trim), background: 'var(--warn)' }} title="Trim line" />
      </div>
      <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--subtle)' }}>
        <span>0x</span>
        <span>Shield trims at {trim.toFixed(2)}x, closes at {close.toFixed(2)}x</span>
      </div>
    </div>
  )
}

export function PositionCard({ status }: { status: Status }) {
  const { position: p, margin: m } = status
  const modeLabel = { linked: 'Trading a linked wallet', direct: 'Trading the bot wallet', readonly: 'Read only' }[status.mode]
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="label">Position · {status.market.symbol}</span>
        <span className="chip">{modeLabel}</span>
      </div>
      {!status.account || !p || !m ? (
        <p className="mt-4 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          No trading account is set on the server. Add a bot key and, if you link a wallet, its address, then restart the server.
        </p>
      ) : (
        <>
          <div className="mt-1 text-xs mono" style={{ color: 'var(--subtle)' }}>
            {shortAddr(status.account)}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row
                label="Side"
                value={p.side === 'flat' ? 'Flat' : `${p.side === 'long' ? 'Long' : 'Short'} ${qty(p.size)} ${status.market.symbol}`}
                tone={p.side === 'long' ? 'var(--success)' : p.side === 'short' ? 'var(--danger)' : undefined}
              />
              <Row label="Entry" value={p.side === 'flat' ? '-' : price(p.entry)} />
              <Row label="Notional" value={p.side === 'flat' ? '-' : usd(p.notional, true)} />
              <Row
                label="Unrealized PnL"
                value={p.unrealizedPnl === null ? '-' : usd(p.unrealizedPnl)}
                tone={p.unrealizedPnl === null ? undefined : Number(p.unrealizedPnl) >= 0 ? 'var(--success)' : 'var(--danger)'}
              />
            </div>
            <div>
              <Row label="Funding owed" value={p.accruedFunding === null ? '-' : signed(p.accruedFunding, 4)} />
              <Row label="Liquidation price" value={p.liqPrice === null ? '-' : price(p.liqPrice)} />
              <Row label="Equity" value={usd(m.equity, true)} />
              <Row label="Free collateral" value={usd(m.unlocked, true)} />
            </div>
          </div>
          <HealthBar status={status} />
        </>
      )}
    </div>
  )
}
