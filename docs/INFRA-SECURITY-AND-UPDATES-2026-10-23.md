# Cross-app security audit and maintenance plan

As of 23 October 2026, Asia/Jerusalem. Initial read-only audit, followed by user-authorized implementation. The execution checkpoint below distinguishes completed changes from pending work. Scope: three discovered personal app repositories (Budgit, Parking Between Neighbors, Plant Care), live Hetzner host and its three running containers, GitHub automation/alerts, dependency advisories. This is version/configuration triage, not a penetration test, compromise investigation or exhaustive vulnerability clearance. Archived checkouts are not active deployments.

## Findings and priorities

### 1. Urgent: patch both live Node runtimes

Live Budgit runs Node 24.22.0; Parking runs 24.21.0. Both precede the 21 October security release 24.22.1. Node's official advisory includes high-severity DNS/TLS issues and CVE-2026-111497, a Brotli decoder out-of-bounds write permitting remote code execution. Both runtime inventories include Brotli 1.2.0.

Parking's local source installs express.json before general authentication and on the Telegram webhook before secret validation, with default decompression enabled. The deployed body-parser is 2.3.0 and contains Brotli decompression. This supports a plausible unauthenticated input path, not a demonstrated exploit: deployed app middleware order, edge forwarding behavior and benign compressed-request handling remain to verify. Do not send malicious payloads to production. Budgit's affected runtime is confirmed, but equivalent inbound Brotli reachability was not established.

Action: rebuild both apps against a verified patched Node 24 image (at least 24.22.1, recheck latest supported patch at execution), pin and record digest, run regressions and image scans, then deploy one service at a time with backup/rollback. Restarting an old image or updating Ubuntu alone does not update container Node. Consider disabling compressed request bodies where unused as defense in depth, with tests; do not treat it as a complete runtime patch.

Source: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases

### 2. Urgent investigation: Plant Care Python packages and Home Assistant reach

Local source version 0.13.2 pins python-multipart 0.0.20, httpx2 2.10.0 and Pillow 12.3.0. OSV queried all 16 directly pinned Python/build dependencies plus two Budgit vendor packages; this is not a resolved transitive Python environment scan.

- python-multipart 0.0.20 is in the affected range for multiple advisories. CVE-2026-42561 / GHSA-pp6c-gr5w-3c5g concerns unbounded multipart headers and is fixed in 0.0.27. Other advisories may need a newer release: resolve all findings before selecting the target. Plant Care has FastAPI UploadFile endpoints, so multipart processing is relevant. An arbitrary-file-write advisory additionally requires non-default configuration; do not assume that path is exploitable here.
- httpx2 2.10.0 matches three GHSA advisory records (and duplicate PYSEC aliases). One confirmed high-severity advisory, CVE-2026-84382 / GHSA-8xx6-hgc6-gc2m, concerns response decompression memory amplification, fixed in 2.12.0. Assess all three records and actual remote endpoints/redirect behavior.
- Pillow 12.3.0 produced numerous OSV matches. One reviewed high-severity example, CVE-2026-112390, affects versions below 13.0.0. App photo normalization calls Image.open, but that alone does not prove the particular MIC n_frames path is called. Triage individual decoder paths, fix availability and compatibility; do not present raw advisory count as independent exploitable vulnerabilities. Restrict accepted decoded image formats and enforce resource limits where practical.
- The frontend build stage pins Node 22.18.0, behind the 22.23.4 security release. This is build-stage exposure, not a Node production web server; the final image runs Python/nginx.

The actual Home Assistant installation has NOT been inspected. User confirms SSH exists; host/user/port/key details requested. Source and PR versions are not evidence of installed Pi versions. Check exact app image, Python and transitive libraries, nginx/Alpine, HA Core, Supervisor, OS, protection mode and app auto-update setting.

Plant Care's config explicitly enables homeassistant_api: true, and its client uses SUPERVISOR_TOKEN against supervisor/core/api. Official HA documentation states that this proxy acts as a Home Assistant administrator. A code-execution compromise of the app could therefore abuse the app's existing Core authority without escaping Docker. This is a permission-boundary finding, not proof of compromise or proof a dependency DoS grants code execution.

