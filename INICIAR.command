#!/bin/zsh
# Abre Llave en Chrome con doble clic. La primera vez instala dependencias y carga datos de prueba (1 a 3 minutos).
cd "${0:A:h}" || exit 1
URL="http://localhost:3000/entrar"

if ! command -v npm >/dev/null; then
  echo "Falta Node.js. Instálalo desde https://nodejs.org (versión 22 LTS) y vuelve a abrir este archivo."
  read -k1 "?Presiona una tecla para cerrar."
  exit 1
fi

# Si ya está corriendo, solo abre Chrome.
if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
  exit 0
fi

[ -d node_modules ] || { echo "Instalando dependencias (solo la primera vez)..."; npm install --no-audit --no-fund || exit 1; }

if [ ! -f .env ]; then
  key="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  printf 'DATABASE_URL="file:./dev.db"\nDATA_KEY="%s"\nAPP_URL="http://localhost:3000"\n' "$key" > .env
fi

fresh=0
[ -f prisma/dev.db ] || fresh=1
npx prisma migrate deploy >/dev/null || exit 1
[ $fresh = 1 ] && npm run seed >/dev/null && echo "Datos de prueba cargados."

npm run dev &
server=$!
trap 'kill $server 2>/dev/null' EXIT INT TERM
echo "Iniciando Llave..."
until curl -s -o /dev/null "$URL"; do sleep 1; done
open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
echo ""
echo "Llave está abierta en Chrome ($URL)."
echo "Entra con el celular 9 1111 1111 (cliente), 9 4444 4444 (trabajadora) o 9 0000 0001 (central); el código aparece en pantalla."
echo "Para cerrarla, cierra esta ventana."
wait $server
