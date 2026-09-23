# Aplicar la línea gráfica de Turno — plan

> Handoff recibido el 23 sep (`docs/diseno-turno/`). Regla del encargo:
> **se cambia cómo se ve, no qué hace**. Ninguna función, consulta, regla,
> texto de estado del servidor ni navegación cambia. Si un mock enseña algo
> que la app no tiene, se dibuja lo que la app SÍ tiene con ese lenguaje.

## Lo que dice el diseño, en una línea

Neutros puros (blanco / negro) mandan; **rojo `#E1251B` y azul `#1E4FD8` solo
de acento**. Radio 8 en todo. Geist para la interfaz, **Geist Mono para todos
los números**. El poste de barbero (−55°, rojo · blanco · azul · blanco) solo
en tres sitios: el logo, el talón del ticket activo y el estado «en la silla».
Adiós a NAVAJA (Anton, Plus Jakarta, carbón, mayúsculas espaciadas).

## Lo que la app tiene y el mock no (se mantiene)

| En el mock | En la app, y se queda así |
|---|---|
| Cliente: pestañas Inicio · Mi turno · Historial · Perfil | Mi turno · Mi barbería · Historial · Ajustes |
| Barbero: Agenda · Stats · Clientes · Config | Mi silla · Agenda · Clientes · Estadísticas · Ajustes |
| «Terminar y llamar siguiente» (un botón) | Cobrar y Llamar son dos acciones (lib/silla.ts, 20 modos) |
| «de 5 personas en la fila», «Nº 07» | puesto + código real del turno (A-27) |
| «Confirmar» cita desde Inicio | lo que la app ofrezca en ese momento |
| Panel del dueño, Stats, Clientes, Ajustes, entrada | no están dibujados: se aplican los mismos tokens y piezas |

## Cómo se hace sin romper nada

La app lee sus colores y fuentes de `constants/index.ts` (1.110 usos). El
primer paso **reasigna esos mismos nombres** a la paleta nueva: toda la app
cambia de color de golpe sin tocar pantallas, y cada pantalla se afina
después. Se hace por fases, cada una publicable sola y reversible
(`desde = <commit anterior>`).

| Fase | Qué | Riesgo | ¿Actualización o APK? |
|---|---|---|---|
| 0 | Tokens nuevos (claro, y oscuro preparado) · fuentes Geist + Geist Mono · alias de los nombres viejos | bajo: solo color y letra | actualización |
| 1 | Piezas compartidas: botones, chips, filas, rótulos, hojas, barra de pestañas, **poste a −55°**, **logo ticket** (con vistas, sin SVG) | medio | actualización |
| 2 | Las dos tarjetas (cliente y Mi silla) con el lenguaje del ticket: tinta, talón del poste, número en mono. **La lógica de los 20 modos no se toca** (lib/silla.ts) | medio | actualización |
| 3 | Pantallas: cliente → barbero → dueño, una por una | bajo cada una | actualización |
| 4 | Entrada (13 pantallas) | bajo | actualización |
| 5 | Modo oscuro según el sistema | medio: toca cómo se leen los estilos | actualización |
| 6 | Ícono de la app y splash con el logo | — | **APK** |
| 7 | Variante Liquid Glass (opcional, tema aparte) | alto | **APK** (`expo-blur`) |

Sin librerías nativas nuevas hasta la fase 6: el poste y el logo se dibujan
con vistas (como el poste de hoy), los íconos siguen siendo Ionicons
(equivalentes de los del mock), y las fuentes Geist viajan en la
actualización como cualquier recurso.

## Hecho (23 sep) — primera entrega: fases 0, 1 y 2

Decidido: **estándar primero, Liquid Glass después**; oscuro preparado pero
sin activar; rótulos solo en español.

- **Tokens** (`constants/index.ts`): los nombres de siempre con la paleta
  nueva (tinta `#0B0B0C`, rojo `#E1251B`, azul `#1E4FD8`, grises del
  handoff), `COLORS_OSCURO` listo, `FONTS` en Geist + Geist Mono (`mono`,
  `monoMedium`), `RADIUS` a 8.
- **Fuentes**: `@expo-google-fonts/geist` y `geist-mono` (van en la
  actualización como recursos; comprobado con `expo export`). Anton y Plus
  Jakarta ya no se cargan.
