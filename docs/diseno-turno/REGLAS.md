# Turno · Reglas del sistema visual

Aprobadas el 24 sep (lámina «Reglas» del lienzo *Turno · Sistema visual Cristal*).
Existen para que no vuelva a pasar lo de las letras oscuras sobre fondo oscuro.
En código viven en `constants/index.ts` (`COLORS`, `SOBRE`, `GLASS`, `RADIO`,
`BOTON_CLARO`, `POSTE_ROJO`) y en las piezas de `components/ui.tsx`.

## Por qué pasaba
1. **Colores escritos a mano** dentro de las piezas (negro, gris, blanco al 42 %):
   al cambiar a noche o ponerlos sobre una tarjeta pintada quedaban del tono del fondo.
2. **El teléfono pintaba los controles**: la app declaraba `userInterfaceStyle: light`
   y había campos sin color de texto propio. Ahora es `automatic` y cada `TextInput`
   fija su texto, su marcador y su cursor.
3. **El cristal de noche aclaraba el fondo**: donde la luz del poste es más fuerte, el
   texto de ayuda bajaba a 3,8 : 1. Ahora el cristal de noche es ahumado.

## Regla 1 · Cada superficie trae sus colores de texto
Ocho superficies. El texto nunca elige color: lo hereda de donde está.

| Superficie | Principal | Secundario | Ayuda | Apagado | Acentos |
|---|---|---|---|---|---|
| Foto o cristal · día | `#0B0B0C` | `#3D3F46` | `#55585F` | `#55585F` | rojo `#AD1911` · azul `#1A47C8` · verde `#0F6534` |
| Hoja · día (`#F4F5F8`) | igual | igual | igual | igual | igual |
| Foto o cristal · noche | `#F4F5F8` | `#B9BCC7` | `#A1A5B2` | `#9EA2AF` | rojo `#FF7A70` · azul `#8FAEFF` · verde `#34C77B` |
| Hoja · noche (`#1B1C21`) | igual | igual | igual | igual | igual |
| Tinta `#15161C` | `#FFFFFF` | `#B9BCC7` | `#9A9EAB` | `#9A9EAB` | señales: ok `#34C77B`, azul `#8FAEFF`, pausa `#A3A3A3`, rojo `#FF7A70` |
| Degradado | `#FFFFFF` | `#F3DCE2` | `#F3DCE2` | `#F3DCE2` | — |
| Rojo `#C81E17` | `#FFFFFF` | `#FFE1DE` | `#FFE1DE` | `#FFE1DE` | — |
| Azul `#1E4FD8` | `#FFFFFF` | `#DCE4FF` | `#DCE4FF` | `#DCE4FF` | — |

Todos ≥ 4,5 : 1 medidos en el **peor punto de la foto real sin cristal**
(día rgb(200,209,238), noche rgb(63,54,66)), así valen para el texto suelto y el de
dentro de las tarjetas. En código: cristal y hojas → `COLORS.*`; superficies pintadas
→ `SOBRE.<superficie>.*`.

## Regla 2 · Prohibido
- Texto con transparencia (blanco al 40/70/86 %…).
- Grises de día dentro de una superficie pintada; oscuro sobre oscuro.
- Botón del mismo color que su tarjeta (sobre pintada, el principal es blanco con texto negro).
- Apagar con opacidad: lo apagado lleva **borde punteado** y el color «Apagado».
- `#E1251B` como texto o botón: es solo del poste y del logo (`POSTE_ROJO`).
- El cristal de noche que aclara: es ahumado (`rgba(20,21,27,.45)`).

## Regla 3 · Botones
Cinco tipos (principal, acento rojo, secundario, destructivo, apagado) y dos
tamaños: **52** (principal de pantalla u hoja) y **44** (tarjetas, filas, iconos).
Radio = alto ÷ 2. Una sola principal por pantalla o tarjeta.

| | Cristal | Superficie pintada |
|---|---|---|
| Principal | sólido (`COLORS.ink` / `onInk`) | blanco `BOTON_CLARO` |
| Acento | rojo `#C81E17`, texto blanco | rojo (solo sobre tinta y degradado) |
| Secundario | cristal fuerte + borde | contorno blanco al 60 % |
| Destructivo | cristal fuerte + texto `redText` | no se usa |
| Apagado | borde punteado `disabled` | borde punteado `SOBRE.x.dis` |

## Regla 4 · Radios
Pastilla (alto ÷ 2) · 36 hoja · 28 pintada y diálogo · 22 tarjeta de cristal, aviso,
cifras · 18 fila · 16 caja interna, día y hora · círculo. Nada más (`RADIO`).

## Regla 5 · Texto
30/700 pantalla · 24/700 hoja · 34/700 mono cifra · 17/600 tarjeta · 15/400 texto ·
14 chip y detalle · 13/500 dato · 12/500 nota · 11/700 rótulo en mayúsculas ·
11/600 pestaña y día · 16/600 y 15/600 botón. Nunca por debajo de 12 salvo esos 11.
Números (horas, puestos, códigos, dinero) en Geist Mono.

## Regla 6 · Fondo y cristal
Día: cristal blanco al 45 %. Noche: cristal ahumado al 45 %. Hojas sólidas.
Antes de publicar un cambio visual se miden todos los textos en día y en noche.
