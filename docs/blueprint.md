# Uber para servicios del hogar: ingeniería inversa y diseño

Fecha: 2026-10-18. Alcance: Chile.

La tesis es que de Uber conviene copiar la máquina (flujo de oferta en tiempo real, máquina de estados del viaje, pago retenido, calificación bilateral, verificación continua de identidad) y no el producto. Un viaje es un servicio homogéneo con precio calculable antes de partir; una visita al hogar es heterogénea, casi siempre agendada, de duración incierta, ocurre dentro de un espacio privado y tiende a volverse relación recurrente. Eso cambia el algoritmo de match, el modelo de precios y, sobre todo, obliga a construir la capa de seguridad antes que la de crecimiento.

## 1. Método y límites de esta ingeniería inversa

No había un APK ni IPA de Uber disponible, y la lógica que importa (despacho, precios, detección de fraude) corre en los servidores de Uber, no en la app. Descompilar el cliente mostraría pantallas y llamadas a la API, no el algoritmo. Por eso la reconstrucción se hizo con evidencia pública: las páginas de seguridad de Uber, su ingeniería publicada (H3, DISCO) y análisis de diseño de sistemas de terceros. Lo que viene de terceros está marcado como inferencia. Si quieres ver el cliente por dentro (flujo de pantallas, endpoints, SDKs de verificación que usa), se puede pasar el APK por REA en una segunda etapa.

## 2. Cómo funciona Uber, por componentes

| Componente | Qué hace en Uber | Evidencia |
|---|---|---|
| Stream de ubicación | La app del conductor envía GPS cada pocos segundos a un gateway; las actualizaciones viajan por Kafka al despacho. | Terceros (inferencia razonable) |
| Índice geoespacial | Celdas hexagonales H3 (librería abierta de Uber) para buscar oferta cercana y definir zonas de tarifa dinámica. | Uber publicó H3; uso interno exacto, inferencia |
| Despacho (DISCO) | Toma los conductores disponibles en celdas vecinas y los puntúa por tiempo de espera, costo de reposicionamiento y probabilidad de aceptación. No es "el más cercano". Ofrece al mejor con un plazo; si rechaza, pasa al siguiente. | Terceros |
| Precio | Precio conocido de antemano (ruta + tiempo) y multiplicador dinámico por celda según oferta y demanda. | Público |
| Máquina de estados del viaje | solicitado → asignado → en camino → llegó → en curso → terminado → pagado → calificado. | Observable en la app |
| Pago | Tarjeta registrada, retención al pedir, cobro al terminar, pago al conductor con opción inmediata. | Observable |
| Reputación | Calificación bilateral; umbrales que desactivan cuentas. | Público |
| Seguridad | Verificación de antecedentes antes de activar; selfie aleatoria comparada con el documento registrado; PIN opcional que debe coincidir para iniciar el viaje; RideCheck, que detecta paradas largas inesperadas con sensores y GPS y pregunta si todo está bien; compartir viaje en vivo; botón de emergencia; números enmascarados. | Páginas de seguridad de Uber |

La lección central: el foso de Uber es la liquidez (siempre hay un auto a pocos minutos) y la confianza se fabrica con verificación repetida, no solo con un filtro de entrada.

## 3. Qué no se traslada y qué cambia

| Uber | Servicios del hogar | Consecuencia de diseño |
|---|---|---|
| Servicio idéntico entre conductores | Oficios distintos con certificaciones distintas | El match parte por filtros duros de competencia y licencia |
| Inmediato | Mayormente agendado; urgencias en gasfitería y electricidad | Dos modos de match: agenda y urgencia |
| Precio calculable antes | Alcance desconocido hasta ver el problema | Tarifa por hora o m² en limpieza y jardín; visita de diagnóstico más presupuesto dentro de la app en gasfitería y electricidad |
| El pasajero entra al espacio del conductor por 20 minutos | El trabajador entra al hogar del cliente por horas, y el trabajador queda solo en un espacio ajeno | Riesgo en ambos sentidos; el cliente también debe verificarse |
| Relación de una vez | Relación recurrente | Riesgo de que cliente y trabajador se arreglen por WhatsApp y abandonen la app |

El último punto es el riesgo de negocio más serio. Uber no lo sufre porque nadie quiere al mismo conductor; aquí la persona de limpieza buena es exactamente lo que el cliente quiere retener. La plataforma tiene que dar razones para quedarse que valgan más que la comisión: seguro y garantía solo dentro de la app, agenda recurrente sin fricción, comisión decreciente en relaciones recurrentes, pago rápido y cotizaciones previsionales resueltas para el trabajador.

## 4. Match