Positive source controls: apparmor: true, host_network: false, no requested Docker socket, privileged/full_access or elevated hassio_api role. Direct LAN port 8098 is mapped alongside ingress; a comment saying LAN-only does not enforce network isolation. Check actual router/firewall/forwarding and separate LAN authentication. Prefer ingress only when compatible with the user's workflow. Review whether broad Core access is necessary; reducing it may require an architecture change, not just deleting the flag. Never disable protection mode to make auditing easier.

Sources:
- https://github.com/Kludex/python-multipart/security/advisories/GHSA-pp6c-gr5w-3c5g
- https://github.com/advisories/GHSA-8xx6-hgc6-gc2m
- https://github.com/advisories/GHSA-22hg-r758-rrw9
- https://contributors.home-assistant.io/apps/reference/configuration/
- https://contributors.home-assistant.io/apps/guides/security/

### 3. High priority: finish host patch activation and Docker assessment

Live host: Ubuntu 26.04.1, running kernel 7.0.0-34-generic; reboot marker names linux-image-7.0.0-38-generic and linux-base. Marker has existed since 8 October. The host therefore still needs a controlled restart to activate pending changes. Verify installed/bootable kernel and backups before scheduling; do not reboot during an audit.

Docker reports 29.1.3. Upstream 29.x releases since then contain security fixes; 29.9.2 was released 20 October. However, the exact distribution package/build and backported fixes were not obtained. docker-ce is not installed according to apt-cache. Do not assume an old upstream string proves every upstream CVE is unpatched, and do not replace the package source blindly. Inspect docker.io/containerd/runc package revisions, changelogs and Ubuntu notices; then choose a supported patched package route and test both applications after daemon maintenance.

APT metadata was refreshed today. The cached upgrade list includes systemd, networking and other updates; not every pending update is security-related. OpenSSH is 1:10.2p1-2ubuntu3.8 and equals the configured repository candidate. Only ports 22/80/443 were externally bound in the host socket inventory. App ports and Caddy admin 2019 are not publicly published. UFW is active, including public SSH. Provider firewall and external exposure were not independently scanned.

Source: https://docs.docker.com/engine/release-notes/29/

### 4. Other results and limits

Fresh npm lockfile audits (isolated copies; no installs or fixes): Parking zero reported vulnerabilities; Plant frontend zero; Budgit four moderate affected dependency nodes belonging to the same esbuild advisory chain through drizzle-kit. This is a development-tool issue, not four separate runtime vulnerabilities. Budgit's Dockerfile prunes dev dependencies. Avoid npm audit fix --force, which proposes a major/backward drizzle-kit version change; choose a compatible fix and test schema tooling. A clean npm audit does not cover Node, OS libraries or copied vendor bundles.

Bundled PDF.js 6.4.299 had no OSV match. SheetJS 0.20.3 returned two generic npm-package alerts, but reviewed advisories affect <0.19.3 and <0.20.2 respectively. The vendor version is outside those ranges, so these two are not confirmed vulnerabilities; retain checksums and vendor-source records rather than replacing it with the abandoned npm release.

Live Caddy 2.11.7 uses Go 1.26.9 with x/net overridden to 0.60.0. The checked October Caddy hop-by-hop-header advisory affects <=2.11.4 and is fixed in 2.11.5, so this deployment is outside that range. This does not clear all Go dependencies or base-image packages; full fresh image/binary scans remain required.

Sources:
- https://github.com/advisories/GHSA-67mh-4wv8-2f99
- https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- https://github.com/advisories/GHSA-5pgg-2g8v-p4x9
- https://github.com/caddyserver/caddy/security/advisories/GHSA-8qx7-j2v2-x6q5

## Existing automation: verified versus absent

