# Modelo de amenazas y controles

Activos: integridad física de clientes y trabajadoras/es, documentos de identidad y antecedentes, direcciones de hogares, dinero en custodia, decisiones de la central.

Fronteras de confianza: navegador (formularios, archivos, GPS), enlaces compartidos públicos, endpoint de cron, central (personal interno), proveedores futuros (SMS, pagos, KYC).

## Amenazas del dominio (lo que hace distinta a esta app)

| Amenaza | Control | Dónde |
|---|---|---|
| Llega alguien distinto a la persona verificada (cuenta prestada o arrendada) | Selfie de llegada que el cliente compara con la foto de perfil antes de dictar el PIN; "No es la persona" abre incidente | `marketplace.ts` `uploadStartSelfie`, `confirmIdentity`; `c/servicio/[id]` |
| Alguien adivina el PIN para iniciar un servicio | PIN de 4 dígitos por servicio, comparación en tiempo constante, 5 intentos y bloqueo con incidente | `safety.ts` `checkPin`; `marketplace.ts` `startWithPin` |
| El servicio empieza sin que el cliente esté | `START` exige selfie, confirmación de identidad del cliente y PIN | `booking-machine.ts` |
| La persona no llega o reporta llegada falsa | Llegada solo dentro de 200 m del domicilio; atraso de 45 min crea incidente | `geo.ts`, `wellbeingSweep` |
| Agresión o encierro durante el servicio | Botón de ayuda silencioso en el margen para ambos; avisa a la central y a contactos; chequeo de bienestar si se excede la duración | `SafetyRail`, `safety.ts`, `sweep` |
| Coacción para marcar "Estoy a salvo" | Marcar a salvo no cierra la alerta; la central debe llamar y resolverla | `markSafe` |
| Persona con antecedentes o inhabilitada para trabajar con menores | Filtros duros del match; verificaciones con vencimiento; se revalida al aceptar | `matching.ts` `hardFilter`, `respondOffer` |
| Trabajo eléctrico o de gas sin licencia | Categoría exige licencia SEC aprobada y vigente | `CATEGORIES.requiredLicense` |
| Acoso fuera de la app | Chat que oculta teléfonos, correos, enlaces y menciones a WhatsApp/Instagram; números nunca expuestos | `redactContactInfo` |
| Volver a coincidir con alguien que generó incomodidad | Desvincular bilateral permanente; filtro duro | `block`, `hardFilter` |
| Represalia en calificaciones | Calificación ciega: se publica cuando ambos califican o a las 72 h; "¿te sentiste seguro/a?" privado | `ratingsVisible`, `applyRatings` |
| Dirección expuesta a quien no viene | La dirección exacta se revela solo tras aceptar; las ofertas muestran comuna | `bookingView`, `workerOffers` |
| Cliente fantasma (trabajadora atraída a una dirección) | Clientes también verifican identidad; trabajadores en prueba no atienden clientes sin historial ni urgencias nocturnas; pueden exigir adulto en casa o solo clientas | `hardFilter` |
| Fraude de pago o no pago | Autorización al reservar, captura al terminar, liberación tras 48 h; incidente abierto congela la liberación | `payments.ts`, `transition` |
| Borrar la cuenta para eludir una investigación | 15 días desde el último servicio, sin incidentes ni servicios abiertos; cuentas suspendidas no se borran | `deletionBlockers` |

## Controles web (OWASP ASVS nivel 2)

- Autenticación: OTP por SMS de 6 dígitos guardado como HMAC con llave del servidor, 5 min de vida, 5 intentos, 3 envíos por 15 min por número (límite en base de datos, sirve con varias instancias).
- Sesiones: token aleatorio de 32 bytes, guardado como SHA-256; cookie `__Host-` `HttpOnly` `Secure` `SameSite=Lax`, 30 días. Teléfono verificado durante el registro en cookie sellada con AES-GCM.
- Autorización: cada server action llama `actor(roles)` y luego verifica pertenencia al recurso (`participant`). Los archivos se autorizan por tipo y relación; accesos de la central quedan en auditoría.
- CSRF: Server Actions de Next comparan Origin y Host; cookies `SameSite=Lax`.
- Concurrencia: transiciones con `updateMany` condicionado al estado previo (dos trabajadores no pueden aceptar el mismo servicio).
- Entrada: zod en los bordes; tipo de archivo por bytes mágicos, tope de 8 MB; RUT con dígito verificador; teléfonos normalizados.
- Datos en reposo: documentos cifrados con AES-256-GCM (`DATA_KEY`), nombres de archivo aleatorios, ruta validada antes de leer o borrar.
- Encabezados: CSP con nonce por solicitud y `strict-dynamic`, `frame-ancestors 'none'`, HSTS en producción, `Referrer-Policy: no-referrer` (los enlaces compartidos llevan token), `Permissions-Policy` limitado a cámara y ubicación.
- Errores: los mensajes al usuario salen solo de errores de dominio; el resto se registra en servidor y se responde genérico.
- Retención (Ley 21.719): imágenes de verificación 90 días, selfies de llegada 30, fotos de trabajo 90, ubicación 30, OTP 1 día. Exportación de datos y eliminación con anonimización.

## Pendiente antes de producción

1. Proveedor de SMS real (`src/server/notify.ts`).
2. Pasarela de pagos con pagos divididos y webhooks firmados (`src/server/payments.ts`).
3. Postgres administrado y almacenamiento de objetos privado con el mismo cifrado (`storage.ts`); rotación de `DATA_KEY` con un KMS.
4. Proveedor de identidad con prueba de vida activa y antecedentes automatizados (Truora u otro) cuando el volumen supere la revisión manual.
5. Cron externo cada minuto contra `/api/cron` con `CRON_SECRET`.
6. Revisión legal de términos, Ley 21.431 y Ley 21.719, y pentest externo.
7. Protocolo escrito de la central con tiempos de respuesta y coordinación con Carabineros.

## Dependencias (auditoría del 2026-10-19)

- Next.js actualizado a 15.5.28: corrige la RCE crítica en el protocolo flight de React y los avisos de Server Actions.
- `sharp` actualizado; además el optimizador de imágenes está apagado (`images.unoptimized`), porque las imágenes privadas se sirven por `/api/files`.
- Diferido: avisos altos en `prisma` y `@prisma/config` (deepmerge-ts, effect). Afectan solo al CLI de Prisma en desarrollo y despliegue, no al cliente en ejecución, y la corrección exige migrar a Prisma 7 (cambio mayor). Revisar al migrar a Postgres, a más tardar el 2026-12-01.
- Diferido: PostCSS anidado en Next 15 procesa solo el CSS propio al compilar; no recibe datos de usuarios. Se resuelve al subir a Next 16. Misma fecha de revisión.