Principio: la seguridad es un filtro, nunca un peso. Ningún puntaje alto compensa un antecedente vencido o una licencia faltante.

Paso 1, filtros duros (si falla uno, el trabajador no entra al conjunto):

- Oficio solicitado dentro de sus competencias verificadas.
- Licencia vigente cuando el trabajo la exige (SEC para electricidad y gas).
- Identidad y antecedentes vigentes (ver sección 5).
- Ninguno de los dos bloqueó al otro.
- Disponibilidad en el horario y comuna, y condiciones que el trabajador fijó (por ejemplo, no aceptar si no hay un adulto en casa, no aceptar servicios nocturnos).
- Trabajador en período de prueba: solo clientes verificados con buen historial, sin urgencias nocturnas.

Paso 2, puntaje entre los que pasan: tiempo de llegada o cercanía, calidad (calificación ajustada por número de servicios, para que tres reseñas de 5 no ganen a cien de 4,8), confiabilidad (cancelaciones y puntualidad), relación previa (favorito del cliente primero) y un componente de equidad que reparte trabajo a trabajadores nuevos bien evaluados, para que la oferta no se concentre en pocos.

Modo agenda (limpieza, jardinería, mantenciones): el cliente ve 3 a 5 perfiles ordenados por puntaje y elige, o reserva a su favorito. Se parece más a una reserva que a Uber, y está bien.

Modo urgencia (filtración, corte de luz): se parece a DISCO. Se ofrece en cascada a los mejores tres con 60 segundos cada uno, con tarifa de urgencia mostrada al cliente antes de confirmar. No conviene el multiplicador dinámico opaco de Uber; en una emergencia doméstica se lee como abuso.

Escala: al inicio basta Postgres con PostGIS y una consulta por radio. H3 y un stream de ubicaciones en tiempo real solo se justifican con miles de trabajadores activos simultáneos.

## 5. Capa de seguridad y confianza

Se diseña para dos amenazas: el cliente que teme a quien entra a su casa (robo, agresión, daño, suplantación de quien llega) y el trabajador, muchas veces una mujer sola, que entra a un espacio desconocido (acoso, agresión, no pago, acusaciones falsas). Uber verifica poco al pasajero; esta plataforma no puede hacerlo.

### 5.1 Al entrar a la plataforma

Trabajador:

1. Identidad: foto de cédula, selfie con prueba de vida comparada con la cédula y consulta de vigencia del documento. Se contrata un proveedor de KYC que opere en Chile.
2. Certificado de antecedentes del Registro Civil, validado con su código de verificación, renovado cada 6 meses.
3. Consulta del registro de inhabilidades para trabajar con menores (Ley 20.594), obligatoria para cualquier servicio en hogares.
4. Credenciales de oficio: licencia SEC de instalador eléctrico o de gas, verificada en el registro público de la SEC; en limpieza y jardinería, referencias laborales comprobadas.
5. Entrevista por video y módulo de protocolo de conducta (qué hacer y qué no dentro de un hogar, cómo usar el botón de emergencia).
6. Período de prueba: primeros 5 servicios con las restricciones de match indicadas arriba y llamada de seguimiento a ambos.

Cliente:

1. Identidad con cédula y selfie antes de la primera reserva.
2. Tarjeta a nombre del titular verificado.
3. Dirección confirmada (geolocalización al momento del primer servicio y coherencia con la dirección declarada).
4. Declaración por servicio: quiénes estarán en casa, menores, mascotas, si el trabajador estará solo. El trabajador ve esto antes de aceptar.

### 5.2 El día del servicio

1. Antes: el cliente recibe foto actual, nombre, credenciales y reseñas de quien va; el trabajador recibe nombre, foto y calificación del cliente. La dirección exacta se revela solo al aceptar.
2. Selfie de inicio de jornada comparada con el registro (equivalente al Real-Time ID de Uber). Ataca un problema concreto en Chile: cuentas prestadas o arrendadas, donde llega alguien distinto a quien fue verificado.
3. Código de llegada: el cliente dicta un PIN de 4 dígitos; el servicio no se inicia sin él. Asegura que la persona llegó a la casa correcta y que quien abre es el cliente.
4. Registro de entrada y salida con geocerca y temporizador visible para ambos.
5. Fotos de antes y después del área de trabajo, guardadas en la app. Protegen al cliente ante daños y al trabajador ante acusaciones.
6. Botón de emergencia para ambos lados, con modo silencioso (crítico para un trabajador dentro de una casa ajena): envía ubicación y datos del servicio a una central 24/7 y a contactos de confianza.
7. Seguimiento compartido: cualquiera de los dos puede compartir el servicio en vivo con un contacto.
8. Chequeo de bienestar, la versión doméstica de RideCheck: si el servicio supera la duración estimada en un margen fijado, o el teléfono del trabajador sale de la geocerca sin registrar salida, la app pregunta a ambos; sin respuesta, escala a la central.
9. Chat y llamadas dentro de la app con números enmascarados.
10. Sin efectivo. El cobro queda retenido y se libera al cerrar el servicio, con 48 horas para reclamos. Cualquier trabajo adicional se presupuesta y aprueba en la app antes de hacerse.

