import { useEffect, useState } from 'react'

export interface BudgetSpace {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  revision: number
  hasData?: boolean
  scope: string
}

export interface BudgetResponse {
  plan: Record<string, unknown> | null
  revision: number
  accountEmail: string
  accountId: string
  budget?: BudgetSpace
}

interface SpaceList { budgets: BudgetSpace[]; accountEmail: string; accountId: string }
type State = { status: 'loading'; budgetId: string } | { status: 'ready'; budgetId: string; value: BudgetResponse; spaces: BudgetSpace[] } | { status: 'error'; budgetId: string; message: string }
type BudgetState = State & { refresh: () => void; refreshPending: boolean; refreshError: string | null; dismissRefreshError: () => void }

class AccessError extends Error {}

async function readJson<T>(url: string, signal: AbortSignal, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { credentials: 'same-origin', cache: 'no-store', signal })
  if (!response.ok) {
    if (response.status === 401) throw new AccessError('החיבור לחשבון פג. יש להיכנס מחדש.')
    if (response.status === 403 || response.status === 404) throw new AccessError('התקציב אינו זמין לחשבון הזה.')
    throw new Error('לא ניתן לטעון את התקציב. אפשר לנסות לרענן.')
  }
  return response.json() as Promise<T>
}

/** Reads only an explicitly permitted space; useful as a pure API contract boundary. */
export async function loadBudgetSnapshot(budgetId: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const spaces = await readJson<SpaceList>('/api/budgets', signal, fetcher)
  if (!spaces.budgets.some(space => space.id === budgetId)) throw new AccessError('התקציב אינו זמין לחשבון הזה.')
  const value = await readJson<BudgetResponse>('/api/plan?budget=' + encodeURIComponent(budgetId), signal, fetcher)
  if (spaces.accountId !== value.accountId || spaces.accountEmail !== value.accountEmail || value.budget && value.budget.id !== budgetId) throw new AccessError('החשבון השתנה בזמן הטעינה. יש לרענן ולהיכנס מחדש.')
  return { value, spaces: spaces.budgets }
}

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
  const current: State = state.budgetId === budgetId ? state : { status: 'loading', budgetId }
  return { ...current, refresh: () => { if (refreshPending) return; setRefreshPending(true); setRefreshTick(tick => tick + 1) }, refreshPending, refreshError, dismissRefreshError: () => setRefreshError(null) }
}
