#!/usr/bin/env python3
"""Install infrastructure sections in the existing My-Dev-Apps Lovelace view.

Run inside the Home Assistant SSH app, where SUPERVISOR_TOKEN is available.
The dashboard is saved through Home Assistant's WebSocket API, not .storage.
"""

import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import struct
import time

import yaml


MARKER = "Infrastructure · "
OLD_MARKER = "תשתית · "
SOURCE = Path("/config/infra-monitor/dashboard.yaml")
BACKUP_DIR = Path("/config/infra-monitor")


def receive_exact(connection, count):
    data = b""
    while len(data) < count:
        chunk = connection.recv(count - len(data))
        if not chunk:
            raise ConnectionError("Home Assistant closed the WebSocket")
        data += chunk
    return data


def receive_message(connection):
    fragments = []
    while True:
        first, second = receive_exact(connection, 2)
        opcode = first & 15
        size = second & 127
        if size == 126:
            size = struct.unpack("!H", receive_exact(connection, 2))[0]
        elif size == 127:
            size = struct.unpack("!Q", receive_exact(connection, 8))[0]
        if second & 128:
            mask = receive_exact(connection, 4)
            payload = bytes(value ^ mask[index % 4] for index, value in enumerate(receive_exact(connection, size)))
        else:
            payload = receive_exact(connection, size)
        if opcode == 8:
            raise ConnectionError("Home Assistant closed the WebSocket")
        if opcode == 9:
            send_frame(connection, payload, opcode=10)
            continue
        if opcode in (0, 1):
            fragments.append(payload)
        if first & 128:
            return json.loads(b"".join(fragments))


def send_frame(connection, payload, opcode=1):
    if isinstance(payload, dict):
        payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    mask = secrets.token_bytes(4)
    size = len(payload)
    header = bytes([128 | opcode])
    if size < 126:
        header += bytes([128 | size])
    elif size < 65536:
        header += bytes([128 | 126]) + struct.pack("!H", size)
    else:
        header += bytes([128 | 127]) + struct.pack("!Q", size)
    connection.sendall(header + mask + bytes(value ^ mask[index % 4] for index, value in enumerate(payload)))


def connect():
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise RuntimeError("SUPERVISOR_TOKEN is unavailable")
    connection = socket.create_connection(("supervisor", 80), timeout=15)
    connection.settimeout(20)
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    request = ("GET /core/api/websocket HTTP/1.1\r\nHost: supervisor\r\n"
               "Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    connection.sendall(request.encode())
    response = b""
    while b"\r\n\r\n" not in response:
        response += receive_exact(connection, 1)
        if len(response) > 16384:
            raise RuntimeError("Invalid WebSocket handshake")
    header = response[:-4]
    if not header.startswith(b"HTTP/1.1 101"):
        raise RuntimeError("Home Assistant WebSocket upgrade failed: " + header.split(b"\r\n", 1)[0].decode())
    if receive_message(connection).get("type") != "auth_required":
        raise RuntimeError("Unexpected WebSocket authentication state")
    send_frame(connection, {"type": "auth", "access_token": token})
    if receive_message(connection).get("type") != "auth_ok":
        raise RuntimeError("Home Assistant rejected WebSocket authentication")
    return connection


def command(connection, command_id, payload):
    send_frame(connection, {"id": command_id, **payload})
    while True:
        reply = receive_message(connection)
        if reply.get("id") == command_id:
            if not reply.get("success"):
                raise RuntimeError("Home Assistant command failed: " + str(reply.get("error", {}).get("code")))
            return reply.get("result")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    source_views = yaml.safe_load(SOURCE.read_text())["views"]
    with connect() as connection:
        current = command(connection, 1, {"type": "lovelace/config", "url_path": "lovelace"})
        matching = [view for view in current["views"] if view.get("title") == "My-Dev-Apps"]
        if len(matching) != 1 or matching[0].get("type") != "sections":
            raise RuntimeError("Expected one sections-style My-Dev-Apps view")
        view = matching[0]
        existing = view.get("sections", [])
        kept = [section for section in existing if not any(
            card.get("type") == "heading" and str(card.get("heading", "")).startswith((MARKER, OLD_MARKER))
            for card in section.get("cards", []))]
        additions = [{"type": "grid", "column_span": 2, "cards": [
            {"type": "heading", "heading": MARKER + part["title"], "icon": part.get("icon")},
            *part["cards"]]} for part in source_views]
        print("existing sections", len(existing), "monitoring sections", len(existing) - len(kept),
              "planned sections", len(kept) + len(additions))
        if not args.apply:
            return
        BACKUP_DIR.mkdir(mode=0o700, exist_ok=True)
        backup = BACKUP_DIR / ("lovelace-overview-before-infra-" + time.strftime("%Y%m%d-%H%M%S") + ".json")
        descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            json.dump(current, stream, ensure_ascii=False, indent=2)
        view["sections"] = kept + additions
        command(connection, 2, {"type": "lovelace/config/save", "url_path": "lovelace", "config": current})
        saved = command(connection, 3, {"type": "lovelace/config", "url_path": "lovelace", "force": True})
        installed = next(item for item in saved["views"] if item.get("title") == "My-Dev-Apps")
        count = sum(any(card.get("type") == "heading" and str(card.get("heading", "")).startswith(MARKER)
                        for card in section.get("cards", [])) for section in installed.get("sections", []))
        if count != len(additions):
            raise RuntimeError("Dashboard save returned an unexpected section count")
        print("installed monitoring sections", count, "backup", backup.name)


if __name__ == "__main__":
    main()
