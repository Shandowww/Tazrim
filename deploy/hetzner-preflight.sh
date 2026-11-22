#!/bin/sh
set -eu
export LC_ALL=C

refuse_request() {
  printf '%s\n' 'Expected: check <40-character Git commit SHA>' >&2
  exit 2
}

case ${SSH_ORIGINAL_COMMAND-} in
  'check '*) commit=${SSH_ORIGINAL_COMMAND#check } ;;
  *) refuse_request ;;
esac

[ "${#commit}" -eq 40 ] || refuse_request
case $commit in
  *[!0123456789abcdef]*) refuse_request ;;
esac

GIT_SSH_COMMAND='/usr/bin/ssh -F /dev/null -T -i /var/lib/budgit-preflight/.ssh/github-read -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=/var/lib/budgit-preflight/.ssh/github_known_hosts -o ConnectTimeout=10'
export GIT_SSH_COMMAND

main_ref=refs/heads/main
if ! remote_ref=$(/usr/bin/timeout 30s /usr/bin/git ls-remote --exit-code --refs \
  'git@github.com:Shandowww/monthly-flow-budget.git' "$main_ref"); then
  printf '%s\n' 'Could not read the Budgit main branch from GitHub.' >&2
  exit 1
fi

if [ "$remote_ref" != "$(printf '%s\t%s' "$commit" "$main_ref")" ]; then
  printf '%s\n' 'GitHub main has a different commit. Start a new Actions run from main.' >&2
  exit 1
fi

printf 'Hetzner verified GitHub main at %s\n' "$commit"
