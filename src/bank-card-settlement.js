import {cashCardAccount, cents, creditCards} from './budget.js';

const debitText = value => String(value ?? '').normalize('NFKC')
 .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
 .replace(/\s*\(תאריך ערך:[^)]+\)\s*$/, '')
 .replace(/\s+/g, ' ').trim();
const issuerLabels = [
 ['cal', /^(?:(?:מזרחי|דיסקונט)[ -])?(?:כ[.״"׳']?א[.״"׳']?ל|כרטיסי אשראי לישראל|דיינרס(?: קלאב)?)$/i],
 ['isracard', /^(?:ישראכרט|אמריקן אקספרס)$/i],
 ['max', /^(?:max|מקס|מקס איט פיננסים)$/i]
];

export function bankCardDebit(row) {
 if (row.amountCents >= 0 || row.reversal) return null;
 const action = debitText(row.description);
 const beneficiary = debitText(row.beneficiary);
 const issuerOf = text => issuerLabels.find(([, pattern]) => pattern.test(text))?.[0] ?? '';
 const actionIssuer = issuerOf(action);
 if (actionIssuer) return {issuer: actionIssuer};
 const issuer = issuerOf(beneficiary);
 if (/^(?:חיוב(?:י)? (?:כרטיס(?:י)?(?: אשראי)?|אשראי)|כרטיס(?:י)? אשראי)(?:$|[ :\-])/u.test(action)) return {issuer};
 if (issuer && /^(?:הרשאה לחיוב חשבון|חיוב (?:בהרשאה|על פי הרשאה)|הוראת קבע)$/u.test(action)) return {issuer};
 return null;
}

const billingKey = (cardId, date) => JSON.stringify([cardId, date]);
const debitKey = (date, amount) => JSON.stringify([date, amount]);
const billingDates = (date, valueDate) => [...new Set([date, valueDate].filter(value =>
 typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && value.slice(0, 7) === date?.slice(0, 7) && value <= date))];

export function applyBankCardSettlementChoices(plan, rows, options, cardFiles = []) {
 const {accountId, choices, modes} = options;
 const cards = new Map(creditCards(plan).map(card => [card.id, card]));
 const reports = (plan.cardBilling?.reports ?? []).filter(report => report.source === 'file');
 // A card report in this group supplies evidence only after the normal statement
 // preparation accepted it. Totals typed into the no-detail form are excluded.
 const pending = cardFiles.filter(file => file.statement && !file.item?.questions?.length);
 const payers = new Map();
 for (const {cardId, accountId: payer} of [...(plan.cardBilling?.reports ?? []), ...pending]) {
  if (!payers.has(cardId)) payers.set(cardId, new Set());
  payers.get(cardId).add(payer);
 }
 const linkedPayers = new Map([...cards.keys()].map(cardId => [cardId, cashCardAccount(plan, cardId)]));
 const conflictingPayers = new Set((plan.bankImport?.entries ?? [])
  .filter(entry => entry.accountId !== accountId && cards.has(entry.field)).map(entry => entry.field));
 const cycles = new Map();
 for (const {cardId, accountId: payer, dueDate, amount} of [...reports, ...pending]) {
  const key = billingKey(cardId, dueDate);
  const charge = {key, cardId, payer, dueDate, amountCents: cents(amount)};
  if (!cycles.has(key)) cycles.set(key, charge);
  else if (JSON.stringify(charge) !== JSON.stringify(cycles.get(key))) cycles.set(key, null);
 }
 const byDebit = new Map();
 for (const charge of cycles.values()) {
  if (!charge || charge.payer !== accountId || charge.amountCents <= 0) continue;
  const {cardId, dueDate, amountCents} = charge;
  const card = cards.get(cardId), knownPayer = linkedPayers.get(cardId);
  if (!card || card.removedFrom && dueDate.slice(0, 7) >= card.removedFrom ||
      knownPayer && knownPayer !== accountId || !knownPayer && (payers.get(cardId).size !== 1 || conflictingPayers.has(cardId))) continue;
  const key = debitKey(dueDate, amountCents);
  if (!byDebit.has(key)) byDebit.set(key, []);
  byDebit.get(key).push({...charge, issuer: card.issuer ?? card.provider ?? ''});
 }
 const savedByCardAmount = new Map();
 for (const entry of plan.bankImport?.entries ?? []) {
  if (entry.accountId !== accountId || !cards.has(entry.field) || entry.cents >= 0) continue;
  const key = JSON.stringify([entry.field, entry.month, -entry.cents]);
  if (!savedByCardAmount.has(key)) savedByCardAmount.set(key, []);
  savedByCardAmount.get(key).push(entry);
 }
 const candidatesByLine = new Map(), contenders = new Map();
 for (const row of rows) {
  const cue = bankCardDebit(row);
  if (!cue || !['new', 'conflict'].includes(row.state) || row.currency !== 'ILS' ||
      !Number.isSafeInteger(row.amountCents) || modes[row.date?.slice(0, 7)] === 'skip') continue;
  const candidates = billingDates(row.date, row.valueDate).flatMap(date => byDebit.get(debitKey(date, -row.amountCents)) ?? [])
   .filter(charge => !cue.issuer || !['cal', 'isracard', 'max'].includes(charge.issuer) || charge.issuer === cue.issuer);
  candidatesByLine.set(row.line, candidates);
  for (const candidate of candidates) contenders.set(candidate.key, (contenders.get(candidate.key) ?? 0) + 1);
 }
 for (const row of rows) {
  if (row.state !== 'new' || !candidatesByLine.has(row.line)) continue;
  const candidates = candidatesByLine.get(row.line), [candidate] = candidates;
  const saved = candidate ? savedByCardAmount.get(JSON.stringify([candidate.cardId, candidate.dueDate.slice(0, 7), candidate.amountCents])) ?? [] : [];
  const alreadyUsed = candidate && saved.some(entry => !entry.source?.date ||
   billingDates(entry.source.date, entry.source.valueDate).includes(candidate.dueDate));
  const matched = candidates.length === 1 && contenders.get(candidate.key) === 1 && !alreadyUsed;
  const reason = matched ? 'נמצא חיוב אחד עם אותו סכום, תאריך וחשבון משלם.' : candidates.length > 1
   ? 'יותר מכרטיס אחד מתאים לפי הסכום והתאריך. יש לבחור את הכרטיס.'
   : candidate ? 'אותו חיוב מתאים גם לתנועת בנק אחרת. יש לבדוק את השיוך.'
   : 'לא נמצא דוח כרטיס תואם לפי סכום, תאריך וחשבון משלם.';
  const cardSettlement = {matched, reason, candidates: candidates.map(({cardId, dueDate}) => ({cardId, dueDate}))};
  const current = choices[row.line];
  choices[row.line] = current?.manual ? {...current, cardSettlement: {...cardSettlement, matched: false}} :
   {field: matched ? candidate.cardId : '', reviewed: matched, reason, cardSettlement};
 }
}
