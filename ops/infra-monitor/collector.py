#!/usr/bin/env python3
"""Publish a small, nonsecret infrastructure snapshot for Home Assistant."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import ssl
import subprocess
import tempfile
import time

UTC = dt.timezone.utc
CONTAINERS = {
    "budgit": "budgit-budgit-1",
    "parking": "park80-app-1",
    "proxy": "park80-caddy-1",
}
UNITS = (
    "parking-backup.service",
    "parking-recovery-drill.service",
    "parking-software-inventory.service",
    "apt-daily-upgrade.service",
)


def command(*args, timeout=8):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


def stamp():
    return dt.datetime.now(UTC).isoformat().replace("+00:00", "Z")


def cpu_ticks():
    fields = Path("/proc/stat").read_text().splitlines()[0].split()
    values = [int(value) for value in fields[1:]]
    idle = values[3] + values[4]
    return sum(values), idle


def network_bytes():
    """Measure the default-route interface; Docker bridge traffic is excluded."""
    route = Path("/proc/net/route").read_text().splitlines()[1:]
    interface = next((row.split()[0] for row in route if len(row.split()) > 1
                      and row.split()[1] == "00000000"), None)
    if not interface:
        return None
    for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
        name, _, data = line.partition(":")
        if name.strip() == interface:
            fields = data.split()
            return interface, int(fields[0]), int(fields[8])
    return None


def disk_bytes():
    """Sum physical whole-disk sectors read/written, excluding partitions and loops."""
    read = written = 0
    for line in Path("/proc/diskstats").read_text().splitlines():
        fields = line.split()
        if len(fields) < 10 or not re.fullmatch(r"(?:sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)", fields[2]):
            continue
        read += int(fields[5]) * 512
        written += int(fields[9]) * 512
    return read, written


def memory():
    values = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, _, rest = line.partition(":")
        if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}:
            values[key] = int(rest.split()[0]) / 1024
    return {
        "totalMiB": round(values["MemTotal"], 1),
        "availableMiB": round(values["MemAvailable"], 1),
        "availablePercent": round(values["MemAvailable"] / values["MemTotal"] * 100, 1),
        "swapUsedMiB": round(values["SwapTotal"] - values["SwapFree"], 1),
    }


def disk(path):
    capacity = shutil.disk_usage(path)
    stats = os.statvfs(path)
    return {
        "freeGiB": round(capacity.free / 2**30, 2),
        "freePercent": round(capacity.free / capacity.total * 100, 1),
        "inodeFreePercent": round(stats.f_favail / stats.f_files * 100, 1) if stats.f_files else None,
    }


def numeric_percent(value):
    try:
        return float(value.rstrip("%"))
    except (TypeError, ValueError):
        return None


def mib(value):
    match = re.fullmatch(r"([\d.]+)\s*([KMGT]?i?B)", value.strip())
    if not match:
        return None
    factor = {"B": 1 / 2**20, "kB": 1 / 1024, "KB": 1 / 1024,
              "KiB": 1 / 1024, "MB": 1, "MiB": 1, "GB": 1000,
              "GiB": 1024, "TB": 1000000, "TiB": 1048576}.get(match.group(2))
    return round(float(match.group(1)) * factor, 1) if factor is not None else None


def docker_stats():
    raw = command("docker", "stats", "--no-stream", "--format", "{{json .}}", timeout=12)
    result = {}
    if not raw:
        return result
    for line in raw.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        name = next((key for key, container in CONTAINERS.items() if row.get("Name") == container), None)
        if not name:
            continue
        result[name] = {
            "cpuPercentOneCore": numeric_percent(row.get("CPUPerc")),
            "memoryMiB": mib(row.get("MemUsage", "").split("/")[0]),
            "memoryLimitMiB": mib(row.get("MemUsage", "").split("/")[-1]),
        }
    return result


def container_states():
    result = {}
    for key, name in CONTAINERS.items():
        raw = command("docker", "inspect", "--format",
                      "{{json .State.Status}}|{{json .State.StartedAt}}|{{json .RestartCount}}|{{json .Image}}", name)
        try:
            state, started, restarts, image = [json.loads(part) for part in raw.split("|")]
            result[key] = {"available": True, "state": state, "startedAt": started,
                           "restartCount": restarts, "image": image}
        except (AttributeError, ValueError, TypeError):
            result[key] = {"available": False}
    return result


def unit_results():
    result = {}
    for unit in UNITS:
        raw = command("systemctl", "show", unit, "--property=Result,ExecMainStatus,ActiveEnterTimestamp")
        if raw is None:
            result[unit] = {"available": False}
            continue
        values = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
        result[unit] = {"available": True, "result": values.get("Result"),
                        "exitCode": values.get("ExecMainStatus"),
                        "activeAt": values.get("ActiveEnterTimestamp") or None}
    return result


def budgit_backup(path):
    if not Path(path).exists():
        return {"available": False}
    try:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        try:
            count, enabled, attempt, success, failed = db.execute(
                "SELECT COUNT(*), COALESCE(SUM(enabled),0), MAX(last_attempt), "
                "MAX(last_success), SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) "
                "FROM drive_backup_connections"
            ).fetchone()
            return {"available": True, "connections": count, "enabled": enabled,
                    "lastAttemptMs": attempt, "lastSuccessMs": success,
                    "connectionsWithError": failed or 0,
                    "verification": "Drive upload acknowledged; remote restore not tested here"}
        finally:
            db.close()
    except (sqlite3.Error, OSError):
        return {"available": False}


def certificates(cache_file):
    cached = read_json(cache_file)
    if isinstance(cached, dict):
        checked = cached.get("checkedAt")
        try:
            age = (dt.datetime.now(UTC) - dt.datetime.fromisoformat(checked.replace("Z", "+00:00"))).total_seconds()
            if 0 <= age < 12 * 3600:
                return cached
        except (AttributeError, ValueError, TypeError):
            pass
    result = {"checkedAt": stamp()}
    for domain in ("budgit.duckdns.org", "park80.duckdns.org"):
        try:
            with socket.create_connection(("127.0.0.1", 443), timeout=5) as connection:
                with ssl.create_default_context().wrap_socket(connection, server_hostname=domain) as tls:
                    expiry = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
                    result[domain] = {"valid": True,
                                      "expiresAt": dt.datetime.fromtimestamp(expiry, UTC).isoformat().replace("+00:00", "Z")}
        except (OSError, ssl.SSLError, KeyError, ValueError) as error:
            result[domain] = {"valid": False, "errorType": type(error).__name__}
    atomic_json(cache_file, result)
    return result


def reduce_samples(samples):
    cpu = [sample["cpuPercent"] for sample in samples if sample["cpuPercent"] is not None]
    peak = max(samples, key=lambda sample: sample["cpuPercent"] or -1)
    latest = samples[-1]
    return {
        "cpuMeanPercent": round(sum(cpu) / len(cpu), 1) if cpu else None,
        "cpuPeakPercent": round(max(cpu), 1) if cpu else None,
        "cpuPeakAt": peak["at"] if cpu else None,
        "memory": latest["memory"],
        "memoryAvailableMinMiB": min(s["memory"]["availableMiB"] for s in samples),
        "swapUsedPeakMiB": max(s["memory"]["swapUsedMiB"] for s in samples),
        "networkRxPeakKiBps": max((s["networkRxKiBps"] or 0) for s in samples),
        "networkTxPeakKiBps": max((s["networkTxKiBps"] or 0) for s in samples),
        "diskReadPeakMiBps": max((s["diskReadMiBps"] or 0) for s in samples),
        "diskWritePeakMiBps": max((s["diskWriteMiBps"] or 0) for s in samples),
    }


def sample(previous):
    cpu_now = cpu_ticks()
    network_now = network_bytes()
    disk_now = disk_bytes()
    elapsed = max(time.monotonic() - previous["at"], 0.001)
    total = cpu_now[0] - previous["cpu"][0]
    idle = cpu_now[1] - previous["cpu"][1]
    cpu = round((total - idle) / total * 100, 1) if total > 0 else None
    rx = tx = None
    if network_now and previous["network"] and network_now[0] == previous["network"][0]:
        rx = round(max(0, network_now[1] - previous["network"][1]) / elapsed / 1024, 1)
        tx = round(max(0, network_now[2] - previous["network"][2]) / elapsed / 1024, 1)
    read = round(max(0, disk_now[0] - previous["disk"][0]) / elapsed / 2**20, 2)
    written = round(max(0, disk_now[1] - previous["disk"][1]) / elapsed / 2**20, 2)
    return {"cpu": cpu_now, "network": network_now, "disk": disk_now, "at": time.monotonic()}, {
        "at": stamp(), "cpuPercent": cpu, "memory": memory(),
        "networkRxKiBps": rx, "networkTxKiBps": tx,
        "diskReadMiBps": read, "diskWriteMiBps": written,
    }


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".status-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(value, output, separators=(",", ":"))
            output.write("\n")
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prune(directory):
    cutoff = time.time() - 7 * 86400
    files = sorted(directory.glob("20??-??-??.jsonl"))
    for path in files:
        if path.stat().st_mtime < cutoff:
            path.unlink()
    files = sorted(directory.glob("20??-??-??.jsonl"))
    while sum(path.stat().st_size for path in files) > 50 * 2**20 and len(files) > 1:
        files.pop(0).unlink()


def run(output, history, count, interval, root, budgit_db):
    previous = {"cpu": cpu_ticks(), "network": network_bytes(),
                "disk": disk_bytes(), "at": time.monotonic()}
    samples = []
    for index in range(count):
        time.sleep(interval)
        previous, point = sample(previous)
        samples.append(point)
    measured = reduce_samples(samples)
    now = stamp()
    inventory = read_json(root / "backup-status/software-inventory.json")
    backup = read_json(root / "backup-status/last-success.json")
    drill = read_json(root / "backup-status/recovery-drill.json")
    snapshot = {
        "schema": 1, "observedAt": now,
        "host": {**measured, "disk": disk("/"),
                 "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                 "rebootRequired": Path("/var/run/reboot-required").exists()},
        "containers": container_states(), "containerUsage": docker_stats(),
        "jobs": unit_results(),
        "inventory": {"at": inventory.get("at"), "versions": inventory.get("versions"),
                      "host": inventory.get("host"), "deployments": inventory.get("deployments")}
                     if isinstance(inventory, dict) else None,
        "backups": {"parking": backup if isinstance(backup, dict) else None,
                    "parkingRecovery": drill if isinstance(drill, dict) else None,
                    "budgit": budgit_backup(budgit_db)},
        "certificates": certificates(output.parent / "tls-cache.json"),
    }
    atomic_json(output, snapshot)
    history.mkdir(parents=True, exist_ok=True)
    with (history / f"{now[:10]}.jsonl").open("a") as log:
        log.write(json.dumps({"observedAt": now, "host": snapshot["host"],
                              "containerUsage": snapshot["containerUsage"]}, separators=(",", ":")) + "\n")
    prune(history)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/opt/infra-monitor/status/status.json"))
    parser.add_argument("--history", type=Path, default=Path("/opt/infra-monitor/history"))
    parser.add_argument("--parking-root", type=Path, default=Path("/opt/park80"))
    parser.add_argument("--budgit-db", type=Path, default=Path("/opt/budgit/data/monthly-flow.sqlite"))
    parser.add_argument("--samples", type=int, default=6)
    parser.add_argument("--interval", type=float, default=10)
    args = parser.parse_args()
    if not 1 <= args.samples <= 6 or not 0 <= args.interval <= 10:
        parser.error("samples must be 1–6 and interval 0–10")
    run(args.output, args.history, args.samples, args.interval, args.parking_root, args.budgit_db)


if __name__ == "__main__":
    main()
