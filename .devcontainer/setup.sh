#!/usr/bin/env bash
# Prepara la demo en Codespaces: dependencias, .env con llave propia, base de datos y datos de prueba.
set -euo pipefail
npm ci
if [ ! -f .env ]; then
  url="http://localhost:3000"
  if [ -n "${CODESPACE_NAME:-}" ]; then url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"; fi
  key="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  printf 'DATABASE_URL="file:./dev.db"\nDATA_KEY="%s"\nAPP_URL="%s"\n' "$key" "$url" > .env
fi
npx prisma migrate deploy
npm run seed
