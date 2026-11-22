const linkPattern = /^bank-match:([a-f0-9]{64}):([a-f0-9]{64})$/;
const normalizeBankMatchText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

export function bankMatchLink(row, entry, accountId) {
 const source = entry?.source;
 if (!source || typeof row.date !== 'string' || entry.accountId !== accountId || entry.month !== row.date.slice(0, 7) || source.date !== row.date || entry.cents !== row.amountCents || (source.currency ?? 'ILS') !== row.currency) return '';
 const reference = normalizeBankMatchText(row.reference), savedReference = normalizeBankMatchText(source.reference);
 if (reference && savedReference && reference !== savedReference) return '';
 const bothBalances = Number.isSafeInteger(row.balanceCents) && Number.isSafeInteger(source.balanceCents);
 if (bothBalances && row.balanceCents !== source.balanceCents) return '';
 const description = normalizeBankMatchText(row.description);
 const sameDescription = !!description && description === normalizeBankMatchText(source.description);
 if (entry.fingerprint !== row.fingerprint && !(reference && reference === savedReference) && !(bothBalances && sameDescription)) return '';
 const link = `bank-match:${entry.key}:${entry.fingerprint}`;
 return linkPattern.test(link) ? link : '';
}

export function bankMatchLinkKey(link) {
 return typeof link === 'string' ? linkPattern.exec(link)?.[1] : undefined;
}
