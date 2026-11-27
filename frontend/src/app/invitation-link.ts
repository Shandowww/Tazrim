const spacesPath = '/next/settings/spaces'
const invitationKey = 'budgit-pending-space-invite'

export function invitationFromHash(hash: string) {
  const token = new URLSearchParams(hash.slice(1)).get('invite') ?? ''
  return /^[a-f0-9]{64}$/.test(token) ? token : ''
}

export function openInvitation() {
  const url = new URL(window.location.href)
  const path = url.pathname.replace(/\/$/, '')
  if (path !== '/next' && path !== spacesPath) return
  let token = invitationFromHash(url.hash)
  if (path === spacesPath) {
    try {
      const stored = sessionStorage.getItem(invitationKey) ?? ''
      sessionStorage.removeItem(invitationKey)
      if (!token && /^[a-f0-9]{64}$/.test(stored)) token = stored
    } catch {}
  }
  if (!token) return
  url.pathname = spacesPath
  url.hash = 'invite=' + token
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
