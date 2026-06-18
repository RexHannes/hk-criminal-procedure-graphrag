#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_FILE="${1:-$SCRIPT_DIR/.env.demo.runtime}"

if [ -z "${DOPPLER_TOKEN:-}" ]; then
  echo "DOPPLER_TOKEN is required. Use a Doppler service token on the server/operator machine." >&2
  exit 1
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required to render runtime env files." >&2
  exit 1
fi

umask 077
doppler secrets download --no-file --format env > "$OUT_FILE"
chmod 600 "$OUT_FILE"
echo "Rendered runtime env to $OUT_FILE with mode 600. Do not commit this file."