- **Piezas**: `Display`, `Avatar` (circular), botones, chips, badge, poste
  (−55°, 4 bandas, horizontal o vertical), `Ticket` con talón,
  `components/turno-logo.tsx` (logo ticket con vistas, sin SVG), `d2.tsx`
  (encabezado, rótulo sin raya, segmento de chips, cifras en mono),
  `hoja-piezas.tsx`, hoja con radio 8, barra de pestañas, distintivo de panel.
- **Tarjetas**: cliente — talón del poste y muescas mientras esperas, franja
  arriba en la silla, rojo si te llaman, azul si vas en camino, puesto en mono
  con dos cifras («03»); silla — franja solo en «EN LA SILLA». La lógica de
  los modos no se tocó (`lib/silla.ts`, `probar-silla` en verde).
- **Barrido mecánico**, solo estilos: 32 titulares que eran Anton en
  mayúsculas pasan a frase normal; 44 radios a 8; 27 bordes negros de 2 px a
  borde fino gris.

Pendiente de la fase 3, pantalla por pantalla: cifras que siguen en la letra
de titular en vez de mono, botones cuadrados, y los postes que aún decoran
cabeceras (bienvenida, entrar, historial, agenda, estadísticas, estado del
local): el handoff los quiere solo en tres sitios.

## ~~Segunda entrega: el panel del administrador completo~~ (deshecha por el v3)

> Se revirtió al llegar el handoff v3: rehacía el JSX del administrador con
> piezas nuevas, y el v3 prohíbe tocar JSX. Queda como historia (commit
> `1ca799f`).

Pedido: «todavía hay una mezcla de estilos, construye la versión de
administrador completa». Las seis pantallas del dueño se rehicieron con **un
solo juego de piezas**, así que ya no queda nada del estilo D2 (cajas de
carbón, bordes de 1,5–2 px, rótulos en mayúsculas espaciadas, cifras en letra
de titular). **La lógica no cambió**: mismas consultas, mismas acciones, mismos
avisos y textos de confirmación (comprobado que cada acción de antes sigue
conectada en su pantalla).

- **`components/turno-ui.tsx`** (nuevo): fila de lista con separador de 1 px,
  avatar de iniciales, número de puesto en mono, estado en color, tarjeta
  (borde 1, radio 8, sin sombra), aviso, botones del handoff (primario tinta,
  acento rojo, secundario y destructivo con borde), chip, badge, buscador,
  botón de icono, nota, interruptor (encendido en tinta), etiqueta + campo
  (alto 52), paso a paso, icono de fila y overline.
- **Mi local**: aviso de solicitudes como tarjeta, sillas y fila como listas
  con avatar y estado a la derecha, cifras en mono.
- **Equipo**: solicitudes en tarjeta clara (Rechazar con borde, Aprobar en
  tinta), equipo con avatar, rol en la meta y estado; código del local en mono.
- **Ficha de la silla**: cabecera con avatar, modalidad con chips, servicios
  con precio en mono e interruptor, horario en mono, acciones como filas con
  icono y **Desvincular** como botón destructivo con su consecuencia debajo;
  hojas con campos y pasos nuevos.
- **Clientes**: buscador y chips del handoff, avatar por cliente, WhatsApp y
  llamar como botones de icono, días sin venir en mono; la ficha con el gasto
  en un bloque en mono.
- **Estadísticas**: cifra grande en tarjeta y en mono, variación en verde o
  rojo, barras finas redondeadas (tu silla en rojo, el resto en tinta),
  origen como lista con porcentaje en mono.
- **Ajustes**: menú con icono gris, secciones con campos, interruptores y
  pasos nuevos; suscripción en tarjeta clara con estado por punto de color;
  «Cerrar este local» como botón destructivo (antes, caja roja).
- Compartidas que usa el panel: `cambiar-rol`, `selector` y `resenas`
  (también se ven así en el panel del barbero).

Verificado: `tsc` 0 errores, babel 79 archivos 0 errores, hooks antes de las
guardas OK, `probar-silla` OK, `expo export` Android OK. Sin librerías nativas
nuevas: va por actualización. Vuelta atrás: publicar desde `4cde52b`.

Pendiente (fase 3): las pantallas del barbero y del cliente con estas mismas
piezas; las hojas de la fila y de Mi silla (`hoja-fila`, `hoja-pedir`,
`hojas-silla`) aún llevan cifras en letra de titular.

