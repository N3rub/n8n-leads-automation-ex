#!/usr/bin/env bash
#
# scripts/build-custom-nodes.sh
# Compila todos los custom nodes y los deja en dist/custom-nodes/
# Uso: ./scripts/build-custom-nodes.sh
#      ./scripts/build-custom-nodes.sh --watch
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CUSTOM_NODES_DIR="$REPO_ROOT/n8n/custom-nodes"
DIST_DIR="$REPO_ROOT/dist/custom-nodes"
WATCH_MODE="${1:-}"

log() { echo "$(date '+%H:%M:%S') [BUILD] $*"; }
ok()  { echo "$(date '+%H:%M:%S') [OK]    $*"; }
err() { echo "$(date '+%H:%M:%S') [ERROR] $*" >&2; exit 1; }

log "Limpiando dist/custom-nodes..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

for NODE_PKG in "$CUSTOM_NODES_DIR"/*/; do
  PKG_NAME=$(basename "$NODE_PKG")
  [ -f "$NODE_PKG/package.json" ] || { log "⚠ Saltando $PKG_NAME (sin package.json)"; continue; }

  log "Procesando: $PKG_NAME"
  (cd "$NODE_PKG" && npm ci --prefer-offline --silent) || err "npm ci falló en $PKG_NAME"

  if [ "$WATCH_MODE" = "--watch" ]; then
    (cd "$NODE_PKG" && npm run dev &)
  else
    (cd "$NODE_PKG" && npm run build) || err "Build falló en $PKG_NAME"
  fi

  DEST="$DIST_DIR/$PKG_NAME"
  mkdir -p "$DEST"
  find "$NODE_PKG/dist" -type f | while read -r f; do
    rel="${f#$NODE_PKG/dist/}"
    mkdir -p "$DEST/$(dirname "$rel")"
    cat "$f" > "$DEST/$rel"
  done
  cat "$NODE_PKG/package.json" > "$DEST/package.json"

  ok "$PKG_NAME → dist/custom-nodes/$PKG_NAME"
done

if [ "$WATCH_MODE" = "--watch" ]; then
  log "Modo watch activo. Ctrl+C para salir."
  wait
else
  ok "Build completado en $DIST_DIR"
  if docker compose -f "$REPO_ROOT/docker-compose.yml" ps --quiet n8n-main &>/dev/null; then
    docker compose -f "$REPO_ROOT/docker-compose.yml" restart n8n-main n8n-worker
    ok "n8n reiniciado con los nuevos nodos."
  else
    log "Docker no está corriendo. Arranca con: docker compose up -d"
  fi
fi
