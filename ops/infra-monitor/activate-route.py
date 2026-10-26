#!/usr/bin/env python3
"""Activate a staged monitoring route with rollback on failed checks."""

import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

PARKING = Path("/opt/park80")
STAGING = Path("/opt/infra-monitor/staging")
SECRET = Path("/opt/infra-monitor/status-password")


def compose():
    subprocess.run(["docker", "compose", "-p", "park80", "-f", str(PARKING / "compose.yaml"),
                    "up", "-d", "--no-deps", "--no-build", "caddy"], check=True,
                   capture_output=True, text=True, timeout=90, cwd=PARKING)


def check_once(url, expected, auth=False):
    headers = {}
    if auth:
        token = base64.b64encode(("infra_monitor:" + SECRET.read_text().strip()).encode()).decode()
        headers["Authorization"] = "Basic " + token
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            status, body = response.status, response.read(32768)
    except urllib.error.HTTPError as error:
        status, body = error.code, b""
    if status != expected:
        raise RuntimeError(f"{url}: expected HTTP {expected}; got {status}")
    if expected == 200 and not json.loads(body).get("ok", True):
        raise RuntimeError(f"{url}: unhealthy JSON response")
    if auth and (not json.loads(body).get("observedAt")):
        raise RuntimeError("monitoring response has no observation time")


def check(url, expected, auth=False):
    last_error = None
    for _ in range(5):
        try:
            check_once(url, expected, auth)
            return
        except (RuntimeError, urllib.error.URLError, TimeoutError) as error:
            last_error = error
            time.sleep(2)
    raise last_error


def main():
    names = ("Caddyfile", "compose.yaml")
    bases = json.loads((STAGING / "base-hashes.json").read_text())
    originals = {}
    for name in names:
        source = PARKING / name
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != bases[name]:
            raise RuntimeError(f"{name} changed after route preparation")
        originals[name] = data
    try:
        for name in names:
            target = PARKING / name
            target.with_name(name + ".before-infra-monitor").write_bytes(originals[name])
            target.write_bytes((STAGING / name).read_bytes())
        compose()
        check("https://budgit.duckdns.org/api/health", 200)
        check("https://park80.duckdns.org/api/health", 200)
        check("https://budgit.duckdns.org/infra-monitor/status.json", 401)
        check("https://budgit.duckdns.org/infra-monitor/status.json", 200, auth=True)
    except Exception:
        for name in names:
            (PARKING / name).write_bytes(originals[name])
        compose()
        raise
    print("Protected status route active; both apps healthy; unauthenticated request rejected.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Activation failed and original files restored: {error}", file=sys.stderr)
        raise SystemExit(1)
