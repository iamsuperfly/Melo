import { ExternalLink } from 'lucide-react'
import type { Receipt } from '@/lib/api'
import { ago, qty, price, shortHash, txUrl } from '@/lib/format'

const STATUS_TONE: Record<Receipt['status'], string> = {
  confirmed: 'var(--success)',
  reverted: 'var(--danger)',
  error: 'var(--danger)',
  skipped: 'var(--subtle)',
}

export function ReceiptRow({ r, explorer }: { r: Receipt; explorer: string }) {
  return (
    <li className="inner p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="chip" style={{ color: STATUS_TONE[r.status] }}>
            {r.status}
          </span>
          <span className="font-semibold capitalize">{r.kind}</span>
          {r.status !== 'skipped' && (
            <span className="num mono" style={{ color: r.side === 'buy' ? 'var(--success)' : 'var(--danger)' }}>
              {r.side === 'buy' ? 'Buy' : 'Sell'} {qty(r.quantity)} {r.symbol} @ {price(r.price)}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          {ago(r.ts)}
        </span>
      </div>
      <p className="mt-1 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        {r.reason}
        {r.detail ? ` (${r.detail})` : ''}
      </p>
      {r.hash && (
        <a
          className="mono mt-1 inline-flex min-h-8 items-center gap-1 text-xs underline"
          style={{ color: 'var(--accent)' }}
          href={txUrl(explorer, r.hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {shortHash(r.hash)} <ExternalLink size={12} aria-hidden />
        </a>
      )}
    </li>
  )
}

export function OrdersFeed({ receipts, explorer }: { receipts: Receipt[]; explorer: string }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="label">Live orders</span>
        <a href="/proof" className="text-sm underline" style={{ color: 'var(--accent)' }}>
          Open proof page
        </a>
      </div>
      {receipts.length === 0 ? (
        <p className="mt-4 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          No orders yet. When autopilot trades, every order shows here with its transaction hash.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {receipts.map((r) => (
            <ReceiptRow key={r.id} r={r} explorer={explorer} />
          ))}
        </ul>
      )}
    </div>
  )
}
