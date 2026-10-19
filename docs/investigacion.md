# Investigación: qué se copió, de dónde y por qué

Fecha: 2026-10-18. Este documento separa lo observado (con su fuente) de lo inferido y de las decisiones de diseño de Llave.

## 1. DiDi (iOS, instalada en el Mac de Gabriel)

Artefacto: `/Applications/DiDi.app/Wrapper/GlobalPax.app` (bundle iOS envuelto para macOS, 348 MB, 216 recursos de primer nivel).

Límite: el ejecutable principal `GlobalPax` (169 MB) tiene `LC_ENCRYPTION_INFO_64` con `cryptid 1`, es decir, está cifrado con FairPlay. No se descifró: hacerlo sería eludir una medida de protección. Todo lo que sigue sale de recursos sin cifrar (archivos `.strings`, JSON y nombres de bundles), que muestran flujos, textos y proveedores, no el algoritmo de los servidores.

### 1.1 Arquitectura del cliente (observado por nombres de bundles)

- Súper app modular: React Native con Hermes (`DRN.bundle`, `hermes.framework`), Flutter (`Flutter.framework`, `GLCFlutterSDK`), mini programas JS (`DiminaProgram*`) y configuración remota (`ONEAppRemoteConfig.json`, `ApolloSDK`). Lección: separar verticales (viajes, comida, pagos) y apagar o encender funciones por país sin publicar versión nueva.
- Pila antifraude en capas: huella de dispositivo (`SmAntiFraud`, Shumei), comportamiento por ubicación (`Incognia`), riesgo de pagos (`RiskifiedBeacon`), 3DS (`Adyen3DS2`, `CardinalMobile`), captcha (`GTCaptcha4`, `NTESVerifyCodeResources`), y un módulo propio de riesgo (`DiRiskBase*`).
- Biometría: `MegLiveV5Detect` (Megvii FaceID), `OneSDKGlobalFace`, `DiFaceResource`.
- Llamadas enmascaradas: `VoIPLocalized`, `VoIPUIAssets`.

### 1.2 Kit de seguridad (`SafeToolKit-iOS.bundle`, textos es-CL)

- "Centro de seguridad" y "Kit de seguridad" accesibles durante el viaje.
- Contactos de confianza, máximo 5 ("Ya has agregado a tus 5 contactos de confianza").
- "Compartir mi viaje" con contactos en un clic; termina con "Estoy a salvo, dejar de compartir".
- Botón de emergencia: llama al número nacional y, al presionarlo, "el Centro de Reacción de DiDi recibe la información de tu viaje y comienza a trabajar en el caso". Muestra ubicación en tiempo real para dictarla a las autoridades. Detener el compartir "terminará tu proceso de emergencia".
- Números de emergencia por país en `policeNumber.json` (Chile: 133).
- Grabación de audio durante el viaje con consentimiento explícito ("Aceptar y comenzar"), indicador "Grabando", y el usuario puede eliminar la grabación.
- "Modo seguro activado: grabación y compartir datos del viaje habilitados".
- PIN del conductor que el pasajero ingresa para validar el viaje.
- Avisos de cambio de ruta: "El usuario conductor cambió a una ruta más corta para ir por ti" (transparencia ante desvíos).

### 1.3 Verificación de identidad (`OneSDKGlobalFace`, `MegLiveV5Detect`)

- Prueba de vida activa: parpadear, abrir la boca, girar e inclinar la cabeza, con control de luz, distancia y oclusión ("Quítate cualquier cosa que cubra tu cara", "Asegúrate de verificar solo a una persona").
- Documento más video selfie: "necesitamos que cargues fotos de ambos lados de tu INE y un video selfie".
- Vía de respaldo humana: "solicitud de verificación manual", "Materiales para apelar", "Revisión de la solicitud", "Apelación".
- Para conductores: verificación facial antes de poder aceptar viajes ("Podrás aceptar solicitudes de viaje una vez que seas aprobado").

### 1.4 Privacidad y cuenta (`GlobalPrivacySDK.bundle`)

- Eliminar cuenta exige esperar 15 días desde el último viaje "en caso de que haya un caso pendiente".
- Una cuenta bloqueada permanentemente no se puede eliminar (se preserva evidencia).
- Cada permiso explica para qué sirve y qué se pierde si se niega.

### 1.5 Otros flujos

- "Desvincular socio": "La plataforma no te asignará de nuevo a este socio". Bloqueo mutuo sin explicación.
- Calificación separada por dimensión y propina después del servicio.

## 2. Uber (evidencia pública)

PIN opcional que debe coincidir para iniciar el viaje; RideCheck detecta paradas largas inesperadas y pregunta si todo está bien; selfie aleatoria comparada con la identificación registrada; verificación de antecedentes antes de activar; preferencia de conductora para mujeres en algunos mercados. Despacho: candidatos en celdas vecinas puntuados por espera, reposicionamiento y probabilidad de aceptación (fuentes de terceros, inferencia).

## 3. Plataformas que entran a hogares

