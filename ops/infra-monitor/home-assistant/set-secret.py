#!/usr/bin/env python3
"""Add one YAML secret from stdin without printing or overwriting it."""

import os
from pathlib import Path
import re
import sys
import tempfile

if len(sys.argv) != 2 or not re.fullmatch(r"infra_[a-z_]+", sys.argv[1]):
    raise SystemExit("Expected one infra_* secret key")
key = sys.argv[1]
value = sys.stdin.read().strip()
if not value or "\n" in value or "\r" in value:
    raise SystemExit("Invalid single-line secret")
target = Path("/config/secrets.yaml")
original = target.read_text() if target.exists() else ""
if re.search(rf"^{re.escape(key)}\s*:", original, flags=re.M):
    raise SystemExit(f"{key} already exists; no change made")
fd, temporary = tempfile.mkstemp(prefix=".infra-secrets-", dir=target.parent)
try:
    with os.fdopen(fd, "w") as output:
        output.write(original.rstrip("\n") + "\n" if original else "")
        output.write(f"{key}: '{value.replace(chr(39), chr(39) * 2)}'\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print(f"Added {key} to HA secrets without displaying its value.")
