// Pinned Tazrim result/highlight types only. No upstream DB queries, search API or financial logic.
export type SearchSource = 'bank' | 'card'

/**
 * One search hit, from either table.
 *
 * `amount` is signed from the user's point of view: POSITIVE = money out
 * (bank debit, card charge), NEGATIVE = money in (bank credit, card refund).
 * `date` is the local calendar day (YYYY-MM-DD) so server and browser render
 * the same text; `dateMs` is the stored timestamp, used for ordering/cursors.
 */
export interface SearchResult {
  id: string
  source: SearchSource
  accountId: string
  accountName: string
  date: string
  dateMs: number
  /** Bank description / card merchant name, as shown in the account tables (alias already applied) */
  description: string
  /** The raw name from the statement, only when it differs from `description` */
  originalDescription?: string
  amount: number
  /** Card rows: the override when set, else the statement category. Bank rows: theirs, when set */
  category?: string
  note?: string
  /** The issuer's or bank's transaction id (voucher number / אסמכתא), when the file had one */
  reference?: string
  ignored: boolean
  /** Name of the manual recurring series that holds the row (ENG-71), computed per read */
  recurringLabel?: string
}

export interface TextPart {
  text: string
  match: boolean
}

/** Splits `text` into matched / unmatched parts for every term (case-insensitive, overlaps merged). */
export function highlightParts(text: string, terms: string[]): TextPart[] {
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)
  for (const term of terms) {
    const t = term.toLowerCase()
    if (!t) continue
    for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + 1)) {
      for (let j = i; j < i + t.length; j++) marks[j] = true
    }
  }
  const parts: TextPart[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.match === marks[i]) last.text += text[i]
    else parts.push({ text: text[i], match: marks[i] })
  }
  return parts.length ? parts : [{ text, match: false }]
}
