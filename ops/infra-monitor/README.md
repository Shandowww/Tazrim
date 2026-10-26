# Infrastructure dashboard implementation

Source for the lightweight Hetzner collector and Home Assistant dashboard. The [plan](../../docs/HOME-ASSISTANT-INFRA-DASHBOARD-PLAN-2026-10-25.md) explains scope, signals, thresholds and acceptance criteria.

## Current rollout (25 October 2026)

- Hetzner: `infra-monitor.timer` and `infra-monitor.service` are active. The collector writes a fresh JSON snapshot to `/opt/infra-monitor/status/status.json` and bounded seven-day minute history to `/opt/infra-monitor/history/`. It samples CPU, memory, swap, root disk, default-route network and physical disk throughput, and reads allowlisted container/job/version/backup status. `Result=success` and a populated CPU peak were observed.
- Existing Caddy: `/infra-monitor/status.json` under `budgit.duckdns.org` is protected by a dedicated Argon2id HTTP Basic credential. An anonymous request returned 401; the credential returned a timestamped JSON snapshot. Budgit and Parking health endpoints passed after proxy recreation. Original Caddyfile and compose copies are retained as `*.before-infra-monitor` in `/opt/park80/`.
- Home Assistant: the package is installed at `/config/packages/infra_monitor.yaml`. Four monitoring sections are installed in **Overview → My-Dev-Apps** through the Lovelace WebSocket API. The existing Codex section was preserved; two backups of the prior Overview config are in `/config/infra-monitor/`. The temporary separate sidebar dashboard was removed. Home Assistant passed `ha core check` and restarted successfully.
- GitHub: a dedicated fine-grained token, entered directly in HA, reads Budgit and Parking private scheduled workflow runs. Plant Care is public. All three scheduled scan sensors returned `success` after the restart, and scan attention is enabled. The token is not in this repository.
- TLS: the server collector checks both public certificates every 12 hours and reports validity and expiry; both were valid in the first live snapshot.
- The dashboard references 47 HA entities; all were present after correcting the Raspberry Pi temperature sensor to `sensor.system_monitor_processor_temperature`. The resource graphs start with installation and need time to fill. The installed Plant Care app remains Tal's update responsibility.
- The infrastructure cards and their persistent notifications use English, matching Tal's Home Assistant interface. The installer also recognises and replaces the original Hebrew monitoring sections without changing other My-Dev-Apps cards.

## Server files and recovery

The Python sampler is intentionally separate from the application containers. It does not open a port, mutate app data, read app credentials or expose the Docker socket to the proxy. The only exposed data is its sanitized `status.json`, mounted read-only in the Caddy container.

`prepare-route.py` stages a config with a new credential in `/opt/infra-monitor/status-password` (mode 600), verifies Caddy syntax and Compose config, and leaves the running proxy unchanged. `activate-route.py` compares the live base hashes, saves original config, starts only the Caddy service and checks both app health endpoints plus 401/200 monitoring authentication. On a failed check it restores the original files and restarts the original Caddy service. Caddy must specify `basic_auth argon2id` to match the generated hash.

To remove server monitoring: first restore `/opt/park80/Caddyfile.before-infra-monitor` and `/opt/park80/compose.yaml.before-infra-monitor`, then recreate only the Caddy service and verify both HTTPS apps. Disable `infra-monitor.timer` if data collection is no longer wanted. Keep the source of the password private; do not paste it into chat or commit it.

## Home Assistant operation and recovery

`infra_monitor_password` and `infra_github_auth_header` live only in HA's `/config/secrets.yaml`. The GitHub token needs **Actions: read** on Budgit and Parking; GitHub automatically includes **Metadata: read**. Never copy the broad local `gh` credential into HA or paste either secret into chat.

To update the cards, copy `home-assistant/dashboard.yaml` to `/config/infra-monitor/dashboard.yaml` and run `python3 /config/infra-monitor/install-my-dev-apps.py --apply` from the HA SSH app. The script uses the Home Assistant WebSocket API, replaces only sections marked `Infrastructure · ` (or the original Hebrew marker), and creates a private Overview backup before saving. Running without `--apply` shows a dry-run section count. The view is visible only to the existing user configured on My-Dev-Apps; any future change to its visibility should be reviewed in HA.

To update sensors or rules, copy `home-assistant/infra_monitor.yaml` to `/config/packages/infra_monitor.yaml`, run `ha core check`, then restart HA Core. Read the three `sensor.infra_*_scan` states and `binary_sensor.infra_scan_attention` afterward. A new GitHub token also requires a Core restart because `!secret` values are loaded at startup. The snapshot sensor fetches every minute; GitHub scan sensors fetch every 30 minutes.

The package currently treats scans older than 48 hours or failed as needing attention and marks server data stale after five minutes. Alerts appear as HA persistent notifications. Mobile push delivery, alert recovery messages, external HA outage detection and 14-day Recorder retention have **not** been enabled or verified. The graphs show seven days when that much data exists. Review the Pi's Recorder growth after a week before extending retention. A dashboard inside HA cannot warn while HA itself is offline.

Before installation, HA backup `17850e55` was created. To roll back the UI, restore one of the private `lovelace-overview-before-infra-*.json` configurations through the Lovelace WebSocket API or edit the Overview dashboard in HA. To remove the sensors, move `/config/packages/infra_monitor.yaml` out of the packages directory, check configuration, and restart Core. On the server, use the Caddy rollback copies described above and disable the timer if retiring monitoring altogether.
