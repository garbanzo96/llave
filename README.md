# Llave

Plataforma chilena que conecta hogares con trabajadoras y trabajadores independientes de limpieza, jardinería, gasfitería, gas y electricidad. El match funciona como el de Uber; la diferencia es la capa de confianza para dejar entrar a alguien a la casa, y para entrar sola o solo a una casa ajena.

MVP funcional de punta a punta: registro con OTP, verificación de identidad y antecedentes con revisión de la central, match agendado y de urgencia, llegada con selfie y PIN, fotos del trabajo, presupuestos adicionales, pago en custodia, calificación ciega, botón de ayuda silencioso, chequeo de bienestar, seguimiento compartido y central de seguridad.

## Abrir la app

[![Abrir Llave en Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/garbanzo96/llave?quickstart=1)

Enlace directo: https://codespaces.new/garbanzo96/llave?quickstart=1

1. Abre el enlace con tu sesión de GitHub y presiona "Create codespace" (la segunda vez ofrece "Resume").
2. La primera vez tarda 2 a 4 minutos: instala, crea la base y carga los datos de demostración. Si VS Code pregunta si confías en los autores de la carpeta, elige "Confiar": sin eso no arranca el servidor.
3. Cuando la terminal diga "Ready", abre la pestaña "Puertos" (Ports) del panel inferior y haz clic en el globo del puerto 3000 (Llave). A veces se abre sola.
4. Entra con un celular de la tabla de abajo; el código OTP aparece en pantalla.

Para probar dos roles a la vez, usa una ventana normal y una de incógnito. Cualquier persona con cuenta de GitHub puede abrirlo; cada codespace usa la cuota gratuita mensual de quien lo abre y se apaga solo tras 30 minutos sin uso. La app dentro del codespace es privada: su puerto solo lo ve quien lo creó.

Si no estás en Santiago, la búsqueda no encontrará a nadie: entra como trabajador/a › Perfil › "Usar mi ubicación como base", y como cliente agrega una dirección con "Usar mi ubicación actual". Así la llegada (radio de 200 m) también se puede probar desde el mismo lugar.

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
