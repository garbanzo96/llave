# Llave

Plataforma chilena que conecta hogares con trabajadoras y trabajadores independientes de limpieza, jardinería, gasfitería, gas y electricidad. El match funciona como el de Uber; la diferencia es la capa de confianza para dejar entrar a alguien a la casa, y para entrar sola o solo a una casa ajena.

MVP funcional de punta a punta: registro con OTP, verificación de identidad y antecedentes con revisión de la central, match agendado y de urgencia, llegada con selfie y PIN, fotos del trabajo, presupuestos adicionales, pago en custodia, calificación ciega, botón de ayuda silencioso, chequeo de bienestar, seguimiento compartido y central de seguridad.

## Abrir la app

En el navegador, sin instalar nada: **https://garbanzo96.github.io/llave/**

Es la app real (las mismas páginas, reglas y algoritmos) corriendo entera en tu navegador. Con la barra "Demo" de arriba cambias entre cliente, trabajadora, gasfíter y central sin iniciar sesión cada vez. El GPS está simulado en Providencia, los SMS aparecen en pantalla y no hay pagos reales. Lo que hagas queda guardado solo en ese navegador; "Reiniciar" vuelve a los datos iniciales.

En la carpeta, `Abrir Llave (web).webloc` abre ese mismo enlace con doble clic.

En tu Mac, con servidor y base de datos de verdad: doble clic en `INICIAR.command` dentro de la carpeta del proyecto. La primera vez instala lo necesario (1 a 3 minutos) y después abre Chrome solo. Requiere Node 22.

### Cómo funciona la demo web

`demo/` compila `src/app` para el navegador con Vite y reemplaza solo lo que necesita un servidor: Prisma por una base en memoria que lee `prisma/schema.prisma` (`demo/src/shims/prisma.ts`), la sesión, el cifrado, los SMS y los archivos (IndexedDB servido por `demo/public/sw.js`). Cada push a `main` la vuelve a publicar con `.github/workflows/pages.yml`, que antes corre `npm run test:demo`: la misma prueba de integración de la app real, pero contra la base en memoria. Si agregas una consulta de Prisma que la demo no soporta, esa prueba avisa.

Comandos: `npm run demo` (local en http://localhost:5173/llave/), `npm run demo:build`, `npm run test:demo`.

## Probar en local

Requiere Node 22.

```bash
npm install
cp .env.example .env   # y completa DATA_KEY con: openssl rand -hex 32
npx prisma migrate dev
npm run seed
npm run dev
```

Abre http://localhost:3000 y entra con un celular de la tabla. En desarrollo el código OTP aparece en pantalla (y en la consola del servidor).

| Rol | Nombre | Celular |
|---|---|---|
| Central | Central Llave | 9 0000 0001 |
| Cliente verificada | Camila Rojas | 9 1111 1111 |
| Cliente sin verificar | Luis Pérez | 9 3333 3333 |
| Limpieza | María José Soto | 9 4444 4444 |
| Limpieza y jardín (en prueba) | Rosa Huenchumilla | 9 5555 5555 |
| Gasfitería y gas SEC | Jorge Muñoz | 9 6666 6666 |
| Electricidad SEC | Pedro Araya | 9 7777 7777 |
| Postulante pendiente | Carolina Fuentes | 9 8888 8888 |

Recorrido sugerido: Camila pide limpieza agendada e invita a María José → María José acepta en otra ventana (o navegador privado) → "Voy en camino" → "Llegué" (el navegador debe dar una ubicación a menos de 200 m de la dirección de Camila; en Chrome se simula en DevTools › Sensors con -33.4263, -70.6110) → selfie → Camila confirma identidad y ve su PIN → María José ingresa el PIN → fotos → terminar → Camila confirma y califica.

Pruebas: `npm test`.

## Estructura

- `src/lib/core/`: algoritmos puros con tests (match, precios, máquina de estados, seguridad, RUT).
- `src/server/`: sesiones, cifrado, almacenamiento, pagos y servicios de dominio. Solo se llama desde el servidor.
- `src/app/actions.ts`: todas las Server Actions (autenticación, autorización y validación en el borde).
- `src/app/c`, `src/app/t`, `src/app/central`: cliente, trabajador/a y central.
- `docs/investigacion.md`: ingeniería inversa de DiDi (recursos del bundle iOS), Uber y plataformas similares, y el marco legal chileno.
- `docs/seguridad.md`: modelo de amenazas, controles y lo que falta antes de producción.
- `docs/blueprint.md`: diseño original del producto.

## Antes de lanzar

Ver `docs/seguridad.md`, sección "Pendiente antes de producción". En corto: SMS real, pasarela de pagos (Mercado Pago o Flow), Postgres y almacenamiento de objetos, cron cada minuto contra `/api/cron`, revisión legal y pentest.
