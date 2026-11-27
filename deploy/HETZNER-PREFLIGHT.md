# Budgit release preflight from Hetzner

GitHub Actions runs the build, tests and security checks without connecting to Hetzner. The separate preflight runs on Hetzner and confirms that the server can read the exact validated `main` commit from GitHub. It reads one Git ref without access to Docker, production credentials or the database. It does not deploy Budgit.

## 1. Set up the restricted Hetzner account

Upload the reviewed `deploy/hetzner-preflight.sh` using the existing administrator SSH login. On Hetzner, run the following as root for a new account, substituting the path where you uploaded the script.

```sh
useradd --system --user-group --no-create-home --home-dir /var/lib/budgit-preflight --shell /bin/sh budgit-preflight
test "$(id -u budgit-preflight)" != "$(stat -c %u /opt/budgit/data)"
test "$(id -g budgit-preflight)" != "$(stat -c %g /opt/budgit/data)"
runuser -u budgit-preflight -- sh -c 'test ! -x /opt/budgit/data && test ! -r /opt/budgit/.env.production && test ! -w /var/run/docker.sock'
install -d -o root -g root -m 0755 /var/lib/budgit-preflight /var/lib/budgit-preflight/.ssh
install -o root -g root -m 0755 /root/hetzner-preflight.sh /usr/local/bin/budgit-hetzner-preflight
```

Run these commands as a batch with `set -e` so a failed permissions check stops setup. Leave the account password locked and its home directory and installed command owned by root.

## 2. Give Hetzner read-only access to GitHub

On Hetzner, generate a dedicated key and let only `budgit-preflight` read its private half.

```sh
ssh-keygen -t ed25519 -N '' -C budgit-hetzner-github-read -f /var/lib/budgit-preflight/.ssh/github-read
chown budgit-preflight:budgit-preflight /var/lib/budgit-preflight/.ssh/github-read
chmod 0600 /var/lib/budgit-preflight/.ssh/github-read
```

