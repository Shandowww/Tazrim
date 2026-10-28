export function periodFor(search: string) {
  const query = new URLSearchParams(search)
  const now = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const asOf = `${now.find(p => p.type === 'year')!.value}-${now.find(p => p.type === 'month')!.value}`
  return { year: /^20\d{2}$/.test(query.get('year') || '') ? query.get('year')! : asOf.slice(0, 4), month: /^(?:[1-9]|1[0-2]|0[1-9])$/.test(query.get('month') || '') ? String(Number(query.get('month'))).padStart(2, '0') : '', asOf,
    account: query.get('account') || '', card: query.get('card') || '', category: query.get('category') || '', query: query.get('query') || '' }
}
