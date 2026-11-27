#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  printf 'Usage: %s [--dry-run | --deploy]\n' "${0##*/}"
  printf '%s\n' 'Rehearse (default) or release GitHub main on Hetzner. Read the Actions token from standard input.'
  printf '%s\n' 'With --deploy, an optional full commit ID makes the run release only that commit.'
  printf '%s\n' 'Exit 75 means try again later: CI is pending, main moved, or another run holds the lock.'
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

if [[ $# -eq 1 && $1 == --help ]]; then
  usage
  exit 0
fi
mode=${1:---dry-run}
mode=${mode#--}
expected=${2:-}
if (( $# > 2 )) || [[ $mode != dry-run && $mode != deploy ]] \
    || [[ -n $expected && ( $mode != deploy || ! $expected =~ ^[0-9a-f]{40}$ ) ]]; then
  usage >&2
  exit 2
fi
(( EUID == 0 )) || fail 'Run the release runner as a Hetzner administrator.'
[[ ! -t 0 ]] || fail 'Supply the GitHub Actions read token on standard input.'

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
trivy="$script_dir/trivy"
app=/opt/budgit
data=$app/data
release=$app/RELEASE
live=budgit-budgit-1
origin=https://budgit.duckdns.org
repo=git@github.com:Shandowww/monthly-flow-budget.git
ssh_command='/usr/bin/ssh -F /dev/null -T -i /var/lib/budgit-preflight/.ssh/github-read -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=/var/lib/budgit-preflight/.ssh/github_known_hosts -o ConnectTimeout=10'
hash_runtime='find dist server drizzle -type f -print0 | sort -z | xargs -0 sha256sum'
compose=(docker compose -p budgit -f "$app/deploy/compose.yaml")
# Present only while production may be half-switched; blocks every later run.
sentinel=/opt/budgit-releases/ACTIVATION-IN-PROGRESS

for file in "$script_dir/verify-github-validation.py" "$script_dir/release-gates.mjs" \
    "$script_dir/release-preservation.mjs" "$data/monthly-flow.sqlite" "$data/report-store.key" \
    "$data/backup-recipient.pem" "$release"; do
  [[ -f $file && -r $file ]] || fail "Required file is missing or unreadable: $file"
done
[[ -f $trivy && -x $trivy ]] || fail 'Stage a verified Trivy executable alongside the runner.'

exec 9>/run/lock/budgit-release.lock
flock -n 9 || { printf '%s\n' 'Another Budgit release or rehearsal is already running.' >&2; exit 75; }
[[ ! -e $sentinel ]] || fail "An earlier activation did not finish cleanly ($(cat "$sentinel" 2>/dev/null)). Inspect production, then remove $sentinel."

runtime_state() {
  docker inspect --format '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}' \
    "$live" park80-caddy-1 park80-app-1
}

# Every running container except Budgit must be untouched by a release.
adjacent_state() {
  local ids
  ids=$(docker ps -q --no-trunc --filter status=running | sort)
  [[ -n $ids ]] || return 0
  # shellcheck disable=SC2086
  docker inspect --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}' $ids \
    | { grep -v "^/$live " || true; } | sort
}

git_pull() {
  runuser -u budgit-preflight -- env GIT_SSH_COMMAND="$ssh_command" \
    timeout 120s git -C "$checkout" "$@" </dev/null
}

checkout=
work=
watch_live=0
activation_started=0
recreated=0

rollback_release() {
  printf 'Release verification failed; restoring the previous image and source.\n' >&2
  local ok=1
  if [[ -s $work/new.paths0 ]]; then
    (cd "$app" && xargs -0 rm -f -- < "$work/new.paths0") || ok=0
  fi
  if [[ -s $work/prior-source.tar ]]; then
    tar --null -xpf "$work/prior-source.tar" -C "$app" || ok=0
  fi
  docker tag "$live_image" budgit-budgit || ok=0
  if (( recreated )); then
    "${compose[@]}" up -d --no-build --no-deps --pull never --force-recreate --wait --wait-timeout 120 budgit \
      > "$work/rollback-activation.log" 2>&1 || ok=0
  fi
  [[ $(docker inspect --format '{{.Image}}' "$live" 2>/dev/null) == "$live_image" ]] || ok=0
  curl -fsS --retry 3 --max-time 15 "$origin/api/health" > "$work/rollback-health.json" 2>/dev/null || ok=0
  { marker=$(mktemp "$app/.RELEASE.XXXXXX") && printf '%s\n' "$live_commit" > "$marker" \
    && chmod --reference="$release" "$marker" && mv -f "$marker" "$release"; } || ok=0
  [[ $(cat "$release") == "$live_commit" ]] || ok=0
  if (( ok )); then
    rm -f -- "$sentinel"
    printf 'result=rolled-back\n' >> "$work/manifest.txt"
    printf 'Rollback verified. Live release remains %s; the database was not restored or overwritten.\n' "$live_commit" >&2
  else
    printf 'result=rollback-failed\n' >> "$work/manifest.txt"
    printf 'ROLLBACK NEEDS IMMEDIATE INSPECTION: %s\n' "$work" >&2
  fi
}

cleanup() {
  local status=$? current_state current_release
  trap '' INT TERM HUP
  set +e
  if (( status != 0 && activation_started )); then
    rollback_release
  elif (( watch_live )); then
    if ! current_state=$(runtime_state) || ! current_release=$(cat "$release") \
        || [[ $current_state != "$initial_state" || $current_release != "$live_commit" ]]; then
      printf '%s\n' 'Could not confirm the live release and watched containers stayed unchanged.' >&2
      if (( status == 0 )); then status=1; fi
      if [[ -n $work ]]; then rm -f -- "$work/manifest.txt"; fi
    fi
  fi
  if [[ -n $work ]]; then rm -rf -- "$work/trivy-cache"; fi
  if [[ -n $checkout ]]; then
    runuser -u budgit-preflight -- python3 -c \
      'import shutil, sys; shutil.rmtree(sys.argv[1])' "$checkout" </dev/null || {
        printf 'Could not clean up temporary checkout %s.\n' "$checkout" >&2
        if (( status == 0 )); then status=1; fi
      }
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

live_commit=$(cat "$release")
[[ $live_commit =~ ^[0-9a-f]{40}$ ]] || fail 'The live release marker is not a full commit ID.'
live_image=$(docker inspect --format '{{.Image}}' "$live")
initial_state=$(runtime_state)
watch_live=1
checkout=$(runuser -u budgit-preflight -- mktemp -d /tmp/budgit-pull.XXXXXX </dev/null)
git_pull init --quiet
git_pull fetch --quiet --depth=200 --no-tags "$repo" refs/heads/main
commit=$(git_pull rev-parse FETCH_HEAD)
[[ $commit =~ ^[0-9a-f]{40}$ ]] || fail 'Fetched an unexpected commit ID.'
if [[ -n $expected && $commit != "$expected" ]]; then
  printf 'Main moved from %s to %s; try again.\n' "$expected" "$commit" >&2
  exit 75
fi

if [[ $mode == deploy ]]; then
  if [[ $commit == "$live_commit" ]]; then
    printf 'Live release already matches main at %s.\n' "$commit"
    exit 0
  fi
  # Never move production backwards or sideways (for example after a force-push to main).
  git_pull merge-base --is-ancestor "$live_commit" "$commit" \
    || fail "Main $commit does not descend from live release $live_commit; release it under supervision."
fi

# Only the unprivileged verifier receives the GitHub API credential.
validation_status=0
validation=$(runuser -u budgit-preflight -- python3 -I -c "$(cat "$script_dir/verify-github-validation.py")" \
  "$commit") || validation_status=$?
exec </dev/null
if (( validation_status == 75 )); then
  printf 'CI has not completed for %s yet.\n' "$commit" >&2
  exit 75
fi
(( validation_status == 0 )) || exit "$validation_status"

prefix=dry-run
[[ $mode == deploy ]] && prefix=auto
work=$(mktemp -d "/opt/budgit-releases/$prefix-${commit:0:8}.XXXXXX")
printf 'Evidence directory %s\n' "$work"
printf '%s\n' "$validation" > "$work/github-validation.json"
cat "$work/github-validation.json"

git_pull archive --format=tar "$commit" > "$work/source.tar"
[[ $(git get-tar-commit-id < "$work/source.tar") == "$commit" ]] || fail 'Archive commit does not match the CI result.'
sha256sum "$work/source.tar" > "$work/source.sha256"
mkdir "$work/source"
tar -xf "$work/source.tar" -C "$work/source" --no-same-owner

suffix=${work##*/}
candidate_tag="budgit-dry-run:$suffix"
printf 'Building the isolated candidate image.\n'
if timeout --kill-after=10s 600s nice -n 10 docker build --label "org.opencontainers.image.revision=$commit" \
    -t "$candidate_tag" "$work/source" </dev/null > "$work/build.log" 2>&1; then
  printf 'Candidate image built.\n'
else
  status=$?
  printf 'Candidate build failed. See %s/build.log\n' "$work" >&2
  exit "$status"
fi
candidate_image=$(docker image inspect --format '{{.Id}}' "$candidate_tag")
[[ $candidate_image =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'Docker did not return an immutable candidate image ID.'
image_commit=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate_image")
[[ $image_commit == "$commit" ]] || fail 'Candidate image does not match the validated commit.'

printf '{}\n' > "$work/trivy.yaml"
scan_candidate() {
  timeout --kill-after=10s 360s env -i PATH=/usr/bin:/bin HOME=/root "$trivy" \
    --config "$work/trivy.yaml" --cache-dir "$work/trivy-cache" --timeout 5m image \
    --image-src docker --docker-host unix:///var/run/docker.sock --scanners vuln,secret \
    --ignorefile /dev/null --format table "$@" "$candidate_image" </dev/null
}
printf 'Scanning immutable candidate %s.\n' "$candidate_image"
scan_candidate --exit-code 0 > "$work/trivy-report.log" 2>&1 \
  || fail "Candidate scan failed. See $work/trivy-report.log"
if scan_candidate --severity HIGH,CRITICAL --ignore-unfixed --exit-code 10 > "$work/trivy-policy.log" 2>&1; then
  printf 'PASS Trivy policy for %s\n' "$candidate_image"
else
  status=$?
  if (( status == 10 )); then
    fail "Trivy policy blocked the candidate. See $work/trivy-policy.log"
  fi
  fail "Trivy policy scan failed (exit $status). See $work/trivy-policy.log"
fi
rm -rf -- "$work/trivy-cache"

# VACUUM INTO takes a consistent copy from the read-only live connection.
# snapshot <target> [owner-uid]: gates run as UID 1000; the record check runs as root without capabilities.
snapshot() {
  python3 - "$data/monthly-flow.sqlite" "$1" "${2:-0}" <<'PY'
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

source, backup = map(Path, sys.argv[1:3])
owner = int(sys.argv[3])
with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True, timeout=15)) as db:
    db.execute('VACUUM INTO ?', (str(backup),))
with closing(sqlite3.connect(backup)) as snapshot:
    if snapshot.execute('PRAGMA journal_mode=DELETE').fetchone() != ('delete',):
        raise RuntimeError('The backup must open without WAL files in the test containers.')
    if snapshot.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise RuntimeError('Backup integrity check failed.')
    if snapshot.execute('PRAGMA foreign_key_check').fetchone() is not None:
        raise RuntimeError('Backup foreign key check failed.')
os.chown(backup, owner, owner)
os.chmod(backup, 0o600)
PY
}
backup="$work/backup.sqlite"
snapshot "$backup" 1000
printf 'Fresh SQLite backup passed integrity and foreign-key checks.\n'
sha256sum "$backup" > "$work/backup.sha256"
install -d -m 0700 -o 1000 -g 1000 "$work/rollback-test"

install -o root -g root -m 0444 "$script_dir/release-gates.mjs" "$work/release-gates.mjs"
base=(--rm --user 1000:1000 --network none --read-only --cap-drop ALL --security-opt no-new-privileges
  --memory 384m --cpus 0.5 --tmpfs /tmp:rw,size=128m
  --mount "type=bind,source=$work/release-gates.mjs,target=/gates/release-gates.mjs,readonly"
  --mount "type=bind,source=$data/report-store.key,target=/keys/report-store.key,readonly"
  --mount "type=bind,source=$data/backup-recipient.pem,target=/keys/backup-recipient.pem,readonly")

run_check() {
  local gate=$1 input=$2 container status
  shift 2
  container="budgit-$suffix-$gate"
  if timeout --kill-after=10s 120s docker run --name "$container" "${base[@]}" \
      --mount "type=bind,source=$input,target=/input/backup.sqlite,readonly" \
      "$@" </dev/null > "$work/$gate.log" 2>&1; then
    printf 'PASS %s\n' "$gate"
  else
    status=$?
    docker container kill "$container" >/dev/null 2>&1 || true
    printf 'Gate %s failed. See %s/%s.log\n' "$gate" "$work" "$gate" >&2
    exit "$status"
  fi
}

report_keys=(/keys/report-store.key /keys/backup-recipient.pem)
run_check candidate-financial "$backup" "$candidate_image" node server/preflight-financial-data.mjs /input/backup.sqlite
run_check candidate-access "$backup" "$candidate_image" node /gates/release-gates.mjs access /input/backup.sqlite "${report_keys[@]}"
run_check candidate-restore "$backup" --mount "type=bind,source=$work/rollback-test,target=/rollback" \
  "$candidate_image" node /gates/release-gates.mjs restore /input/backup.sqlite "${report_keys[@]}" /rollback/initialized.sqlite
restored="$work/rollback.sqlite"
python3 - "$work/rollback-test" "$restored" <<'PY'
import os
import shutil
import stat
import sys

scratch, sealed = sys.argv[1:]
directory = os.open(scratch, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    descriptor = os.open('initialized.sqlite', os.O_PATH | os.O_NOFOLLOW, dir_fd=directory)
    try:
        witness = os.fstat(descriptor)
        if not stat.S_ISREG(witness.st_mode) or witness.st_nlink != 1 or witness.st_uid != 1000 or not witness.st_size:
            raise RuntimeError('Candidate restore output must be a nonempty regular file with one link, owned by UID 1000.')
        source = open(f'/proc/self/fd/{descriptor}', 'rb')
    finally:
        os.close(descriptor)
    with source:
        with open(sealed, 'xb') as target:
            shutil.copyfileobj(source, target)
            current = os.fstat(source.fileno())
            if (current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (
                witness.st_size, witness.st_mtime_ns, witness.st_ctime_ns
            ) or target.tell() != witness.st_size:
                raise RuntimeError('Candidate restore output changed during copying.')
            os.fchmod(target.fileno(), 0o444)
finally:
    os.close(directory)
PY
sha256sum "$restored" > "$work/rollback.sha256"
run_check rollback-financial "$restored" "$live_image" node server/preflight-financial-data.mjs /input/backup.sqlite
run_check rollback-access "$restored" "$live_image" node /gates/release-gates.mjs access /input/backup.sqlite "${report_keys[@]}"
rm -rf -- "$work/rollback-test"

sha256sum -c --status "$work/backup.sha256" "$work/source.sha256" "$work/rollback.sha256"
[[ $(cat "$release") == "$live_commit" && $(runtime_state) == "$initial_state" ]] \
  || fail 'The live release or a watched container changed during the rehearsal.'

# Compare the candidate's runtime files with the running release.
isolated=(--rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges)
docker run "${isolated[@]}" "$candidate_image" sh -ec "$hash_runtime" > "$work/runtime.expected"
docker exec "$live" sh -ec "$hash_runtime" > "$work/runtime.live"
[[ -s $work/runtime.expected && -s $work/runtime.live ]] || fail 'Could not hash runtime files.'
build=$(docker run "${isolated[@]}" "$candidate_image" node --input-type=module \
  -e 'import {parserVersion} from "./dist/server/report-parser-version.mjs";process.stdout.write(parserVersion)')
[[ $build =~ ^[0-9a-f]{6,64}$ ]] || fail 'Candidate has no valid build ID.'
runtime_changed=1
cmp -s "$work/runtime.expected" "$work/runtime.live" && runtime_changed=0

rollback_tag="budgit-rollback:$suffix"
docker image tag "$live_image" "$rollback_tag"
printf 'commit=%s\ncandidate_image=%s\ntrivy_policy=pass\nlive_commit=%s\nrollback_image=%s\nrollback_tag=%s\nbuild=%s\nruntime_changed=%s\nresult=pass\n' \
  "$commit" "$candidate_image" "$live_commit" "$live_image" "$rollback_tag" "$build" "$runtime_changed" > "$work/manifest.txt"

if [[ $mode == dry-run ]]; then
  printf 'Dry run passed for %s (build %s, runtime changed: %s). Live release remains %s.\n' \
    "$commit" "$build" "$runtime_changed" "$live_commit"
  exit 0
fi

################################################################################
# Activation. Merging to main is the release approval.
################################################################################

[[ $("${compose[@]}" config --images) == budgit-budgit ]] || fail 'Unexpected Compose image layout.'
cmp -s "$app/deploy/compose.yaml" "$work/source/deploy/compose.yaml" \
  || fail 'deploy/compose.yaml changed; release this commit under supervision.'

# Keep /opt/budgit's tracked source in step with the release. The data
# directory, secrets and the release marker are never replaced.
(cd "$work/source" && find . -type f ! -path './data/*' ! -path './.env*' ! -path './RELEASE' -print0 \
  | sed -z 's|^\./||' | sort -z) > "$work/paths0"
[[ -s $work/paths0 ]] || fail 'Candidate source has no files.'
: > "$work/existing.paths0"
: > "$work/new.paths0"
while IFS= read -r -d '' filename; do
  [[ $filename != *..* && $filename != /* ]] || fail "Unsafe source path: $filename"
  parent=$app
  IFS=/ read -r -a parts <<< "${filename%/*}"
  if [[ $filename == */* ]]; then
    for part in "${parts[@]}"; do
      parent=$parent/$part
      [[ ! -L $parent ]] || fail "Refusing to write through a symlink: $parent"
    done
  fi
  [[ ! -L $app/$filename ]] || fail "Refusing to replace a symlink: $app/$filename"
  if [[ -e $app/$filename ]]; then
    [[ -f $app/$filename ]] || fail "Not a regular file: $app/$filename"
    printf '%s\0' "$filename" >> "$work/existing.paths0"
  else
    printf '%s\0' "$filename" >> "$work/new.paths0"
  fi
done < "$work/paths0"
tar --null -cpf "$work/prior-source.tar" -C "$app" -T "$work/existing.paths0"
tar --null -cpf "$work/candidate-source.tar" -C "$work/source" -T "$work/paths0"
sha256sum "$work/prior-source.tar" "$work/candidate-source.tar" > "$work/overlay.sha256"
sha256sum "$app/.env.production" "$data/report-store.key" "$data/backup-recipient.pem" \
  "$app/deploy/compose.yaml" > "$work/config.sha256"
adjacent_state > "$work/services-before"

install -m 0444 "$script_dir/release-preservation.mjs" "$work/check.mjs"
preserve() {
  docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 384m --cpus 0.5 --user 0:0 --tmpfs /tmp:rw,nosuid,size=64m \
    --mount "type=bind,source=$work,target=/evidence" "$live_image" \
    node /evidence/check.mjs "$1" "/evidence/$2" /evidence/tables.json
}
snapshot "$work/pre.sqlite"
preserve snapshot pre.sqlite > "$work/snapshot.log" 2>&1 || fail "Record snapshot failed. See $work/snapshot.log"
printf 'Pre-activation backup and record snapshot created.\n'

watch_live=0
printf '%s\n' "$work" > "$sentinel"
activation_started=1
(umask 022 && tar -xpf "$work/candidate-source.tar" -C "$app" --no-same-owner)
if (( runtime_changed )); then
  docker tag "$candidate_image" budgit-budgit
  recreated=1
  "${compose[@]}" up -d --no-build --no-deps --pull never --force-recreate --wait --wait-timeout 120 budgit \
    > "$work/activation.log" 2>&1
  running_image=$candidate_image
  printf 'Activated candidate image.\n'
else
  running_image=$live_image
  printf 'Runtime files are unchanged; keeping the running container.\n'
fi
[[ $(docker inspect --format '{{.Image}} {{.State.Health.Status}}' "$live") == "$running_image healthy" ]] \
  || fail 'Budgit is not running the expected healthy image.'
docker exec "$live" sh -ec "$hash_runtime" > "$work/runtime.running"
cmp "$work/runtime.expected" "$work/runtime.running" || fail 'Running files do not match the candidate.'

curl -fsS --retry 3 --max-time 15 "$origin/api/health" > "$work/health.json"
python3 - "$work/health.json" <<'PY'
import json
import sys
with open(sys.argv[1]) as stream:
    assert json.load(stream) == {'ok': True, 'loginConfigured': True}
PY
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$origin/api/plan") == 401 ]] || fail 'Anonymous /api/plan is not 401.'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{redirect_url}' "$origin/") == "$origin/next" ]] || fail 'Root does not redirect to /next.'
for route in next next/incoming next/upload next/accounts; do
  curl -fsS --max-time 15 "$origin/$route" > "$work/${route//\//-}.html"
  grep -Fq '/auth/google' "$work/${route//\//-}.html" || fail "/$route did not serve the login page."
done
shortcut=public/shortcuts/budgit-incoming.shortcut
if [[ -f $work/source/$shortcut ]]; then
  curl -fsS --max-time 15 "$origin/shortcuts/budgit-incoming.shortcut" > "$work/installer.shortcut"
  cmp "$work/source/$shortcut" "$work/installer.shortcut" || fail 'Served Shortcut differs from the release.'
fi
adjacent_state > "$work/services-after"
cmp "$work/services-before" "$work/services-after" || fail 'Another container changed during activation.'
sha256sum -c --status "$work/config.sha256" "$work/overlay.sha256" "$work/backup.sha256" \
  || fail 'Configuration, keys or evidence changed during activation.'
snapshot "$work/post.sqlite"
preserve verify post.sqlite > "$work/preserved.log" 2>&1 || fail "Stored records changed. See $work/preserved.log"

marker=$(mktemp "$app/.RELEASE.XXXXXX")
printf '%s\n' "$commit" > "$marker"
chmod --reference="$release" "$marker"
trap '' INT TERM HUP
mv -f "$marker" "$release"
activation_started=0
rm -f -- "$sentinel"
trap 'exit 130' INT
trap 'exit 143' TERM
rm -f -- "$work/pre.sqlite" "$work/post.sqlite"
runtime_files=$(wc -l < "$work/runtime.running")
printf 'commit=%s\nprevious=%s\nbuild=%s\nimage=%s\nrollback=%s\nruntime_changed=%s\nruntime_files=%s\nreleased_at=%s\n' \
  "$commit" "$live_commit" "$build" "$running_image" "$live_image" "$runtime_changed" "$runtime_files" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$work/release.txt"
printf 'result=released\n' >> "$work/manifest.txt"
cat "$work/release.txt"
printf 'Released %s (build %s). Previous release %s remains available as %s.\n' \
  "$commit" "$build" "$live_commit" "$rollback_tag"
