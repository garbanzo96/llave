# DESIGN.md · Llave

Escrito desde lo construido (src/app/globals.css y src/components/ui.tsx). Documentado en el hilo principal en lugar del subagente documentador de impeccable.

## Mundo

Cuaderno cuadriculado chileno. Cada servicio es una línea escrita en tinta azul sobre cuadrícula; el margen rojo es el lugar de la seguridad y nunca se usa como decoración.

## Color (Restrained)

| Token | Valor | Uso |
|---|---|---|
| --paper | #ffffff | Fondo y hojas |
| --grid | #dcebf3 | Cuadrícula de 24 px en el body |
| --ink / --ink-strong | #1d2c94 / #121d6b | Acciones primarias, cifras clave, foco |
| --ink-tint | #e9ecfa | Selección, burbujas propias, estados informativos |
| --graphite / --graphite-2 | #1f2329 / #4f5661 | Texto y texto secundario |
| --rule | #d9dee6 | Separadores de línea |
| --margin / --margin-strong / --margin-tint | #c8102e / #9e0b23 / #fdebee | Solo seguridad: margen fijo, botón de ayuda, alertas, acciones destructivas |
| --ok / --warn | #17663f / #8a5300 (+ tintes) | Verificado, pendiente |

## Tipografía

Atkinson Hyperlegible 400/700 para todo (diseñada para baja visión). Base 17 px, inputs a 17 px para evitar zoom en iOS. Títulos 1.55rem, secciones 1.15rem. Cifras con `tabular`.

## Composición

- Columna de contenido a la derecha del margen rojo (`--margin-x: 44px`), máx. 36rem en móvil; la central usa hasta 80rem.
- `Line`: fila del cuaderno con hora a la izquierda, contenido y estado.
- `Sheet`: hoja blanca con sombra suave desplazada; nunca anidada.
- `PinCells`: el PIN se escribe en cuatro cuadros contiguos de la cuadrícula.
- `SafetyRail`: botón circular rojo montado sobre la línea del margen en toda pantalla activa; un toque abre el panel, un segundo toque envía la alerta.

## Movimiento

Transiciones de 150 ms en botones. Una animación de autor (`.ink-in`, escritura de izquierda a derecha) disponible para estados nuevos. Todo se anula con `prefers-reduced-motion`.

## Componentes

Botones de 48 px mínimo: primary (tinta), secondary (contorno tinta), danger (margen), ghost (enlace). Badges con ícono lucide. Notices sin borde lateral. Inputs con borde de 2 px que pasa a tinta con foco y a margen con error.
