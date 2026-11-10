import type { Status } from '@/lib/api'

const MODE_LABEL: Record<Status['mode'], string> = {
  linked: 'Linked wallet',
  direct: 'Bot wallet',
  readonly: 'Read only',
}

export function Header({
  network,
  mode,
  navigate,
  active = 'terminal',
}: {
  network?: string
  mode?: Status['mode']
  navigate: (path: string) => void
  active?: 'terminal' | 'proof'
}) {
  const link = (path: string, label: string, on: boolean) => (
    <a
      href={path}
      onClick={(e) => {
        e.preventDefault()
        navigate(path)
      }}
      aria-current={on ? 'page' : undefined}
      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold"
      style={{ color: on ? 'var(--ink)' : 'var(--subtle)', background: on ? 'var(--surface-strong)' : 'transparent' }}
    >
      {label}
    </a>
  )
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
          <rect width="30" height="30" rx="9" fill="var(--accent)" />
          <path d="M7 21V9l8 8 8-8v12" fill="none" stroke="#0d1b2f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="display text-2xl font-semibold">Melo</span>
        <nav className="ml-2 flex gap-1" aria-label="Main">
          {link('/', 'Terminal', active === 'terminal')}
          {link('/proof', 'Proof', active === 'proof')}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {network && <span className="chip">{network}</span>}
        {mode && <span className="chip">{MODE_LABEL[mode]}</span>}
      </div>
    </header>
  )
}