| Area | Observed automation | Gap |
|---|---|---|
| Ubuntu host | Daily apt list refresh and unattended-upgrades enabled for Ubuntu/security origins; today's log records a successful package installation. | Does not patch app images; reboot remains outstanding; regular updates remain pending. Verify failure/reboot alert delivery. |
| Parking repository | Weekly Dependabot for npm, Docker, Compose and Actions; PR/push/weekly checks, tests, production npm audit, fixable high/critical Trivy image scans for app and custom proxy. | Last scheduled successful run was 19 October, before new Node advisories. Seven open Dependabot PRs include Node/proxy updates. Detection/PR creation is not deployment. |
| Server inventory | Weekly parking-software-inventory timer; last execution succeeded. Script records Ubuntu, Docker, Compose, Caddy, Alpine and rclone versions. | It neither patches nor scans vulnerabilities and omits app Node/Python versions. |
| Budgit repository | GitHub API returned no Actions runs and explicitly reported Dependabot alerts disabled. | Add dependency alerts, scheduled CI/scans and update PRs. |
| Plant repository | Push/PR CI checks/tests/builds both architectures and runs frontend npm audit. Recent PR #1 passes; latest observed push run failed. | No scheduled workflow in inspected source, no Python advisory audit or image scan there; Dependabot alerts explicitly disabled. PR success is not a merged or installed fix. |
| Backups | Parking daily backup and monthly recovery-drill timers exist. | These are recovery processes, not update processes; audit success/offsite recovery coverage separately before maintenance. |
| Codex | No automation.toml found in the local automation directory. | No local Codex security monitor established by this check. No new automation created. |

GitHub evidence: Parking scheduled run https://github.com/Shandowww/parking-between-neighbors/actions/runs/39271949138 ; Plant candidate https://github.com/Shandowww/plant-care/pull/1 . That table records the initial audit. See the execution checkpoint for changes made afterward.

## Implementation sequence

- [x] **First: patch internet-facing Node runtimes.** Preserve existing code changes; verify versions/digests, backup each SQLite database, build and scan candidates, run each project's regression suite, deploy individually, verify runtime versions, login/access boundaries, health, persistence and rollback. Do this before releasing the new report Shortcut.
- [ ] **Plant runtime audit and fixes.** Obtain existing SSH details without passwords in chat. Read only version/permission fields; never dump app options or tokens. Resolve complete Python dependency graph and scan final amd64/aarch64 images. Triage and patch multipart/httpx2/Pillow; update build Node. Test photo ingestion, HEIF/JPEG/PNG behavior, auth, ingress, HA calls and database compatibility. Separate source commit, CI pass, app release and actual HA installation evidence.
- [ ] **HA containment.** Verify protection mode, API scopes and LAN port/auth exposure. Keep app private; reduce permissions where possible without silently breaking features. Document residual Core administrator access and why it is required. Capture HA Core/Supervisor/OS/add-on update settings and recovery status.
- [ ] **Host maintenance.** Resolve Docker packaging/backports, containerd/runc and OS CVEs; verify off-host backups and host recovery access. Prepare a maintenance window for package/daemon updates and reboot. Verify both apps, Caddy certificate routing and new running kernel afterward. Never restart all services blindly.
- [ ] **Continuous detection for all three apps.** Enable GitHub dependency alerts and compatible security-update PRs; add weekly routine update PRs. Add daily advisory scans and PR checks for npm production and development dependencies separately, full Python dependencies, image OS/runtime packages and custom Caddy Go dependencies. Cover vendor parsers with version/checksum/advisory mapping. Record unfixed findings too, even if the deploy gate focuses on fixable high/critical issues. Use time-limited, documented exceptions for unreachable findings.
- [ ] **Close the detection-to-deployment gap.** Record current source commit, image digest and actual live runtime per app; compare them with approved releases. A merged dependency PR or healthy container must not count as a deployed security patch. Include a re-scan even when source has not changed.
- [ ] **Alerts and cadence.** Notify Tal of new actionable high/critical exposure, failed or stale scans, failed patch jobs and reboot-required state; stay quiet when unchanged. Select an existing authorized notification channel during implementation, rather than adding a new background service. Proposed targets: triage internet-facing high/critical findings the same day, patch verified reachable ones within 24–48 hours where feasible, weekly routine patches, monthly host/HA maintenance and recovery review. These are targets, not guarantees.
- [ ] **Safe updates.** Retain unattended Ubuntu security updates; use tested PRs and staged image rebuilds for application updates, not blind container auto-replacement. Pin production images by digest and refresh the pins through reviewed PRs. Use existing GitHub/host resources, with no paid upgrades. Plan explicit downtime for host/HA restarts. Verify backup success and restore capability, not just timer existence.

