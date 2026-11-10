import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, MinusCircle, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import type { MarketSummary, Signal, Status } from '@/lib/api'
import { price, qty, signed } from '@/lib/format'

const SIGNAL_STYLE: Record<Signal['kind'], { color: string; Icon: typeof CheckCircle2 }> = {
  ready: { color: 'var(--success)', Icon: CheckCircle2 },
  smaller: { color: 'var(--warn)', Icon: SlidersHorizontal },
  blocked: { color: 'var(--danger)', Icon: AlertTriangle },
  guard: { color: 'var(--warn)', Icon: ShieldAlert },
  idle: { color: 'var(--subtle)', Icon: MinusCircle },
}

export function SignalCard({ status }: { status: Status }) {
  const { signal, market } = status
  const { color, Icon } = SIGNAL_STYLE[signal.kind]
  return (
    <div className="card" style={{ borderColor: signal.kind === 'idle' ? undefined : color }}>
      <div className="label">Signal</div>
      <div className="mt-2 flex items-center gap-2">
        <Icon size={22} style={{ color }} aria-hidden />
        <span className="display text-2xl font-semibold" style={{ color }}>
          {signal.title}
        </span>
      </div>
      <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        {signal.detail}
      </p>
      {signal.quantity && (
        <div className="inner mt-3 flex items-center justify-between px-3 py-2 text-sm">
          <span style={{ color: 'var(--subtle)' }}>Planned order</span>
          <span className="num mono">
            {status.decision.action === 'open' ? (status.decision.isBid ? 'Buy' : 'Sell') : status.decision.action}{' '}
            {qty(signal.quantity)} {market.symbol}
          </span>
        </div>
      )}
    </div>
  )
}

export function MarketHero({ status }: { status: Status }) {
  const m = status.market
  const f = m.fundingBps8h
  const direction = f === 0 ? 'Flat funding' : f > 0 ? 'Longs pay shorts' : 'Shorts pay longs'
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="label">{m.symbol} perp · USDso</span>
        <span className="chip num">{m.maxLeverage}x max</span>
      </div>
      <motion.div
        key={m.mark}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="display num mt-3 text-5xl font-semibold"
      >
        {price(m.mark)}
      </motion.div>
      <div className="mt-1 text-sm" style={{ color: m.markOk ? 'var(--subtle)' : 'var(--danger)' }}>
        {m.markOk ? 'Mark price' : 'Mark feed is stale. New entries are paused.'}
      </div>
      <div className="inner mt-5 p-4">
        <div className="label">Funding per 8h</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="display num text-3xl font-semibold" style={{ color: f >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {signed(f)} bps
          </span>
          <span className="num text-sm" style={{ color: 'var(--subtle)' }}>
            ~{Math.abs(m.aprPct).toFixed(0)}% APR
          </span>
        </div>
        <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          {direction}
        </div>
      </div>
    </div>
  )
}

export function FundingBoard({
  markets,
  active,
  onPick,
}: {
  markets: MarketSummary[]
  active: string
  onPick: (symbol: string) => void
}) {
  return (
    <div className="card">
      <div className="label">Funding board</div>
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
        {markets.map((m) => {
          const on = m.symbol === active
          return (
            <li key={m.symbol}>
              <button
                type="button"
                onClick={() => onPick(m.symbol)}
                aria-pressed={on}
                className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm"
                style={{
                  background: on ? 'var(--surface-strong)' : 'transparent',
                  border: `1px solid ${on ? 'var(--border-strong)' : 'transparent'}`,
                }}
              >
                <span className="font-semibold">{m.symbol}</span>
                <span className="num mono" style={{ color: m.fundingBps8h >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {signed(m.fundingBps8h)} bps
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
