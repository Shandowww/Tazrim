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
  writeIdentityBound?: boolean
  accountEmail: string
  accountId: string
  budget?: BudgetSpace
}


interface SpaceList { budgets: BudgetSpace[]; accountEmail: string; accountId: string }

export class AccessError extends Error {}

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
  if (!Array.isArray(spaces.budgets) || typeof spaces.accountId !== 'string' || !spaces.accountId || typeof spaces.accountEmail !== 'string' || !spaces.accountEmail || spaces.budgets.some(space => !space || typeof space.id !== 'string' || !['owner','editor','viewer'].includes(space.role))) throw new AccessError('לא ניתן לאמת את החשבון והמרחבים. יש להיכנס מחדש.')
  if (!spaces.budgets.some(space => space.id === budgetId)) throw new AccessError('התקציב אינו זמין לחשבון הזה.')
  const value = await readJson<BudgetResponse>('/api/plan?budget=' + encodeURIComponent(budgetId), signal, fetcher)
  if (!Number.isInteger(value.revision) || value.revision < 0 || value.plan !== null && (typeof value.plan !== 'object' || Array.isArray(value.plan)) || budgetId !== 'personal' && value.budget?.id !== budgetId) throw new AccessError('תגובת התקציב אינה תואמת למרחב שנבחר.')
  if (spaces.accountId !== value.accountId || spaces.accountEmail !== value.accountEmail || value.budget && value.budget.id !== budgetId) throw new AccessError('החשבון השתנה בזמן הטעינה. יש לרענן ולהיכנס מחדש.')
  return { value, spaces: spaces.budgets }
}