## Model choice

Use **GPT-6 Astra, High** for the first cross-app remediation and containment review: it spans request reachability, Python image decoders, HA administrator capability, distro backports and shared-server rollback. This is a judgment, not a requirement or benchmark guarantee. Use **GPT-6.1 Sol, Medium/High** for subsequent routine dependency PRs and bounded maintenance. Deterministic scanners and ordinary scheduled checks should do ongoing detection; an AI model is not needed for every daily scan. No model setting was changed by this audit.

Official capability reference: https://developers.openai.com/api/docs/models/gpt-6-astra

## Historical audit interruption

Access update, 23 October: Tal confirmed Home Assistant SSH is reachable only from the home network, and he will be home on 24 October. Defer the installed HA/app version and permission checks until local access is available. Do not expose SSH publicly or create a tunnel to bypass this boundary. The confirmed Hetzner runtime patches and source-level dependency/automation work are independent of this delay. No reminder or automatic retry has been scheduled.

An earlier SSH call was blocked by an automatic approval-review usage limit; this was a review-service failure, not a safety determination. Work subsequently resumed through normal approval. The later execution checkpoints supersede that interruption and the initial uncompleted scanner list. Installed Home Assistant evidence and full host advisory triage remain open; no claim of compromise or complete safety is made.

Raw npm, OSV and GitHub audit evidence was saved locally under /tmp/tal-security-audit-20261023; temporary files are not durable audit storage. This document preserves the substantive results and sources without personal report contents or credentials.

## Execution checkpoint — 23 October 2026

### Completed and verified

