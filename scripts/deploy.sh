#!/usr/bin/env bash
# Despliegue repetible con UN comando.
#   Uso:  RENDER_DEPLOY_HOOK_URL="https://api.render.com/deploy/srv-xxxx?key=yyyy" ./scripts/deploy.sh v1.1.0
# - Despliega exactamente el commit al que apunta la etiqueta indicada (sirve también para volver atrás).
# - APP_URL (opcional): si se define, consulta /api/health al terminar como prueba de humo.
set -euo pipefail

VERSION="${1:?Uso: ./scripts/deploy.sh vX.Y.Z}"
: "${RENDER_DEPLOY_HOOK_URL:?Falta la variable RENDER_DEPLOY_HOOK_URL (secreto, no va en el repositorio)}"

SHA="$(git rev-parse "${VERSION}^{commit}")"
echo "==> Desplegando ${VERSION} (commit ${SHA:0:7})"

# El hook de Render ya trae "?key=..."; el parámetro ref fija el commit a desplegar.
CODIGO="$(curl -sS -o /tmp/deploy.out -w '%{http_code}' -X POST "${RENDER_DEPLOY_HOOK_URL}&ref=${SHA}")"
if [[ "${CODIGO}" != 2* ]]; then
  echo "ERROR: el hook de despliegue respondió HTTP ${CODIGO}" >&2
  cat /tmp/deploy.out >&2 || true
  exit 1
fi
echo "==> Despliegue solicitado (HTTP ${CODIGO})"

if [[ -n "${APP_URL:-}" ]]; then
  echo "==> Esperando que ${APP_URL}/api/health responda (máx. 10 min)"
  for i in $(seq 1 60); do
    if curl -fsS "${APP_URL%/}/api/health" | grep -q '"status":"ok"'; then
      echo "==> La aplicación responde correctamente"
      exit 0
    fi
    sleep 10
  done
  echo "ERROR: la aplicación no respondió a tiempo" >&2
  exit 1
fi