In `Shandowww/monthly-flow-budget` open **Settings → Deploy keys → Add deploy key**. Paste `github-read.pub` and leave **Allow write access** unchecked. Copy the official `github.com ssh-ed25519 ...` known-hosts entry from [GitHub's SSH key fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) into the root-owned `/var/lib/budgit-preflight/.ssh/github_known_hosts` file with mode `0644`.

## 3. Verify the CI-validated commit from Hetzner

Find the successful **Security and release checks** push run for `main` in GitHub Actions and copy its full commit SHA. In an existing trusted administrator shell on Hetzner, run:

```sh
commit='<full commit SHA from the successful main push run>'
runuser -u budgit-preflight -- env SSH_ORIGINAL_COMMAND="check $commit" /usr/local/bin/budgit-hetzner-preflight
```

Success prints `Hetzner verified GitHub main at <full SHA>`. If `main` advanced, wait for its new push run and verify that commit instead. This check does not replace the release backup, candidate and rollback gates.

The retired Actions SSH job is not needed. After switching, the administrator can remove its dedicated inbound authorized key and Actions environment secret and variable. Keep the separate read-only GitHub deploy key; do not broaden SSH access for GitHub-hosted runners.

## Rehearse a release from Hetzner

The [dry-run runner](hetzner-release.sh) uses outbound GitHub access with the `budgit-preflight` deploy key and pinned GitHub host key from steps 1 and 2. Run it through your trusted administrator SSH connection. It never activates a release.

Stage `hetzner-release.sh`, `verify-github-validation.py`, `release-gates.mjs`, and an executable `trivy` together in a private root-owned directory on Hetzner, such as `/root/budgit-release-review`. Obtain Trivy from a trusted upstream release and verify its published checksum before staging. Run the following from your workstation in Bash with a fine-grained token scoped to `Shandowww/monthly-flow-budget` with **Actions: Read**. Set `budgit_hetzner_host` to your trusted Hetzner hostname or SSH alias before running the example. The prompt hides typing and the token travels through SSH standard input.

```bash
(
  set +x
  read -r -s -p 'GitHub Actions read token: ' budgit_actions_token
  printf '\n' >&2
  printf '%s\n' "$budgit_actions_token" |
    ssh -T "root@${budgit_hetzner_host}" 'bash /root/budgit-release-review/hetzner-release.sh --dry-run'
)
```

The runner fetches `main`, requires successful Security and release checks for the exact push SHA, then builds that source. Before running the candidate or reading budget data, Trivy scans the immutable local Docker image ID with a fresh run-local cache. The full report is retained, and the current CI severity and fixability policy (high/critical, ignoring unfixed vulnerabilities) is enforced. Scanner errors and policy failures stop the rehearsal; neither the CI image scan nor a remote image can substitute for this check.

After the scan passes, the runner makes a consistent SQLite snapshot and checks database integrity, financial behavior, access controls, and report decryption. After the candidate exits, the host validates its rollback output and copies it to a separate root-owned file outside the candidate-writeable mount. The deployed image receives only that copy through a read-only bind, and its checksum is checked again after the rollback gates. The rehearsal checks the live release marker and the running Budgit and parking containers before and after the drill.

Each run prints its private evidence directory under `/opt/budgit-releases`. `manifest.txt` identifies a successful run, including the candidate SHA, image and rollback tag. Gate logs and database copies in that directory contain private operational data. Keep the directory restricted to administrators and remove obsolete run directories and their associated `budgit-dry-run` and `budgit-rollback` image tags when no longer needed. The runner exits nonzero on a failed gate and prints the corresponding log path.

## Automatic releases

Merging to `main` is the release approval. When enabled, `budgit-autodeploy.timer` runs [hetzner-autodeploy.sh](hetzner-autodeploy.sh) every five minutes. When GitHub `main` differs from `/opt/budgit/RELEASE`, it runs `hetzner-release.sh --deploy`, which performs the full rehearsal above and then activates the release:

- It refuses a `main` that does not descend from the live release (for example after a force-push), and a change to `deploy/compose.yaml`. Release those under supervision.
- It compares the candidate's runtime files (`dist`, `server`, `drizzle`) with the running container. Builds are reproducible, so documentation-only commits only update the source tree and release marker without restarting Budgit.
- Otherwise it retags `budgit-budgit` to the scanned candidate and recreates only the Budgit service. It then checks the running image, health, matching runtime files, the anonymous `401` on `/api/plan`, the root redirect, login pages on deep routes and the served Shortcut. It also checks that the other containers, configuration and keys are unchanged and that all authoritative records were preserved.
- On any failure it restores the previous image and source files and keeps the previous release marker. The database is never restored or overwritten. A concurrent edit during activation can fail the record check and cause a safe rollback; the next run retries.

The wrapper waits without counting an attempt while CI is still running (runner exit 75). After three failed attempts on one commit it stops until `main` advances. While an activation is in progress the runner keeps `/opt/budgit-releases/ACTIVATION-IN-PROGRESS`. It is removed after a release or a verified rollback. If it remains (for example after a power loss or a failed rollback), every later run and rehearsal refuses to start until an administrator has checked production and removed it. A rollback that cannot be verified also pauses automatic releases (`/var/lib/budgit-autodeploy/paused`). A busy lock (for example a manual rehearsal) counts as "try later", not as a failed attempt. The latest result is in `/var/lib/budgit-autodeploy/status.json`, and `journalctl -u budgit-autodeploy` has the full log. The wrapper keeps the five newest `auto-*` evidence directories and their image tags.

### Install

Use your trusted administrator connection. Install the runner files and a verified Trivy executable root-owned, then store a fine-grained token with **Actions: Read** on `Shandowww/monthly-flow-budget` and enable the timer:

```sh
install -d -m 0700 /usr/local/lib/budgit-release /etc/budgit-release
install -m 0700 hetzner-release.sh hetzner-autodeploy.sh trivy /usr/local/lib/budgit-release/
install -m 0600 verify-github-validation.py release-gates.mjs release-preservation.mjs /usr/local/lib/budgit-release/
install -m 0600 /dev/stdin /etc/budgit-release/actions-token   # paste the token, then Ctrl-D
install -m 0644 systemd/budgit-autodeploy.service systemd/budgit-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now budgit-autodeploy.timer
```

The installed runner does not update itself. After a change to these files is merged, reinstall them the same way. Pause with `touch /var/lib/budgit-autodeploy/paused`; resume by removing it. Replace the token before it expires.

For the release that retires the original layout, install the reviewed `release-gates.mjs` before merging. The new gate verifies Tazrim entry on the candidate and still tests the preceding image as a rollback target.

Version tags remain manual: after a functional release, tag the released commit with the next `vMAJOR.MINOR.PATCH` and record it as before.
