# Handoff v3: Restyle de Turno (solo cambia el aspecto)

> **Para Claude Code: lee esto completo antes de tocar nada.**
>
> **Objetivo:** que la app se vea diferente **sin cambiar lo que hace ni lo que muestra.**
> Este paquete reemplaza a los handoffs v1 y v2. Ignora los mocks anteriores (`Turno App.dc.html`): mostraban contenido inventado y **no** son la referencia.

## Regla de oro
**Solo se tocan estilos.** En cada archivo se permite cambiar únicamente:
1. El bloque `StyleSheet.create({...})`
2. Los valores de las props `color=`, `backgroundColor` y `size=` de los íconos, y los mapas de colores (`ESTADO`, `EST_FONDO`, `FONDO`, `heroBg`), cuando este documento lo indique

**Prohibido:**
- cambiar JSX (estructura, orden, elementos agregados o quitados)
- cambiar textos o copy, incluidos los emojis existentes
- cambiar lógica, hooks, llamadas a `lib/db`, navegación o `Alert`s
- cambiar nombres de claves de estilos
- agregar componentes nuevos a las pantallas (por ejemplo `Ticket` o `StatusHero` de `ui.tsx`)
- borrar secciones "porque no estaban en el mock"

Si un cambio de estilo exige tocar JSX, **no lo hagas**: déjalo anotado y pregunta.

## Paso 1: base (archivos completos)
| Paquete | Destino |
|---|---|
| `code/constants/index.ts` | `constants/index.ts` |
| `code/components/ui.tsx` | `components/ui.tsx` |
| `code/components/TurnoLogo.tsx` | `components/TurnoLogo.tsx` (nuevo; por ahora no se usa en pantallas) |
| `code/app/(app)/cliente/_layout.tsx` | igual. Aplica el mismo cambio en `barbero/_layout.tsx` y `dueno/_layout.tsx`: `screenOptions={useTabOptions()}` y conserva sus `Tabs.Screen` tal cual |

- `constants/index.ts` conserva todas las constantes de negocio (KEYS, ESTADOS_*, TIEMPOS, SUSCRIPCION) y los nombres viejos de COLORS y FONTS como alias. Nada debería romperse.
- `ui.tsx` conserva la API: Icon, Display, SectionLabel, Card, Button, Avatar, Badge, Chip, Pole, Dot y KV.
- Instala las dependencias: `npx expo install react-native-svg @expo-google-fonts/geist @expo-google-fonts/geist-mono`
- En `app/_layout.tsx`, carga las fuentes Geist (400/500/600/700) y Geist Mono (500/700). Quita Anton y Plus Jakarta Sans del `useFonts`, sin tocar nada más del archivo.
- La tipografía es **provisional**: el cliente definirá la final y solo habrá que cambiar el objeto `FONTS`.

## Paso 2: reemplazos exactos por archivo
En la carpeta `restyle/`, cada archivo trae el bloque `StyleSheet` **completo** con las mismas claves, más una lista de "JSX: cambios de color" al final. Pega el bloque en lugar del existente y aplica solo esos cambios de color.

| Archivo de restyle | Archivo del repo |
|---|---|
| `restyle/cliente-home.ts` | `app/(app)/cliente/home.tsx` |
| `restyle/cliente-turno.ts` | `app/(app)/cliente/turno.tsx` |
| `restyle/components-agenda-trabajo.ts` | `components/agenda-trabajo.tsx` (Mi agenda del barbero) |
| `restyle/dueno-agenda.ts` | `app/(app)/dueno/agenda.tsx` |
| `restyle/components-hoja-fila.ts` | `components/hoja-fila.tsx` |
| `restyle/components-panel-badge.ts` | `components/panel-badge.tsx` (también el mapa `FONDO`) |

## Paso 3: el resto de archivos (reglas mecánicas)
Esto aplica a todos los demás archivos de `app/` y `components/`: auth, historial, perfil, preferencias, buscar-barbero, agendar, barbero/clientes, stats y config, dueno/dashboard, barbero, config y stats, y cualquier otro componente. **Solo dentro de `StyleSheet.create`** y de las props de color:

