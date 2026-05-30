#!/usr/bin/env bash
# Load-test baseline — sensor, no se corre seguido.
# Objetivo: tener "el número de hoy" para saber CUÁNDO te acercás al límite.
# Usa npx autocannon (no suma dependencia al proyecto).
#
# Uso:
#   ./loadtest/baseline.sh                 # contra prod (default)
#   ./loadtest/baseline.sh http://localhost:8080
#
# Mide los endpoints públicos (sin auth) para leer el techo crudo de la
# única instancia de Cloud Run: throughput + latencia p50/p97.5/p99.
# Para endpoints autenticados, exportá TOKEN y descomentá el bloque de abajo.

set -euo pipefail

BASE_URL="${1:-https://caja-chica-442790495206.us-west2.run.app}"
DURATION="${DURATION:-20}"     # segundos
CONNECTIONS="${CONNECTIONS:-20}" # conexiones concurrentes (≈ pico realista a 50 users)

echo "==> Baseline contra: $BASE_URL"
echo "    duración=${DURATION}s  concurrencia=${CONNECTIONS}"
echo ""

echo "### 1/2  GET /api/health (sin auth, mide instancia cruda)"
npx -y autocannon -c "$CONNECTIONS" -d "$DURATION" "$BASE_URL/api/health"

echo ""
echo "### 2/2  GET /api/maintenance/status (público, polled por cada cliente)"
npx -y autocannon -c "$CONNECTIONS" -d "$DURATION" "$BASE_URL/api/maintenance/status"

# --- Endpoints autenticados (descomentar cuando quieras medir el camino real) ---
# Conseguí un token: DevTools → Network → cualquier request a /api → header Authorization.
#   export TOKEN="Bearer eyJ..."
# echo "### GET /api/movimientos (autenticado, camino real del dashboard)"
# npx -y autocannon -c "$CONNECTIONS" -d "$DURATION" \
#   -H "Authorization: $TOKEN" "$BASE_URL/api/movimientos?limit=50"

echo ""
echo "==> Anotá p97.5/p99 y req/seg en loadtest/README.md como baseline de hoy."
