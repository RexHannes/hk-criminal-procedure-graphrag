#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QDRANT_VERSION="${QDRANT_VERSION:-v1.18.2}"
QDRANT_DIR="${QDRANT_DIR:-/tmp/codex_qdrant}"
QDRANT_BIN="${QDRANT_DIR}/qdrant"
STORAGE_DIR="${ROOT}/qdrant_storage"
PID_FILE="${STORAGE_DIR}/qdrant.pid"
LOG_FILE="${STORAGE_DIR}/qdrant.log"

mkdir -p "${QDRANT_DIR}" "${STORAGE_DIR}"

if [[ ! -x "${QDRANT_BIN}" ]]; then
  arch="$(uname -m)"
  os="$(uname -s)"
  if [[ "${os}" != "Darwin" || "${arch}" != "arm64" ]]; then
    echo "This helper currently downloads the official macOS ARM64 Qdrant binary only." >&2
    echo "Install Qdrant manually and set QDRANT_DIR/QDRANT_BIN for ${os}/${arch}." >&2
    exit 1
  fi
  url="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-aarch64-apple-darwin.tar.gz"
  echo "Downloading Qdrant ${QDRANT_VERSION} from ${url}" >&2
  curl -L --fail "${url}" -o "${QDRANT_DIR}/qdrant.tar.gz"
  tar -xzf "${QDRANT_DIR}/qdrant.tar.gz" -C "${QDRANT_DIR}"
fi

if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "Qdrant already running with PID $(cat "${PID_FILE}")"
  exit 0
fi

export QDRANT__STORAGE__STORAGE_PATH="${STORAGE_DIR}"
nohup "${QDRANT_BIN}" --disable-telemetry > "${LOG_FILE}" 2>&1 &
echo "$!" > "${PID_FILE}"

for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:6333/collections" >/dev/null 2>&1; then
    echo "Qdrant running at http://127.0.0.1:6333 with PID $(cat "${PID_FILE}")"
    exit 0
  fi
  sleep 0.5
done

echo "Qdrant did not become ready. See ${LOG_FILE}" >&2
exit 1