### 5.3 Después

1. Calificación bilateral ciega: ninguno ve la nota del otro hasta que ambos califican o pasan 72 horas, para evitar represalias.
2. Pregunta privada "¿te sentiste seguro/a?" que no afecta la nota pública y que, ante un no, abre revisión de la central.
3. Bloqueo mutuo: un bloqueo impide cualquier match futuro entre ambos, sin explicación requerida.
4. Monitoreo continuo: antecedentes y licencias se revalidan por calendario; un vencimiento suspende automáticamente al trabajador.
5. Seguro: responsabilidad civil y daños a la propiedad del cliente, y cobertura de accidentes del trabajador acorde a la Ley 21.431.
6. Equipo de incidentes con protocolo escrito, tiempos de respuesta, retención de evidencia y canal con Carabineros y PDI.

### 5.4 Datos personales

Biometría, antecedentes penales y la dirección de un hogar son datos sensibles. Con la Ley 21.719 de protección de datos (vigencia plena a partir de diciembre de 2026, a confirmar con abogado) esto exige consentimiento explícito, minimización, plazos de retención definidos y medidas de seguridad demostrables. Regla práctica: la plataforma guarda el resultado de la verificación y la fecha, no el certificado ni la imagen biométrica más allá de lo necesario.

## 6. Decisiones que no puedo tomar por ti

1. Preferencia de género. Uber ofrece en algunos mercados que mujeres pasajeras prefieran conductoras. Aquí sería muy pedido, sobre todo por trabajadoras que no quieren entrar a casas de hombres solos. Choca con la Ley 20.609 contra la discriminación si se abre a cualquier criterio. Propuesta: permitir solo preferencia de género con fundamento de seguridad, en ambos sentidos, y prohibir filtros por nacionalidad, edad u otros. Necesita revisión legal.
2. Relación laboral. La Ley 21.431 distingue trabajadores de plataforma dependientes e independientes, con obligaciones distintas. El modelo de comisiones y control (por ejemplo, si la plataforma fija precios y horarios) puede inclinar la calificación. También es tema de abogado.
3. Primer mercado. Uber lanzó ciudad por ciudad para tener liquidez. Una o dos comunas y dos oficios (por ejemplo limpieza, que es recurrente, y gasfitería, que trae urgencias) bastan para probar.

## 7. Orden de construcción sugerido

1. Verificación de trabajadores y clientes, operada en parte a mano por el equipo. Sin esto no hay producto.
2. Reservas agendadas con perfiles, PIN de llegada, entrada y salida, fotos, pago retenido y calificación ciega.
3. Botón de emergencia y chequeo de bienestar con una central mínima (al inicio, una persona de turno con protocolo).
4. Modo urgencia con oferta en cascada.
5. Recién con volumen: puntaje automatizado más fino, tarifas por zona, índice H3.

Herramientas posibles sin sobredimensionar: app en React Native con Expo, backend Postgres con PostGIS (Supabase sirve), pagos con un proveedor chileno que permita dividir pagos a terceros (Mercado Pago o Flow, a evaluar) y un proveedor de KYC con prueba de vida que opere en Chile.

## Fuentes

- Uber, página de seguridad: https://www.uber.com/gb/en/ride/safety/
- Fortune (2019), funciones de seguridad de Uber: https://fortune.com/2019/09/26/uber-debuts-saftey-features-riders-drivers
- Teardown de despacho de Uber (terceros): https://dev.to/gargkunal/how-uber-finds-you-a-driver-in-3-seconds-system-design-teardown-1phf
- Diseño de sistema de despacho (terceros): https://techinterview.org/system-design-rideshare-dispatch/
- ISL, Ley 21.431: https://www.isl.gob.cl/beneficios/ley-n21-431-para-empresas-y-trabajadores-as-de-plataformas-digitales-de-servicios/
- Diario Constitucional (2026), balance de la ley de plataformas: https://www.diarioconstitucional.cl/2026/06/29/ley-de-plataformas-en-chile-entre-regulacion-formal-y-proteccion-real/

Pendiente de verificar con fuente primaria: vigencia exacta de la Ley 21.719, procedimiento de consulta del registro de la Ley 20.594 por una plataforma, y qué trabajos exigen licencia SEC.
