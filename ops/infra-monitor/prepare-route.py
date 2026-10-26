#!/usr/bin/env python3
"""Stage a protected Caddy status route without changing running services."""

import os
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import sys

PARKING = Path("/opt/park80")
MONITOR = Path("/opt/infra-monitor")
SECRET = MONITOR / "status-password"
STAGING = MONITOR / "staging"
MOUNT = "      - /opt/infra-monitor/status:/srv/infra-monitor:ro"


def one_replace(source, old, new):
    if source.count(old) != 1:
        raise RuntimeError(f"expected exactly one occurrence of {old!r}")
    return source.replace(old, new, 1)


def main():
    caddy = (PARKING / "Caddyfile").read_text()
    compose = (PARKING / "compose.yaml").read_text()
    original_hashes = {
        "Caddyfile": hashlib.sha256(caddy.encode()).hexdigest(),
        "compose.yaml": hashlib.sha256(compose.encode()).hexdigest(),
    }
    if "infra-monitor/status.json" in caddy or MOUNT in compose:
        raise RuntimeError("monitoring route already exists; inspect live configuration")
    if not SECRET.exists():
        with os.fdopen(os.open(SECRET, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as output:
            output.write(secrets.token_urlsafe(36) + "\n")
    password = SECRET.read_text().strip()
    hashed = subprocess.run(
        ["docker", "exec", "-i", "park80-caddy-1", "sh", "-c",
         'IFS= read -r password; exec caddy hash-password --algorithm argon2id --plaintext "$password"'],
        input=password + "\n", text=True, capture_output=True, timeout=20, check=True,
    ).stdout.strip()
    if not hashed.startswith("$argon2id$"):
        raise RuntimeError("unexpected Caddy password hash")

    old = "budgit.duckdns.org {\n    encode zstd gzip\n    reverse_proxy budgit:3001\n}"
    new = f"""budgit.duckdns.org {{
    encode zstd gzip
    handle /infra-monitor/status.json {{
        basic_auth argon2id {{
            infra_monitor {hashed}
        }}
        root * /srv/infra-monitor
        rewrite * /status.json
        header Cache-Control \"no-store\"
        file_server
    }}
    handle {{
        reverse_proxy budgit:3001
    }}
}}"""
    caddy = one_replace(caddy, old, new)
    compose = one_replace(compose, "      - ./Caddyfile:/etc/caddy/Caddyfile:ro", "      - ./Caddyfile:/etc/caddy/Caddyfile:ro\n" + MOUNT)
    STAGING.mkdir(mode=0o700, parents=True, exist_ok=True)
    (STAGING / "Caddyfile").write_text(caddy)
    (STAGING / "compose.yaml").write_text(compose)
    (STAGING / "base-hashes.json").write_text(json.dumps(original_hashes))
    subprocess.run([
        "docker", "run", "--rm", "--network", "none", "-e", "APP_DOMAIN=park80.duckdns.org",
        "-v", f"{STAGING / 'Caddyfile'}:/etc/caddy/Caddyfile:ro", "park80-caddy",
        "caddy", "validate", "--config", "/etc/caddy/Caddyfile",
    ], check=True, capture_output=True, text=True, timeout=30)
    subprocess.run([
        "docker", "compose", "--project-directory", str(PARKING), "-p", "park80",
        "-f", str(STAGING / "compose.yaml"), "config", "--quiet",
    ], check=True, capture_output=True, text=True, timeout=20, cwd=PARKING)
    print("Protected route and compose candidates staged and validated; running proxy unchanged.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Route preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
