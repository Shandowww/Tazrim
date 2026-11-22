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

## What remains for automatic deployment

Before enabling deployment on merges to `main`, automate the existing [Budgit release procedure](README.md#data-backups-and-release-boundary). It needs a fresh verified SQLite backup, a build and isolated financial and access checks against the approved commit, and a tested rollback image. After activating only Budgit, verify the running build, health and unauthenticated `/api/plan` response (`401`) before recording the version and commit in `/opt/budgit/RELEASE`. The preflight key can stay scoped to its current check.
