# Handoff: Línea gráfica y UI de Turno

## Resumen
Nueva identidad visual de **Turno**, una app de gestión de turnos para barberías con fila digital y citas. Este documento reemplaza el sistema anterior "NAVAJA" (Anton + Plus Jakarta Sans, carbón #0F0F10, rojo #E5202B, azul #1646E0) en toda la app: `constants/index.ts`, `components/ui.tsx` y todas las pantallas en `app/(app)/cliente/*`, `app/(app)/barbero/*`, `app/(app)/dueno/*` y `app/(auth)/*`.

## Sobre los archivos de diseño
Los archivos `.dc.html` de esta carpeta son **referencias de diseño hechas en HTML**. Muestran el aspecto y el comportamiento esperados, pero no son código de producción para copiar. La tarea es **recrearlos en el stack existente del repo** (Expo + React Native + expo-router + TypeScript), usando sus patrones: `StyleSheet`, componentes compartidos en `components/ui.tsx` y constantes en `constants/index.ts`.

Para ver las referencias, abre los archivos en un navegador. Necesitan `support.js`, que está incluido en la carpeta.

## Fidelidad
**Alta fidelidad** en colores, radios, espaciado, jerarquía, estados y layout.
**Excepción: la tipografía es provisional.** El cliente definirá la familia final. Implementa los tamaños y pesos indicados con fuentes centralizadas en `FONTS`, para que cambiar de familia sea un cambio de una sola línea. Mientras tanto usa Geist y Geist Mono (`@expo-google-fonts/geist` y `@expo-google-fonts/geist-mono`) o la fuente del sistema.

Los datos que aparecen en los mocks (nombres, precios, horas) son de ejemplo.

---

## 1. Tokens de diseño

Principio: **dominan los neutros puros (blanco y negro); el rojo y el azul solo son acentos.** Nunca uses rojo o azul como fondo de pantalla completa en el modo estándar.

### Colores — claro
| Token | Hex | Uso |
|---|---|---|
| `bg` | `#FFFFFF` | Fondo de pantalla |
| `surface` | `#F4F4F4` | Avatares, chips de fecha, bloques secundarios |
| `ink` | `#0B0B0C` | Texto principal, botones primarios, ticket activo |
| `text2` | `#5C5C5C` | Etiquetas de sección, subtítulos |
| `text3` | `#6B6B6B` | Metadatos, íconos de tab inactivos |
| `disabled` | `#B5B5B5` | Texto deshabilitado u horas ocupadas |
| `border` | `#E6E6E6` | Bordes de cards, botones secundarios y chips |
| `divider` | `#F0F0F0` | Separadores de filas de lista |
| `tabBorder` | `#EDEDED` | Borde superior de la tab bar |
| `red` | `#E1251B` | Acento: tab activa, CTA de confirmar, estado "llamado" y "en la silla" |
| `redText` | `#C21D14` | Rojo para texto sobre blanco (acciones destructivas como "Salir") |
| `blue` | `#1E4FD8` | Acento: estado "en camino", links y acciones secundarias ("Confirmar") |
| `green` | `#1F9D55` | Punto y texto "Disponible" |

### Colores — oscuro
| Token | Hex |
|---|---|
| `bg` | `#0B0B0C` |
| `surface` | `#1A1A1A` |
| `ink` (texto) | `#FFFFFF` |
| `text2` / `text3` | `#A3A3A3` |
| `border` | `#2A2A2A` |
| `divider` / `tabBorder` | `#1F1F1F` |
| `red` (texto o ícono) | `#FF5A4F` |
| `blue` (texto) | `#6E93FF` |
| `green` | `#34C77B` |

En oscuro, la card protagonista se invierte: fondo `#FFFFFF`, texto `#0B0B0C` y botón interno `#0B0B0C` con texto blanco.

### Radios
| Token | Valor | Uso |
|---|---|---|
| `r.sm` | 8 | **Radio por defecto**: botones, cards, chips, inputs, slots de hora, tickets |
| `r.pill` | 999 | Avatares circulares y el punto de estado |
| `r.icon` | 27 sobre 120 (22.5 %) | Ícono de app |

El estilo estándar no usa radios mayores de 8 en componentes. Los radios mayores solo aparecen en la variante Glass (sección 6).

### Espaciado
Escala: `4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 32`.
- Padding horizontal de pantalla: **20**
- Separación vertical entre bloques de pantalla: **20–22**
- Padding interno de cards: **14–18**
- Separación entre chips o botones en fila: **8–10**
- Filas de lista: padding vertical **11–12** y separador de 1px `divider`

### Tipografía (tamaños y pesos; familia pendiente)
| Rol | Tamaño / peso | Extras |
|---|---|---|
| `display.number` (posición de turno) | 112 / 700 mono | letterSpacing −4, lineHeight 1 |
| `h1` (título de pantalla) | 28 / 700 | letterSpacing −0.6 |
| `h2` (estado grande) | 40 / 700 | letterSpacing −1 |
| `title` (nombre en card) | 18–22 / 600 | |
| `body` | 15 / 600 (títulos de fila) · 15 / 400 | |
| `meta` | 13 / 400–600 | color `text3` |
| `overline` (etiqueta de sección) | 11–12 / 700 | letterSpacing 1–1.4, MAYÚSCULAS |
| `tab label` | 11 / 600 | |
| `mono` (números, horas, precios, Nº de ticket, timers) | Geist Mono 500/700 | **Todos los números usan mono** |

Las etiquetas de estado son bilingües cuando son protagonistas, con el formato `TU POSICIÓN · YOUR SPOT` y `LLAMADO · CALLED`. La app es español primero; prepara i18n (es/en).

### Patrón del poste de barbero
Franjas diagonales literales a **−55°** (CSS `repeating-linear-gradient(-55deg, …)`), en una secuencia de 4 bandas iguales: rojo `#E1251B` → blanco `#FFFFFF` → azul `#1E4FD8` → blanco.
- Talón del ticket: 14px de ancho con bandas de 6px
- Franja superior de la card "en la silla": 14–18px de alto con bandas de 7–8px

En React Native, implementa el patrón como SVG (`react-native-svg`) con un `<Pattern>` rotado, o como una imagen repetible. **Solo aparece en tres lugares:** el logo, el talón del ticket activo y el estado "en la silla". No lo uses como decoración de fondo.

---

## 2. Logo (dirección C, "Ticket")
- **Símbolo:** un ticket de turno (rectángulo de 110×76 con radio 4 y muescas semicirculares de r=8 a media altura en ambos lados). A la izquierda tiene un talón de 28 de ancho con el patrón del poste, separado por una línea discontinua (`dasharray 3 4`, stroke 2). En el cuerpo lleva una **T** de barra 46×10 y tronco 10×32.
- **Versión positiva:** ticket `#0B0B0C` y T blanca. **Negativa:** ticket blanco y T `#0B0B0C`.
- **Wordmark:** "Turno". La tipografía está pendiente; en la app usa provisionalmente 17/700 junto al símbolo de 30×21.
- **Ícono de app:** cuadrado negro de radio 27/120, con la T blanca centrada y el talón del poste como banda inferior de 28/120 separada por una línea discontinua.
- Referencia exacta del SVG: `Logo C - Ticket.dc.html`. Exporta un componente `<TurnoLogo variant="positive|negative" size />` en `components/`.

---

## 3. Componentes base (actualizar `components/ui.tsx`)

**Button**
- `primary`: fondo `ink` y texto blanco, alto 52, radio 8, texto 16/600
- `accent` (CTA final como "Confirmar cita"): fondo `red` y texto blanco, alto 54
- `secondary`: fondo transparente con borde 1px `border`, texto `ink` 15/600
- `destructive`: igual que `secondary`, con texto `redText`
- Estado pressed: opacidad 0.85. Estado disabled: fondo `surface` y texto `disabled`

**Chip / segmento** (selector de barbería y de días)
- Alto aprox. 36, padding 8×14, radio 8, texto 14/600
- Activo: fondo `ink` y texto blanco. Inactivo: borde `border` y texto `text2`

**Card:** fondo `bg`, borde 1px `border`, radio 8, padding 14. Sin sombras en el estilo estándar.

**Ticket activo** (tarjeta de turno en Inicio)
- Fondo `ink`, radio 8, muescas circulares de r=9 a media altura en ambos lados
- Tres zonas en fila:
  1. Talón del poste de 14 de ancho
  2. Cuerpo con padding 16/18/16/22: overline de estado, título 18/600 y meta `#B5B5B5`
  3. Separador vertical discontinuo de 2px `#3A3A3A`, seguido del bloque de posición: overline "POSICIÓN" y número mono 36/700

**Fila de lista:** avatar o número de 32–42px + título 15/600 + meta 13 + estado a la derecha (13/600, color según el estado). Separador de 1px `divider`.

**Avatar:** círculo de 36–42px, fondo `surface`, iniciales 13–14/600.

**Badge de disponibilidad:** padding 7×12, borde 1px `border`, radio 8, punto de 8px `green` y texto 13/600.

**Slot de hora:** alto 44, radio 8, grid de 3 columnas con gap 8, texto mono 14/500.
- Disponible: borde `border`
- Seleccionado: fondo y borde `red`, texto blanco
- Ocupado: borde `divider`, texto `disabled` tachado

**Chip de día:** alto 62, `flex:1`, gap 6. Día 12/500 y número mono 18/700. Seleccionado: fondo `ink` y texto blanco. Cerrado: fondo `surface` y texto `disabled`.

**Tab bar:** alto 84 con borde superior de 1px `tabBorder` y 4 ítems de ancho igual. Íconos de 24 con trazo 1.8 y label 11/600. Ítem activo en `red`, inactivo en `text3`.

**Íconos:** estilo lineal con stroke 1.8, extremos redondeados y sin relleno. Se puede usar `lucide-react-native` con `strokeWidth={1.8}`. Equivalencias: Inicio `Home`, Mi turno `Clock`, Historial `Receipt`, Perfil `User`, Agenda `Calendar`, Stats `BarChart3`, Clientes `Users`, Config `Settings` y ubicación `MapPin`.

---

## 4. Estados de turno y cita

| Estado (`status`) | Color | Texto en lista | Hero en "Mi turno" |
|---|---|---|---|
| `en_fila` | `ink` / `text3` | "En fila" | Fondo `ink`, posición mono 112, "de N personas en la fila" y píldora "≈ X min de espera" (fondo `#1F1F1F`) |
| `llamado` | `red` | "Llamado" | Fondo `red`: "¡Es tu turno!" (40/700) y "Ve al local ahora. Te guardan la silla 10 min." |
| `en_camino` | `blue` | "En camino" | Fondo `blue`: "Vas en camino" y "{barbero} ya sabe que vienes." |
| `en_silla` | `red` | "En la silla" | Fondo `ink` con franja del poste arriba: "Te están atendiendo" y "Termina aprox. HH:MM" |
| `confirmada` (cita) | `ink` | "Confirmada" | — |
| `descanso` (barbero) | `text3` | "Descanso" | — |
| `disponible` (barbero) | `green` | "Disponible" | — |

Estas son las únicas situaciones donde un hero de pantalla completa puede usar rojo o azul. Mapea estos estados a los status que ya existen en la base de datos del repo.

---

## 5. Pantallas

Frame de referencia: 390×844 (iPhone 14/15). Todas las pantallas tienen fondo `bg`, padding horizontal 20 y la tab bar abajo.

### 5.1 Cliente · Inicio (`app/(app)/cliente/home.tsx`)
Columna con gap 22:
1. Header con el logo (30×21 + "Turno" 17/700) y un avatar de 36 a la derecha
2. Saludo "Hola, {nombre}" (14, `text2`), nombre de la barbería (h1) y dirección con el ícono `MapPin` (13, `text3`)
3. Fila de chips de barberías, con la activa en `ink` y un chip "+" de 38 de ancho
4. **Ticket activo**, solo si el cliente está en una fila
5. Card de la próxima cita: bloque de fecha de 52×52 (`surface`, día mono 20/700 y mes 10/700), servicio, detalle y link "Confirmar" en `blue`
6. Overline "FILA DIGITAL · ENTRA AHORA" y la lista de barberos (avatar, nombre, "especialidad · N en fila" y estado)

### 5.2 Cliente · Mi turno (`app/(app)/cliente/turno.tsx`)
- h1 "Mi turno"
- Card con borde `border` y radio 8: arriba el hero según el estado (sección 4), luego un separador discontinuo de 2px `border` y abajo el servicio, el barbero con la duración, y "Nº 07" en mono 13/700
- Acciones (solo en `en_fila` y `llamado`): botón `primary` "Voy en camino" con `flex:1` y botón `destructive` "Salir"
- Overline "DELANTE DE TI" y lista con la posición (mono 14/700 `text2`), el nombre y el estado. El usuario aparece como "Tú".

### 5.3 Cliente · Reservar (`app/(app)/cliente/agendar.tsx`)
- Header con un botón atrás de 40×40 (borde `border`, radio 8) y el título "Reservar" (24/700)
- Cuatro pasos con overline numerado: "1 · BARBERO", "2 · SERVICIO", "3 · DÍA", "4 · HORA"
  - **Barbero:** 3 tarjetas con `flex:1`, avatar de 40 y nombre. La seleccionada lleva fondo `ink`, texto blanco y avatar blanco.
  - **Servicio:** cards con nombre, duración y precio a la derecha (mono 16/700, formato "RD$ 700"). La seleccionada lleva borde de 1.5px `ink`.
  - **Día:** 6 chips de día
  - **Hora:** grid de slots
- Footer fijo con borde superior `tabBorder` y padding 14/20/34, con el botón `accent` "Confirmar cita · {día} {hora}"

### 5.4 Barbero · Mi silla (`app/(app)/barbero/agenda.tsx`)
- Fecha (14 `text2`), h1 "Mi silla" y badge de disponibilidad a la derecha
- **Card "En la silla":** fondo `ink` y radio 8. Arriba lleva la franja del poste de 14 de alto. Contiene un overline, el nombre del cliente (22/600), el servicio con la duración, un timer transcurrido en mono 30/700 alineado a la derecha y el botón blanco "Terminar y llamar siguiente" (alto 48).
- Encabezado "COLA · N" con el tiempo total estimado a la derecha, y la lista con la posición (cuadro de 32 `surface`, radio 8, mono), el nombre, el servicio y el estado. Las citas con hora se mezclan en la cola como "10:30 · Cita".
- Tabs: Agenda (activa), Stats, Clientes y Config
- **Modo oscuro:** ver la sección 1. La card "En la silla" se invierte a fondo blanco.

Las pantallas no diseñadas todavía (Historial, Perfil, Stats, Clientes, Config, panel del dueño, auth) deben aplicar los mismos tokens y componentes.

---

## 6. Variante opcional: Liquid Glass (`Turno App - Glass.dc.html`)
Es una exploración estilo iOS y **no reemplaza** al estilo estándar. Solo impleméntala si el cliente la confirma, idealmente como un tema alternativo.
- **Fondo:** base `#F2F2F2` (claro) o `#0B0B0C` (oscuro) con 2–3 manchas desenfocadas. Rojo de 320px con opacidad 0.55, azul de 300px con opacidad 0.5 y blur de 70–90. En RN se puede hacer con una imagen pre-renderizada o con `expo-linear-gradient` + `expo-blur`.
- **Superficies:** `BlurView` de intensidad 40–60 (tint `light` o `dark`).
  - Claro: capa `rgba(255,255,255,.40–.45)` con borde 1px `rgba(255,255,255,.7)` y un highlight superior de 1px `rgba(255,255,255,.9)`
  - Oscuro: capa `rgba(255,255,255,.07–.10)` con borde `rgba(255,255,255,.14–.18)`
- **Radios:** cards de 22–32, tab bar de 32 y botones píldora (alto 56, radio 28)
- **Tab bar flotante:** separada 16 de los lados y 26 del borde inferior, con alto 64 y padding 5. El ítem activo es una píldora sólida `ink` al 90 % en claro (o blanca en oscuro), con ícono de 22 y label 10/600.
- **Contraste:** en glass, el texto secundario sube a `#3D3D3D` en claro y `#D9D9D9` en oscuro. Los colores de estado en oscuro son rojo `#FF8A82`, azul `#9DB5FF` y verde `#157A41` en claro.

---

## 7. Implementación sugerida
1. Reescribir `constants/index.ts` con los objetos `COLORS.light`, `COLORS.dark`, `RADIUS`, `SPACING`, `FONTS` (con la familia en una sola variable) y `TYPE`. Eliminar los tokens de NAVAJA.
2. Agregar un hook `useTheme()` basado en `useColorScheme()`.
3. Actualizar `components/ui.tsx`: Button, Chip, Card, ListRow, Avatar, StatusBadge, TimeSlot, DayChip, Ticket y BarberPole (SVG).
4. Crear `components/TurnoLogo.tsx`.
5. Estilizar los layouts de tabs (`cliente/_layout.tsx`, `barbero/_layout.tsx`, `dueno/_layout.tsx`) según la sección 3.
6. Migrar las pantallas de la sección 5 y después el resto.
7. Actualizar el ícono y el splash en `app.json` (splash: fondo `#0B0B0C` con el logo en negativo).

## Archivos
- `Turno App.dc.html`: pantallas estándar (Cliente Inicio, Mi turno y Reservar; Barbero Mi silla en claro y oscuro). Tiene el tweak `estadoTurno` para ver los 4 estados.
- `Turno App - Glass.dc.html`: variante Liquid Glass (opcional)
- `Logo C - Ticket.dc.html`: logo, versiones positiva y negativa, ícono de app
- `support.js`: runtime necesario para abrir los `.dc.html`