## Hecho (23 sep) — handoff v3: solo estilos, en toda la app

El v3 (`docs/diseno-turno-v3/README.md`) **reemplaza a v1 y v2** y cambia el
método: *solo se tocan estilos*. Nada de JSX, textos, lógica ni componentes
nuevos en las pantallas. Así se aplicó:

1. **El administrador vuelve a su estructura** (la de `4cde52b`), igual que
   `cambiar-rol`, `selector` y `resenas`; `components/turno-ui.tsx` se retira.
   El distintivo de panel vuelve a la píldora de color del v3.
2. **Base**: `constants/index.ts` con `THEME` (claro y oscuro), `TYPE`,
   `ESTADO_COLOR`, `FONTS.mono` (500) y `FONTS.monoBold` (700) y los nombres
   viejos como alias con los valores del v3. `components/ui.tsx` con la API
   del v3 (`useTheme`, `StatusText`, `TimeSlot`, `DayChip`, `ListRow`,
   `QueueNumber`, `Button` con `accent` y `destructive`, `Avatar` de dos
   iniciales, `Chip` activo en negro).
3. **Bloques exactos del v3** en las claves que existen hoy: `hoja-fila`,
   `cliente/turno`, `cliente/barberia` (lo que era Inicio), el calendario del
   barbero (lo que era `agenda-trabajo`) y Mi local (lo que era la cola del
   dueño). El resto del paquete describe archivos que ya no existen.
4. **Reglas mecánicas del paso 3** en los 47 archivos, solo dentro de
   `StyleSheet.create` y en props de color: números en Geist Mono, títulos en
   Geist, `extrabold`/`bold`/`medium` según la tabla, bordes de 1,5 y 2 px a 1,
   radios a 8 (hojas a 16), fuera filetes laterales y sombras, rojo solo en el
   CTA final (reservar, entrar a la fila, confirmar en una hoja) y en el hueco
   de hora elegido, botones de borrar como destructivos (borde gris, texto
   rojo), selección en negro, colores de estado del v3, cargadores en negro y
   márgenes de pantalla a 20.

Criterios propios, dentro de la regla:
- **Pantallas oscuras** (bienvenida, entrar, registro, error): el botón
  principal en negro sobre fondo negro no se vería; ahí va **invertido**
  (blanco con texto negro), como el logo en negativo del splash del v3.
- **`COLORS.surface` sigue siendo blanco**: en las pantallas siempre quiso
  decir «fondo de tarjeta», que es lo que el v3 pide (blanco con borde). El
  gris es `surfaceAlt`.
- **Sin `react-native-svg`**: es nativa y no está en el APK; con
  `runtimeVersion: appVersion` una actualización que la importe cerraría la
  app al abrir. Poste y logo siguen hechos con vistas. Se cambia con el APK.
- `tabs.tsx` conserva `elevation: 0` y `shadowOpacity: 0`: apagan la sombra
  por defecto (el `useTabOptions` del v3 hace lo mismo).

Pendiente de decidir (tocan JSX; el v3 dice «anótalo y pregunta»):
- **Postes decorativos** que el v3 quiere solo en logo, talón y «en la
  silla»: bienvenida, entrar, agendar, historial, estadísticas del barbero,
  agenda del barbero y estado del local.
- Los botones rojos **dentro de las tarjetas** de Mi turno y Mi silla se
  quedaron rojos (sobre la tarjeta negra un botón negro no se vería).

Verificado: `tsc` 0, babel 78 archivos 0 errores, hooks OK, `probar-silla`
OK, `expo export` Android OK, grep de verificación del v3 limpio salvo la
sombra apagada de `tabs.tsx`. Vuelta atrás: publicar desde `1ca799f` (o
`4cde52b`).

## Decisiones abiertas (ya resueltas arriba)

1. **Estándar o Glass.** El handoff dice que Glass es opcional y no reemplaza
   al estándar. Recomendación: estándar ahora (va por actualización), Glass
   después como tema si se confirma (pide APK por `expo-blur`).
2. **Modo oscuro.** Recomendación: tokens listos desde la fase 0, activado en
   la fase 5, cuando lo claro esté visto en el teléfono.
3. **Rótulos bilingües** («TU POSICIÓN · YOUR SPOT»). El handoff los pide en
   los estados protagonistas. Es solo texto; se puede dejar en español.