- **Budgit deployed:** source `05d2fae8f7598e7223123f403705cd4900499b90`, Node **24.22.1**, image `sha256:d0aea5fbe5a58237998ffccfdd898daa051fcaf295c436ae496e4bdf94303708`. This candidate changes only runtime/security automation from the previously live `b09194b`; the newer incoming-transfer feature remains outside this production deployment. Built `dist/index.html` SHA-256: `b467308d4b0e51c8d3cf4021c13dc62c77abed56a518d60b08318dc5f3247c09`.
- A fresh WAL-consistent SQLite backup passed integrity validation. Candidate financial preflight, synthetic account/access isolation, revision conflicts, revocation and restored HTTP-server checks all passed using disposable copies with no network. Health and HTTPS were verified after replacement; anonymous `/api/plan` returned 401. Rollback image retained as `budgit-rollback:b09194b-security-20261023`. The first recovery attempt lacked permission to read the private backup; rerunning as its existing UID 1000 passed without weakening file permissions.
- Budgit [PR #1](https://github.com/Shandowww/monthly-flow-budget/pull/1) merged; [candidate CI](https://github.com/Shandowww/monthly-flow-budget/actions/runs/39985415745) passed tests, dependency audit gates and image scans. Removed unused npm/Yarn runtime tooling to eliminate vulnerabilities in their bundled packages. Canonical checkout fast-forwarded to merged `6bf01d1`, preserving unrelated local edits.
- GitHub vulnerability alerts and automated security-update proposals enabled for Budgit and Plant Care. Budgit default branch now follows the existing canonical release branch `codex/hetzner-google`, enabling the new daily checks and weekly Dependabot configuration to cover current source. Parking [PR #12](https://github.com/Shandowww/parking-between-neighbors/pull/12) merged, including daily scans. Both workflows report active; actual scheduled execution and notification delivery still need observation.
- Parking candidate `3858584048abfb5ba109b613003666cd4d216a9a` passed [app and proxy CI](https://github.com/Shandowww/parking-between-neighbors/actions/runs/39985463566). Node pinned to 24.22.1. Proxy remains Caddy 2.11.7, rebuilt using Go 1.26.10 because a fresh scan flagged Go 1.26.9 (`CVE-2026-111943`). Existing x/net 0.60.0 override retained.
- Parking off-server recovery evidence: verified OneDrive backup **2026-10-23T00:00:31Z**, corresponding pre-release revision `9ca9b33a386527cf0560faf32ec579d08d847ea6`; this snapshot predates subsequent writes. Reused per project policy.
- Exact installed host packages now confirmed: Docker `29.1.3-0ubuntu4.1`, containerd `2.2.2-0ubuntu1.1`, runc `1.4.0-0ubuntu1`; all equal configured APT candidates. Package changelogs confirm Docker BuildKit CVE-2026-33747/33748 backports and multiple containerd fixes. This is **not complete CVE clearance**. Installed Ubuntu `docker-buildx` only to build the patched proxy; Docker daemon was not restarted by this operation.

### Remaining execution

- Parking app deployed at `3858584`, Node 24.22.1, image `sha256:417be20f92a366f1bd56f1badf329695808644230a970ae439a4689416bd713b`. Health passed and anonymous `/api/spots` returned 401. The proxy deployment is now complete; see the 24 October checkpoint below.
- Plant Care [PR #2](https://github.com/Shandowww/plant-care/pull/2) prepares version **0.13.3**, candidate `a105396`: multipart 0.0.32, httpx2 2.16.0, Pillow 13.0.0, pillow-heif 1.8.1, restricted supported photo decoders, Node 22.23.4 build stage, daily CI and weekly update PRs. Backend/frontend tests and resolved production Python audit passed earlier candidates. Final amd64/aarch64 image scans and production startup/LAN-header-isolation checks passed in run 40021764332. New image checks identified old OpenSSL/libuuid and pip-vendored libraries; OS upgrades and removal of unused runtime pip/ensurepip bundles are included. PR #2 merged after all checks passed; installation on the actual Home Assistant device is still pending.
- Installed Home Assistant/app checks and installation remain deferred until home-LAN access is available. No claim is made about the Pi's installed versions.
- Review remaining distro advisories, prepare and confirm a host maintenance window/recovery access, then activate the pending kernel through a controlled reboot and verify all apps. Do not switch Docker package providers solely because upstream version numbers differ.
- Daily checks create detection, not automatic deployment. Verify GitHub notification delivery to Tal, add stale-scan/reboot monitoring through an existing approved channel, and track deployed image/source versions separately from merged source. Vendor-parser checks and the moderate Budgit development-tool advisory remain open.

Execution evidence is in GitHub PR/check links and server `/opt/security-release-20261023/`. Temporary build clones are under `/tmp/tal-security-release-20261023/`. No private financial data or credentials were copied into the audit document.

Host follow-up evidence: running Docker was built with Go **1.24.13**. Ubuntu's [CVE-2026-111943 tracker](https://ubuntu.com/security/CVE-2026-111943) still marks Go packages for 26.04 as needing evaluation; current APT candidates are not a complete clearance. For [runc CVE-2026-41579](https://ubuntu.com/security/CVE-2026-41579), Ubuntu describes the malicious-image issue as not exploitable under Docker, while the distro package status remains under evaluation. Keep that distinction in maintenance triage. Both old/new kernels are present in `/boot`; the reboot marker names 7.0.0-38.

## Execution checkpoint — 24 October 2026

- **Shared HTTPS proxy deployed** from candidate `3858584`: Caddy 2.11.7, Go 1.26.10, retained x/net override. Image `sha256:873e34c1b6728d03ee4ab5f9b209b8ca5312d7401832454f7c193960396da19a`. Validated against the existing Caddyfile before replacement; original routes/certificate volumes retained. Both public health endpoints passed and both private API probes returned 401. Previous proxy image retained as `parking-proxy-rollback:20261023`; inventory refresh completed.
- A new Parking backup was required because the local calendar date changed before proxy deployment. Existing backup job completed and verified its OneDrive copy at **2026-10-23T23:23:37Z (24 October, 02:23 Israel)**. Matching recovery source is `3858584048abfb5ba109b613003666cd4d216a9a`; matching app image is the deployed `417be20f…` recorded above. No backup contents were printed.
- **Plant Care 0.13.3 source release published:** PR #2 merged to `main` as `92a41267e93a09cd7297c10e8ea016f6a55b6fbd`, following [passing candidate CI](https://github.com/Shandowww/plant-care/actions/runs/40021764332). Backend/frontend checks, full resolved production Python audit, both architecture image scans, fresh temporary-database migrations/startup, frontend serving and forged-LAN-header denial all passed. Actual Home Assistant installation is not verified or performed.
- All three repositories now have merged daily security workflows and weekly update proposals. Budgit and Plant Care automated security fixes report enabled/unpaused. The workflows detect/report findings; they do not auto-deploy. Daily scheduled-run freshness and delivery of GitHub alerts to Tal still need observation.
- Asked for Home Assistant connection details when back on the home LAN, and for a roughly five-minute server restart window plus confirmation of Hetzner console recovery access. Neither the current date nor silence implies permission to restart or proof of LAN availability.

### Concrete next actions

1. With home-LAN SSH details: inventory HA Core/Supervisor/OS/Plant Care and update settings, verify a current backup, install 0.13.3, then verify ingress/LAN authentication, photos, HA sensor access and persistence. Retain protection mode.
2. With a confirmed maintenance window and Hetzner recovery access: refresh package metadata, reassess outstanding host patches and distribution CVEs, verify a current off-host backup, apply the appropriate supported updates, reboot into the installed patched kernel and verify SSH, UFW, all three containers, HTTPS routing and scheduled jobs. Retain existing package sources unless a justified migration is separately reviewed.
3. Verify scheduled scan/alert delivery, address the remaining moderate development-tool and vendor-parser audit gaps, and extend the existing inventory to include actual deployed source/image/runtime and reboot state. No new paid resource or background service is required.
4. The urgent live Node prerequisite for the report Share Shortcut is complete. Continue its separate plan with synthetic native tests and explicit iPhone acceptance; no Share Shortcut has been implemented by this security release.

## Approved server restart — completed 24 October 2026

Tal approved an immediate maintenance window and confirmed Hetzner console access. Before restarting, verified that kernel and initramfs 7.0.0-38 were present with a GRUB entry; checked Docker/SSH/UFW and disk space; created another verified WAL-consistent Budgit backup. Parking's verified off-server backup from the current local day was reused. No Docker package-provider migration or broad package upgrade was performed as part of this restart.

The server rebooted successfully from **7.0.0-34-generic to 7.0.0-38-generic**. Boot ID changed from `209a716c-af91-4cec-acb7-6fd99ed32ba0` to `5eec04ac-b845-4019-a954-e864302fae32`. Follow-up observed approximately eight hours of uptime, both application containers healthy, the proxy running, SSH/Docker/UFW active, zero failed system units and no reboot-required marker. Both public HTTPS health endpoints returned success. Existing backup, recovery-drill, inventory and unattended-update timers remained scheduled.

Home Assistant remains pending: Tal currently uses username/password SSH and will try to configure key access. No password/private key requested or collected, no connection attempted, and no Pi installation claimed.

Daily security workflow execution is still an observation gap: at this follow-up, GitHub listed no scheduled runs yet for Budgit or Plant Care; Parking's latest returned scheduled run was still 19 October. The workflows are merged and active, and release CI passed, but do not claim that the new daily cadence or alert delivery has been demonstrated. Investigate if runs remain absent after the next scheduled window.

Remaining host work is distribution-advisory/package review and notification coverage; the previously pending kernel restart is complete.


## Maintenance completion checkpoint — 24 October, evening

- Budgit [PR #2](https://github.com/Shandowww/monthly-flow-budget/pull/2) merged as `031243a`. The targeted esbuild override resolves the moderate development-tool advisory without changing production dependencies; generated migration SQL matches the baseline. Full CI and image scan passed. Daily checks now gate moderate development findings and audit the separately bundled SheetJS/PDF.js bytes against OSV. Exact reviewed CDN/npm advisory mismatches expire on 24 November. No production restart was needed for these development/CI changes.
- Fresh Parking scans found body-parser CVE-2026-111181 and proxy Brotli CVE-2026-111497. [PR #13](https://github.com/Shandowww/parking-between-neighbors/pull/13), tested candidate `7c18bf624773d2118ca15375cc74758b7e2d4b33`, merged and deployed. Running body-parser is **2.4.0**, Brotli **1.2.1-r0**. Both exact-candidate jobs and merged-source checks passed. Today's verified OneDrive backup at `2026-10-24T00:00:53Z` was reused; its recovery app revision is `3858584`, predating this release. Existing Caddy routing was compared byte-for-byte and preserved. Rollbacks: `parking-rollback:3858584-maintenance-20261024` and `parking-proxy-rollback:go12610-20261024`.
- Running Parking image: `sha256:2a143fdc236cb0f762bc87c3d92e1559e1014d399b422758ad6342c80b25bee8`; proxy: `sha256:fd0ef0330549a2058b2e2fb6e54a3d518bd4b2ef98643ba4b84c33236d428f52`. Budgit remains the previously recorded security release. Both health endpoints succeed; Budgit `/api/plan` and Parking `/api/parking-requests` return 401 without authentication.
- Existing inventory now runs **daily at 07:00 Asia/Jerusalem** and records running image IDs/runtime versions, host kernel/package revisions and reboot marker. It contains no environment variables or credentials. This records state; it is not an additional alert channel.
- Installed host zlib security patch `1:1.3.dfsg+really1.3.1-1ubuntu3.2` (CVE-2026-85091). Supervised service restarts and systemd re-execution activated it. `needrestart` subsequently listed no services needing restart. SSH, networking, DNS, firewall and Docker remained active; both application containers healthy. Kernel remains `7.0.0-38-generic`.
- **Actual scheduled execution confirmed** on 24 October: [Budgit](https://github.com/Shandowww/monthly-flow-budget/actions/runs/40087679541), [Plant Care](https://github.com/Shandowww/plant-care/actions/runs/40090540943), and [Parking](https://github.com/Shandowww/parking-between-neighbors/actions/runs/40092309105). The first two passed; Parking detected the now-fixed findings. Scheduled starts were several hours later than their nominal times, so freshness monitoring must allow GitHub scheduling delays.
- **Email delivery confirmed by Tal**, with screenshots of 23 October failure notifications. These prove the GitHub Actions notification channel reaches him; the screenshots are earlier candidate failures, not current release failures. Current merged-source checks pass for all three apps. This does not prove every future notification or individual security-advisory email is delivered.

### Remaining limits and follow-up

- Home Assistant installed versions, backup and Plant Care 0.13.3 installation still require home-LAN access.
- Host Docker/containerd advisories remain under distribution review. Docker uses only `moby`/`moby_history`; no Kubernetes workloads or CRIU executable were observed. containerd's socket is root-only and its TCP API is disabled. CRI plugins are loaded, but checkpoint restore is not used. Do not label the host completely vulnerability-free or migrate package providers automatically. The newer phased containerd distro revision addresses a sandbox cleanup issue, not all newer upstream advisories. Continue trusted-image-only deployment and review supported security updates.
- The cloud-init hotplug hook failed on a transient Docker virtual interface (`/devices/virtual/net/veth…`) during container replacement; the same failure existed before this release. Its socket remains active and application/host networking is healthy. A phased cloud-init 26.2 update is available; inspect its specific hotplug fixes before installation. Do not disable cloud networking or hide the failed status as a substitute for repair.
- Daily scans detect findings and weekly Dependabot updates propose changes; app deployments still require testing, backup/rollback and verification. Monitoring a missed scan independently is still a follow-up, not implemented by the inventory timer.
- Git operations now use the existing `github-personal` SSH key alias; the preference is saved in the global AGENTS.md. GitHub API inspection uses the existing CLI login, without a vault password.
