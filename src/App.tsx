import { useCallback, useEffect, useState } from 'react'
import { ProofPage } from '@/components/ProofPage'
import { Terminal } from '@/components/Terminal'

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to)
    setPath(window.location.pathname)
    window.scrollTo({ top: 0 })
  }, [])

  return path.startsWith('/proof') ? <ProofPage navigate={navigate} /> : <Terminal navigate={navigate} />
}
