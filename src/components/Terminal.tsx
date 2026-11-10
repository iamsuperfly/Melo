import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { AutopilotCard } from './AutopilotCard'
import { FundingBoard, MarketHero, SignalCard } from './MarketPanel'
import { OrdersFeed } from './OrdersFeed'
import { PositionCard } from './PositionCard'
import { Header } from './Header'

const TOKEN_KEY = 'melo-admin-token'

export function Terminal({ navigate }: { navigate: (path: string) => void }) {
  const qc = useQueryClient()
  const [token, setTokenState] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '')
  const setToken = (t: string) => {
    setTokenState(t)
    sessionStorage.setItem(TOKEN_KEY, t)
  }

  const status = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 5_000, retry: 1 })
  const markets = useQuery({ queryKey: ['markets'], queryFn: api.markets, refetchInterval: 20_000, retry: 1 })
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: api.receipts, refetchInterval: 5_000, retry: 1 })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['status'] })
    void qc.invalidateQueries({ queryKey: ['receipts'] })
  }

  async function pick(symbol: string) {
    if (!token) {
      toast.info('Enter the admin token in the Autopilot card to switch markets.')
      return
    }
    try {
      await api.control(token, { symbol })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch market')
    }
  }

  const s = status.data

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      <Header network={s?.network.name} mode={s?.mode} navigate={navigate} />

      {status.isError && !s ? (
        <div className="card mt-8 max-w-xl">
          <div className="label">Server unreachable</div>
          <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
            Melo could not reach its server. Start it with <span className="mono">bun run server</span>, then refresh.
          </p>
        </div>
      ) : !s ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="card h-64 animate-pulse" />
          <div className="card h-64 animate-pulse" />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <MarketHero status={s} />
            <SignalCard status={s} />
            <FundingBoard markets={markets.data ?? []} active={s.market.symbol} onPick={(sym) => void pick(sym)} />
          </div>
          <div className="space-y-4">
            <PositionCard status={s} />
            <AutopilotCard status={s} token={token} setToken={setToken} refresh={refresh} />
            <OrdersFeed receipts={receipts.data?.receipts ?? []} explorer={receipts.data?.explorer ?? s.network.explorer} />
          </div>
        </div>
      )}
    </div>
  )
}
