# Cristal propio — el estilo de Turno (aprobado el 23 sep)

Muestra aprobada: el lienzo «Turno · Cristal propio» (copia de sus pantallas en
`docs/diseno-turno/cristal/`). Sustituye al Liquid Glass del handoff.

## La regla
**El cristal no tiene color propio: el color lo pone el fondo.** Solo se pintan
enteros los botones principales y algunas tarjetas concretas.

## Dos temas, según el teléfono
- **Día · cristal perla:** fondo `#ECEEF3`; cristal `rgba(255,255,255,.34)` con
  borde `rgba(255,255,255,.75)`; texto `#0B0B0C`, secundario `#3D3F46`, meta
  `#5A5D66`; botón principal en tinta con texto blanco.
- **Noche · cristal ahumado:** fondo `#0A0B0F`; cristal `rgba(255,255,255,.045)`
  con borde `rgba(255,255,255,.09)` (apagado, sin brillo); texto `#F4F5F8`,
  secundario `#B9BCC7`, meta `#9A9EAB`; botón principal blanco con texto negro.
- El tema se elige al abrir la app (`NOCHE` en `constants/index.ts`).

## El fondo
La luz del poste de barbero (rojo · blanco · azul en diagonal) muy
desenfocada, más un halo azul abajo: `assets/fondo-dia.jpg` y
`assets/fondo-noche.jpg`, pre-renderizados (components/fondo-glass.tsx).

## Lo que se pinta entero
- Botones principales y selección (tinta de día, blanco de noche); la pestaña
  activa de la barra es esa misma píldora.
- **Tarjeta de tu turno:** degradado rojo `#B22820` → vino `#782446` → azul
  `#243EB2`, un poco translúcido. «¡Es tu turno!» en rojo entero; «en camino»
  en azul.
- Tarjeta de Mi silla y cajas oscuras de dato (código, suscripción, reseñas).

## El poste
Solo en tres sitios: la luz del fondo, el logo, y la **barra de barbero fina**
(6 px, radio 3, bandas de 5) DENTRO de la tarjeta del turno y de «en la silla».
Nunca en el lateral.

## Formas
Tarjetas 22, filas 18, botones en píldora, tarjetas protagonistas 28. Barra de
pestañas flotante (16 de los lados, radio 36) y hojas con desenfoque real
(`expo-blur`, pide el APK 1.3.0).