| Propiedad actual | Nuevo valor |
|---|---|
| `backgroundColor: COLORS.bg` / `COLORS.canvas` | `'#FFFFFF'` |
| `COLORS.surface` en cards | `'#FFFFFF'` con `borderWidth: 1, borderColor: '#E6E6E6'` |
| `COLORS.surfaceAlt`, `*Light` (redLight, blueLight, successLight…) | `'#F4F4F4'` |
| `COLORS.carbon` / `carbonEl` | `'#0B0B0C'` |
| `borderRadius` de 9 a 24 (cards, botones, chips, inputs, pills) | `8` |
| `borderTopLeftRadius`/`borderTopRightRadius` de hojas modales | `16` |
| `borderRadius` de círculos (avatares, puntos) | sin cambio |
| `borderWidth: 1.5` | `1` |
| `borderLeftWidth` + `borderLeftColor` de acento | **eliminar ambas** |
| `shadow*` y `elevation` | eliminar |
| `fontFamily: FONTS.display` en **números** (precios, posiciones, fechas, horas, contadores, códigos) | `FONTS.monoBold` |
| `fontFamily: FONTS.display` en **títulos** | `FONTS.bold` |
| `FONTS.extrabold` | `FONTS.semibold` en nombres y títulos de card, `FONTS.bold` en títulos de pantalla |
| `FONTS.bold` en textos de fila o botón | `FONTS.semibold` (solo los overlines en MAYÚSCULAS mantienen `FONTS.bold`) |
| `FONTS.medium` en texto secundario | `FONTS.regular` |
| Precios en `color: COLORS.red` | `'#0B0B0C'` |
| Botón principal con fondo `COLORS.red` | `'#0B0B0C'`. **Excepción:** el botón final que confirma una reserva o una entrada a la fila se queda en `'#E1251B'` |
| Botón destructivo (Cancelar, Salir, Sacar) | fondo transparente, borde `'#E6E6E6'` y texto `'#C21D14'`. Solo el botón de confirmar una acción peligrosa en una hoja lleva fondo `'#E1251B'` |
| Selección activa (chip, tab o día) en rojo o azul | `'#0B0B0C'` con texto `'#FFFFFF'`. **Excepción:** el slot de hora seleccionado va en `'#E1251B'` |
| Caja de fondo verde (`COLORS.success`) | `'#0B0B0C'` |
| Texto blanco con opacidad (`rgba(255,255,255,.5–.85)`) | `'#B5B5B5'` |
| `COLORS.textLight` | `'#6B6B6B'` |
| `COLORS.textMid` | `'#5C5C5C'` |
| `COLORS.blue` en links o acciones de texto | sin cambio (`'#1E4FD8'`) |
| `ActivityIndicator color={COLORS.red}` | `'#0B0B0C'` (o `'#FFFFFF'` sobre fondo negro o rojo) |
| Íconos decorativos en rojo o azul dentro de cajas grises | `'#0B0B0C'` |
| Tamaños de título: `Display size` | sin cambio |
| Padding horizontal de pantalla `16` | `20` |

Colores de estado (solo en textos, puntos y mapas de estado):
- `en_fila` `#6B6B6B`
- `llamado` `#E1251B`
- `en_camino` `#1E4FD8`
- `atendiendo` / en la silla `#E1251B`
- `confirmada` `#0B0B0C`
- `disponible` / libre `#1F9D55`
- `descanso` `#6B6B6B`
- `cancelada` / `expirado` `#B5B5B5`
- `no_llego` `#C21D14`

## Verificación
1. `git diff --stat`: solo deben cambiar líneas de estilos y colores. Si un diff toca JSX o lógica fuera de lo listado, revísalo.
2. Recorre cada pantalla: debe mostrar **exactamente** las mismas secciones, textos y botones que antes.
3. `grep -rn "Anton\|PlusJakarta\|borderLeftWidth\|elevation\|shadowOpacity\|#E5202B\|#1646E0\|#16171C\|#F6F5F2\|#EBE8E3" app components` debe devolver 0 resultados.

## Referencia visual
- `Logo C - Ticket.dc.html`: logo e ícono de app (splash con fondo `#0B0B0C` y el logo en negativo).
- Principio general: neutros puros (blanco `#FFFFFF`, gris `#F4F4F4`, negro `#0B0B0C`). El rojo `#E1251B` y el azul `#1E4FD8` son solo acentos. Radio 8, sin sombras y todos los números en mono.
