#!/usr/bin/env bash
# Release GitHub main to Hetzner when it advances. Run by budgit-autodeploy.timer.
# Merging to main is the release approval; this never deploys anything else.
set -uo pipefail
umask 077

lib=/usr/local/lib/budgit-release
token=/etc/budgit-release/actions-token
state=/var/lib/budgit-autodeploy
release=/opt/budgit/RELEASE
repo=git@github.com:Shandowww/monthly-flow-budget.git
ssh_command='/usr/bin/ssh -F /dev/null -T -i /var/lib/budgit-preflight/.ssh/github-read -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=/var/lib/budgit-preflight/.ssh/github_known_hosts -o ConnectTimeout=10'
max_attempts=3
keep_runs=5

install -d -m 0700 "$state"

status() {
  python3 -I - "$state/status.json" "$@" <<'PY'
import json, os, sys, time
path, commit, result, code, attempts, log = sys.argv[1:]
tail = ''
if log and os.path.exists(log):
    with open(log, errors='replace') as stream:
        tail = ''.join(stream.readlines()[-15:])
record = {'commit': commit, 'result': result, 'exit': int(code), 'attempts': int(attempts),
          'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'log': tail}
temporary = path + '.tmp'
with open(temporary, 'w') as stream:
    json.dump(record, stream, indent=2)
os.replace(temporary, path)
PY
}

prune() {
  local dir suffix keep=()
  mapfile -t runs < <(ls -1dt /opt/budgit-releases/auto-* 2>/dev/null)
  for dir in "${runs[@]:0:keep_runs}"; do keep+=("${dir##*/}"); done
  for dir in "${runs[@]:keep_runs}"; do
    [[ -n $dir && $dir == /opt/budgit-releases/auto-* ]] || continue
    grep -qx 'result=rollback-failed' "$dir/manifest.txt" 2>/dev/null && continue
    rm -rf -- "$dir"
  done
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^budgit-(dry-run|rollback):auto-' |
    while IFS= read -r tag; do
      suffix=${tag#*:}
      [[ " ${keep[*]} " == *" $suffix "* ]] || docker rmi "$tag" >/dev/null 2>&1 || true
    done
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
}

if [[ -e $state/paused ]]; then
  printf 'Automatic releases are paused (%s).\n' "$state/paused"
  exit 0
fi
[[ -r $token && -s $token ]] || { printf 'Missing Actions token at %s.\n' "$token" >&2; exit 1; }

head=$(runuser -u budgit-preflight -- env GIT_SSH_COMMAND="$ssh_command" \
  timeout 60s git ls-remote "$repo" refs/heads/main </dev/null | cut -f1)
[[ $head =~ ^[0-9a-f]{40}$ ]] || { printf 'Could not read GitHub main.\n' >&2; exit 1; }
live=$(cat "$release")
[[ $head == "$live" ]] && exit 0

attempts_file=$state/attempts-$head
attempts=$(cat "$attempts_file" 2>/dev/null || printf 0)
if (( attempts >= max_attempts )); then
  if [[ ! -e $state/gave-up-$head ]]; then
    touch "$state/gave-up-$head"
    printf 'Giving up on %s after %s failed attempts; release it under supervision or push a fix.\n' "$head" "$attempts" >&2
  fi
  exit 0
fi

log=$state/last-run.log
# systemd (KillMode=mixed) signals only this process; pass it on so the runner can roll back.
"$lib/hetzner-release.sh" --deploy "$head" < "$token" > "$log" 2>&1 &
runner=$!
trap 'kill -TERM "$runner" 2>/dev/null' TERM INT
while :; do
  wait "$runner" && code=0 || code=$?
  kill -0 "$runner" 2>/dev/null || break
done
trap - TERM INT
cat "$log"
case $code in
  0)
    rm -f -- "$state"/attempts-* "$state"/gave-up-*
    status "$head" released 0 "$attempts" "$log"
    prune
    ;;
  75)
    status "$head" waiting-for-ci 75 "$attempts" "$log"
    ;;
  *)
    attempts=$((attempts + 1))
    printf '%s\n' "$attempts" > "$attempts_file"
    status "$head" failed "$code" "$attempts" "$log"
    grep -q 'ROLLBACK NEEDS IMMEDIATE INSPECTION' "$log" && touch "$state/paused"
    exit "$code"
    ;;
esac
