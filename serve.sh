#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
printf '\n  府城校园图志 · 海南中学\n  http://127.0.0.1:%s/\n\n' "$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
