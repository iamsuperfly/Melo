import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { ago, price, qty, shortAddr, shortHash, txUrl } from '@/lib/format'
import { buildShareLink } from '@/lib/share'
import { Header } from './Header'
import { ReceiptRow } from './OrdersFeed'

const initialAddress = () => new URLSearchParams(window.location.search).get('address') ?? ''

export function ProofPage({ navigate }: { navigate: (path: string) => void }) {
  const [input, setInput] = useState(initialAddress)
  const [address, setAddress] = useState(initialAddress)
  const [shareBase, setShareBase] = useState<string | null>(null)

  const proof = useQuery({
    queryKey: ['proof', address],
    queryFn: () => api.proof(address || undefined),
    refetchInterval: 10_000,
    retry: false,
  })

  const account = proof.data?.account ?? address
  useEffect(() => {
    if (!account) return
    let alive = true
    void buildShareLink(`/proof?address=${account}`).then((u) => alive && setShareBase(u))
    return () => {
      alive = false
    }
  }, [account])

  async function copy() {
    if (!shareBase) return
    try {
      await navigator.clipboard.writeText(shareBase)
      toast.success('Proof link copied')
    } catch {
      toast.error('Could not copy. Select the address and copy it by hand.')
    }
  }

  const d = proof.data
  const ours = d?.fills.filter((f) => f.placedByMelo).length ?? 0

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-24 pt-5 sm:px-6">
      <Header navigate={navigate} active="proof" />

      <div className="card mt-6">
        <div className="label">Proof of live orders</div>
        <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          Every fill below is read back from the exchange indexer, not from Melo's own log. Fills marked as placed by Melo match a transaction hash Melo recorded.
        </p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            setAddress(input.trim())
            window.history.replaceState(null, '', input.trim() ? `/proof?address=${encodeURIComponent(input.trim())}` : '/proof')
          }}
        >
          <input
            className="field mono"
            placeholder="Wallet address (leave empty for Melo's account)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Wallet address"
          />
          <button type="submit" className="btn btn-primary">
            Look up
          </button>
          <button type="button" className="btn btn-ghost flex items-center justify-center gap-2" disabled={!shareBase} onClick={() => void copy()}>
            <Copy size={16} aria-hidden /> Copy link
          </button>
        </form>
        {d && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="chip mono">{shortAddr(d.account)}</span>
            <span className="chip">
              <BadgeCheck size={14} aria-hidden /> {ours} fills matched to Melo orders
            </span>
          </div>
        )}
      </div>

      {proof.isLoading && <div className="card mt-4 h-40 animate-pulse" />}
      {proof.isError && (
        <div className="card mt-4">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {proof.error instanceof Error ? proof.error.message : 'Could not load proof'}
          </p>
        </div>
      )}

      {d && (
        <>
          <div className="card mt-4">
            <div className="label">Fills from the indexer</div>
            {d.fills.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
                No perp fills found for this wallet yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr style={{ color: 'var(--subtle)' }}>
                      <th className="py-2 font-semibold">Market</th>
                      <th className="font-semibold">Side</th>
                      <th className="font-semibold">Size</th>
                      <th className="font-semibold">Price</th>
                      <th className="font-semibold">When</th>
                      <th className="font-semibold">Transaction</th>
                    </tr>
                  </thead>
                  <tbody className="num mono">
                    {d.fills.map((f) => (
                      <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-2.5">{f.symbol ?? '-'}</td>
                        <td style={{ color: f.side === 'buy' ? 'var(--success)' : f.side === 'sell' ? 'var(--danger)' : undefined }}>{f.side ?? '-'}</td>
                        <td>{qty(f.quantity)}</td>
                        <td>{price(f.price)}</td>
                        <td>{ago(f.timestamp)}</td>
                        <td>
                          <a className="inline-flex min-h-8 items-center gap-1 underline" style={{ color: 'var(--accent)' }} href={txUrl(d.explorer, f.txHash)} target="_blank" rel="noopener noreferrer">
                            {shortHash(f.txHash)} <ExternalLink size={12} aria-hidden />
                          </a>
                          {f.placedByMelo && (
                            <span className="chip ml-2" style={{ color: 'var(--success)' }}>
                              Melo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {d.receipts.length > 0 && (
            <div className="card mt-4">
              <div className="label">Melo's order log</div>
              <ul className="mt-3 space-y-2">
                {d.receipts.map((r) => (
                  <ReceiptRow key={r.id} r={r} explorer={d.explorer} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
