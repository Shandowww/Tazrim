const linkPattern = /^bank-match:([a-f0-9]{64}):([a-f0-9]{64})$/;
const normalizeBankMatchText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

function bankDescriptionWithoutValueDate(row, description) {
 const suffix = /\s+\(תאריך ערך:\s*(\d{2})\/(\d{2})(?:\/(\d{4}))?\)$/u.exec(description);
 if (!suffix || typeof row.valueDate !== 'string') return description;
 const [, day, month, year] = suffix;
 if (row.valueDate.slice(5) !== `${month}-${day}` || year && row.valueDate.slice(0, 4) !== year) return description;
 return description.slice(0, suffix.index);
}

function bankDescriptionsAgree(row, source) {
 const description = normalizeBankMatchText(row.description), savedDescription = normalizeBankMatchText(source.description);
 if (description && description === savedDescription) return true;
 if (row.valueDate && source.valueDate && row.valueDate !== source.valueDate) return false;
 if (['details', 'beneficiary', 'purpose'].some(key => {
  const incoming = normalizeBankMatchText(row[key]), saved = normalizeBankMatchText(source[key]);
  return incoming && saved && incoming !== saved;
 })) return false;
 const withoutDate = bankDescriptionWithoutValueDate(row, description);
 return !!withoutDate && withoutDate === bankDescriptionWithoutValueDate(source, savedDescription);
}

export function bankMatchLink(row, entry, accountId) {
 const source = entry?.source;
 if (!source || typeof row.date !== 'string' || entry.accountId !== accountId || entry.month !== row.date.slice(0, 7) || source.date !== row.date || entry.cents !== row.amountCents || (source.currency ?? 'ILS') !== row.currency) return '';
 const reference = normalizeBankMatchText(row.reference), savedReference = normalizeBankMatchText(source.reference);
 if (reference && savedReference && reference !== savedReference) return '';
 const bothBalances = Number.isSafeInteger(row.balanceCents) && Number.isSafeInteger(source.balanceCents);
 if (bothBalances && row.balanceCents !== source.balanceCents) return '';
 if (entry.fingerprint !== row.fingerprint && !(reference && reference === savedReference) && !(bothBalances && bankDescriptionsAgree(row, source))) return '';
 const link = `bank-match:${entry.key}:${entry.fingerprint}`;
 return linkPattern.test(link) ? link : '';
}

export function bankMatchLinkKey(link) {
 return typeof link === 'string' ? linkPattern.exec(link)?.[1] : undefined;
}
