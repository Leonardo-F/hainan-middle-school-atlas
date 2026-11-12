#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
printf '\n  海南中学校园图志 · 府城校区\n  http://127.0.0.1:%s/\n\n' "$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
