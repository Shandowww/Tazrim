import { useCallback, useEffect, useState } from 'react'
import { AccessError, loadBudgetSnapshot, type BudgetSpace, type BudgetResponse } from './budget-api.ts'
export { loadBudgetSnapshot } from './budget-api.ts'
export type { BudgetSpace, BudgetResponse } from './budget-api.ts'

type State = { status: 'loading'; budgetId: string } | { status: 'ready'; budgetId: string; value: BudgetResponse; spaces: BudgetSpace[] } | { status: 'error'; budgetId: string; message: string }
export type BudgetState = State & { accept: (snapshot: {value: BudgetResponse; spaces: BudgetSpace[]}) => void; invalidate: (message: string) => void; refresh: () => void; refreshPending: boolean; refreshError: string | null; dismissRefreshError: () => void }

/** Every result is bound to the selected budget; older requests cannot repopulate it. */
export function useBudget(budgetId: string, enabled = true): BudgetState {
  const [state, setState] = useState<State>({ status: 'loading', budgetId })
  const [refreshTick, setRefreshTick] = useState(0)
  const [refreshPending, setRefreshPending] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState(previous => previous.budgetId === budgetId && previous.status === 'ready' ? previous : { status: 'loading', budgetId })
    setRefreshError(null)
    async function load() {
      const snapshot = await loadBudgetSnapshot(budgetId, controller.signal)
      if (!controller.signal.aborted) {
        setState({ status: 'ready', budgetId, ...snapshot })
        setRefreshPending(false)
      }
    }
    load().catch(error => {
      if (controller.signal.aborted) return
      setState(previous => {
        if (!(error instanceof AccessError) && previous.budgetId === budgetId && previous.status === 'ready') return previous
        return { status: 'error', budgetId, message: error.message }
      })
      setRefreshError(error.message)
      setRefreshPending(false)
    })
    return () => controller.abort()
  }, [budgetId, enabled, refreshTick])
  const refresh = useCallback(() => { if (refreshPending) return; setRefreshPending(true); setRefreshTick(tick => tick + 1) }, [refreshPending])
  const current: State = state.budgetId === budgetId ? state : { status: 'loading', budgetId }
  return { ...current, accept: snapshot => { setState({status:'ready', budgetId, ...snapshot}); setRefreshError(null) }, invalidate: message => { setState({status:'error',budgetId,message}); setRefreshError(null) }, refresh, refreshPending, refreshError, dismissRefreshError: () => setRefreshError(null) }
}