- Rover (cuidado de mascotas en casa): verificación de antecedentes por tercero para cada cuidador, insignia visible en el perfil y garantía por reserva.
- Care.com (cuidadoras): verificación de antecedentes obligatoria antes de contactar familias; advierte que no verifica todo lo que publican los miembros, lección para no prometer más de lo que se verifica.
- Urban Company (Reino Unido): reporte de incidentes con opción anónima y de elegir agente mujer u hombre; relación activa con la policía; revisión de tarjeta y dispositivo con terceros.
- Snabbit y Pronto (India, limpieza en 15 minutos): botón SOS que alerta a supervisores de zona; Pronto agrega formación en autodefensa. Reuters destaca que las trabajadoras pasan horas en casas privadas, el riesgo central del rubro.
- Airbnb (conocimiento general, no verificado en esta sesión): verificación de identidad, evaluación de riesgo por reserva, línea de apoyo y garantía de daños.

## 4. Proveedores (SaaS) para cuando haya volumen

- Truora: antecedentes, verificación de identidad y biometría para Latinoamérica, incluido Chile; API asíncrona (crear chequeo, consultar resultado). Requiere contrato.
- Alternativas a evaluar: MetaMap, Veriff, Persona (identidad y prueba de vida); un proveedor de despacho de emergencias.

## 5. Marco legal en Chile

- Ley 21.431 (plataformas digitales, vigente desde 1-sep-2022). Con trabajadores independientes la empresa debe "limitarse a coordinar el contacto" entre trabajador y usuarios, sin perjuicio de fijar términos generales (dictamen DT 1831/39). Exige capacitación en seguridad y elementos de protección también para independientes, y se vincula con el seguro de la Ley 16.744. Decisión: cada trabajador fija sus propias tarifas, elige qué aceptar y no tiene metas ni horarios.
- Ley 20.594: inhabilidades para trabajar con menores; consulta por RUT en el Registro Civil.
- Certificado de antecedentes del Registro Civil con código de verificación.
- SEC: licencia de instalador eléctrico y de gas para los trabajos que la exigen.
- Ley 20.609 (antidiscriminación): la única preferencia demográfica permitida es el género, con fundamento de seguridad, en ambos sentidos y opcional.
- Ley 21.719 (datos personales): biometría, antecedentes y dirección del hogar son datos sensibles. Consentimiento explícito, minimización, retención limitada, registro de accesos.

## 6. Estándar técnico de referencia

OWASP ASVS 4.0 nivel 2 para la app web: sesiones con token aleatorio guardado como hash, cookies `HttpOnly`/`Secure`/`SameSite`, límites de intentos (OTP y PIN), autorización por recurso en cada acción del servidor, archivos sensibles cifrados en reposo y servidos solo tras autorización, registro de auditoría de accesos de personal.

## 7. Qué se llevó al producto

| Patrón | Origen | En Llave |
|---|---|---|
| Kit de seguridad con contactos de confianza (máx. 5), compartir en vivo, "Estoy a salvo" | DiDi | Igual, para cliente y trabajador |
| Botón de emergencia que abre caso en una central y muestra 133 | DiDi, Snabbit | Modo silencioso pensado para quien está dentro de una casa ajena |
| PIN que habilita el inicio | Uber, DiDi | PIN de llegada que dicta el cliente; 5 intentos y bloqueo con alerta |
| Selfie antes de trabajar | Uber, DiDi | Selfie al iniciar cada servicio, que el cliente compara con el perfil en la puerta |
| Prueba de vida y revisión manual con apelación | DiDi | Selfie con código aleatorio escrito a mano, revisada por la central (MVP sin proveedor) |
| Detección de paradas anómalas | Uber RideCheck | Chequeo de bienestar si el servicio excede su duración |
| Desvincular | DiDi | Bloqueo mutuo permanente que el match respeta |
| Esperar 15 días antes de borrar la cuenta | DiDi | Igual, y no se borra con incidentes abiertos |
| Antecedentes antes de activar | Rover, Care.com | Antecedentes, inhabilidades Ley 20.594 y licencia SEC, con vencimiento |
| Preferencia de género | Uber | Opcional, solo género, en ambos sentidos |

## Fuentes

- https://www.uber.com/gb/en/ride/safety/
- https://fortune.com/2019/09/26/uber-debuts-saftey-features-riders-drivers
- https://rover.com/background-checks
- https://checkr.com/organizations/care-com
- https://www.care.com/c/en-gb/?p=2525
- https://urban.co/en-gb/hero/article/How-does-Urban-keep-me-safe
- https://www.stockopedia.com/share-prices/urban-NSI:URBANCO/news/in-india-1-housekeepers-spark-a-consumer-worker-frenzy-despite-safety-risks-019e6a1c-470b-7388-97fa-922c05a5ee8b/
- https://dev.truora.com/guides/api_integration_guide/
- https://www.isl.gob.cl/beneficios/ley-n21-431-para-empresas-y-trabajadores-as-de-plataformas-digitales-de-servicios/
- https://www.carey.cl/download/filebase/newsalert/495_-Entra-en-vigencia-ley-que-regula-el-contrato-de-trabajadores.pdf
- https://asemuch.cl/wp-content/uploads/2023/03/Dict.-No1831-39-del-19-10-2022.pdf
- https://www.achs.cl/ley-de-plataformas-digitales
