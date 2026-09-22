# Mapa D2 — qué tablero manda en cada pantalla

Este documento existe porque el rediseño derivó, y derivó por una razón
concreta: **nunca hubo correspondencia escrita entre el lienzo y la app.**
Convertí pantalla por pantalla, de memoria, y cada interpretación fue distinta
de la anterior. Este es el documento que tenía que haber existido antes de
tocar la primera pantalla.

Mientras esto no esté acordado, no se convierte nada más.

---

## 1. El problema, en números

### El lienzo tiene 37 tableros. Solo 9 son D2.

Los otros 28 son direcciones que descartaste —A, B, C, C2, D, E— y siguen ahí,
al lado de los buenos, con el mismo aspecto de material aprobado. Cuando dices
«el mockup», hay 37 respuestas posibles y 28 son falsas.

| Dirección | Tableros | Estado |
|---|---|---|
| Original (A) | `Cliente-*`, `Barberia-*`, `Barbero-*`, `Onboarding`, `Main` | Descartada — «demasiado ruido visual» |
| B — serena | `B-Cliente-*` | Descartada — «triste y apagado» |
| C / C2 — densa | `C-Cliente-*`, `C2-Cliente-*` | Descartada |
| D — noche | `D-Cliente-*` | Base de la elegida |
| E — kiosco | `E-Cliente-*` | Descartada |
| **D2 — noche invertido** | **`D2-*` (9 tableros)** | **La elegida. Es la única que cuenta.** |

### La app tiene 29 pantallas. D2 cubre 9.

O sea: **20 pantallas no tienen tablero.** Cuando las «convertí», no estaba
aplicando el diseño. Estaba inventándolo, una por una, sin nada contra qué
contrastar. Eso es exactamente lo que se ve.

---

## 2. Las reglas de D2

Esto es lo que sí sirve para las 29 pantallas, incluidas las 20 sin tablero.
Sale de leer los 9 tableros D2, no de mi memoria.

1. **La página es clara** (`bg #FAFBFC`). No hay fondos oscuros de pantalla.
2. **Un solo objeto oscuro por pantalla**, y es el que contiene la información
   por la que se abrió esa pantalla. Dos bloques oscuros compitiendo le quitan
   el peso al que importa.
3. **Ese objeto lleva el poste** de barbería impreso arriba. Es la firma que
   ata todas las pantallas entre sí.
4. **Un solo rojo macizo por pantalla**, y es lo que se toca primero. El rojo
   no se usa para decorar, ni para teñir fondos, ni para iconos.
5. **Nada de tarjetas.** Las listas son filas apoyadas en la página, separadas
   por un filete de 1 px. Sin borde alrededor, sin sombra, sin superficie
   blanca sobre fondo claro.
6. **Los rótulos de sección** van en versalitas de 11 px, muy espaciadas, con
   una regla negra de 2 px debajo.
7. **Anton** para titulares, cifras y el botón que decide. Nunca para texto
   corrido.
8. **Esquinas cuadradas**: 4 y 6 px. El 999 se reserva a puntos y píldoras.
9. **La identidad va en cuadro teñido**, no en bloque de color macizo.

### Lo que queda con superficie a propósito

No todo lo blanco es residuo. Estos son D2, no deuda: el talón del ticket, el
cuadrado de la fecha, el chip bloqueado de «se activa cuando estés cerca», y
los chips de barbero y de día cuando están sin elegir.

---

## 3. Correspondencia pantalla → tablero

`tarjetas` = usos de `COLORS.border` que quedan. Es la medida de deuda que uso
en todo el documento.

### Cliente — 7 pantallas, 3 con tablero

| Pantalla | Tablero | Estado | Deuda |
|---|---|---|---|
| `cliente/home` | `D2-Cliente-Inicio` | Convertida | tarjetas: 4 |
| `cliente/turno` | `D2-Cliente-MiTurno` | Convertida | tarjetas: 4 |
| `cliente/perfil` | `D2-Cliente-Perfil` | Convertida | tarjetas: 3 |
| `cliente/agendar` | **ninguno** | Convertida a ojo | tarjetas: 3 |
| `cliente/historial` | **ninguno** | Convertida a ojo | tarjetas: 1 |
| `cliente/buscar-barbero` | **ninguno** | Convertida a ojo | tarjetas: 2 |
| `cliente/preferencias` | **ninguno** | Convertida a ojo | tarjetas: 0 |

### Barbero — 5 pantallas, convertidas (22 sep)

| Pantalla | Tablero | Estado | Vive en |
|---|---|---|---|
| `barbero/silla` | `D2B · Mi silla` + 20 modos + 8 hojas | **Convertida** | `mi-silla.tsx`, `tarjeta-silla.tsx`, `hojas-silla.tsx` |
| `barbero/agenda` | `D2-Barbero-Agenda` | **Convertida** (solo calendario) | `agenda-calendario.tsx` |
| `barbero/clientes` | `D2-Barbero-Clientes` | **Convertida** | la propia pantalla |
| `barbero/stats` | `D2-Barbero-Stats` | **Convertida** | la propia pantalla |
| `barbero/config` | **ninguno** | **Convertida a ojo**: menú en tres grupos y estilos D2; las secciones internas conservan su estructura | la propia pantalla |

Piezas compartidas nuevas: `components/d2.tsx` (encabezado, rótulo, pestañas,
cifras) y `components/hoja-piezas.tsx` (título, opción, dato, nota y botones
de una hoja).

### Barbería — 5 pantallas, 3 con tablero

| Pantalla | Tablero | Estado | Deuda |
|---|---|---|---|
| `dueno/dashboard` | `D2-Barberia-Equipo` | **Sin convertir** | tarjetas: 5 |
| `dueno/agenda` | `D2-Barberia-Cola` | **Sin convertir** | tarjetas: 2 |
| `dueno/stats` | `D2-Barberia-Stats` | **Sin convertir** | tarjetas: 4 |
| `dueno/config` | **ninguno** | **Sin convertir** | tarjetas: 8 |
| `dueno/barbero` | **ninguno** | **Sin convertir** | tarjetas: 6 |

### Entrada — 13 pantallas, 0 con tablero

`welcome`, `login`, `cliente-codigo`, `cliente-prefs`, `barbero-tipo`,
`barbero-donde`, `barbero-codigo`, `barbero-perfil`, `barbero-pendiente`,
`negocio-tipo`, `negocio-atiende`, `negocio-config`, `puerta-pruebas`.

No tienen tarjetas viejas, pero **tampoco tienen Anton ni rótulos D2**: están
en tierra de nadie. Es lo primero que ve alguien que instala la app.

El tablero `Onboarding` del lienzo es de la dirección A (fondo oscuro, píldoras
redondeadas, iconos en cuadros) — **no sirve**, hay que rehacerlo en D2.

### Componentes compartidos

No son pantallas pero mandan sobre varias:

| Componente | Manda en | Tablero |
|---|---|---|
| ~~`agenda-trabajo.tsx`~~ | **borrado** (22 sep): lo reemplazan Mi silla y `agenda-calendario.tsx` | — |
| `hoja-fila.tsx` | hoja de entrar a la fila | solo existe en C (descartada) |
| `estado-local.tsx` | Inicio del cliente | dentro de `D2-Cliente-Inicio` |
| `clientes-local.tsx` | barbero + dueño | `D2-Barbero-Clientes` |

---

## 4. Lo que hay que decidir antes de convertir

Estas son las preguntas que no puedo contestar yo sin volver a inventar.

**a) Las 20 pantallas sin tablero.** Tres salidas:
   1. Dibujar tablero D2 para cada una antes de tocarla. Lo más seguro, lo más
      lento.
   2. Dibujar solo las 4 que más pesan (`barbero/config` 13, `dueno/config` 8,
      `dueno/barbero` 6, y la entrada) y que el resto se derive de las reglas
      de la sección 2.
   3. Derivarlas todas de las reglas, sin tablero.

   **Recomiendo la 2.** Las pantallas de configuración son las que más deuda
   tienen y las que peor se derivan de una regla, porque son listas largas de
   ajustes heterogéneos. Las demás son listas y se resuelven con la regla 5.

**b) El distintivo de panel.** `PanelBadge` está en 8 pantallas de barbero y
   barbería y en **ninguna** del cliente. Como cliente no hay nada en pantalla
   que diga en qué panel estás. Hay que decidir si entra en las pantallas de
   cliente, y ningún tablero D2 lo dibuja.

**c) Los 28 tableros descartados.** Propongo archivarlos —moverlos a un lienzo
   aparte, no borrarlos— para que el lienzo D2 tenga 9 tableros y ninguna
   ambigüedad. **No lo hago sin que lo confirmes.**

---

## 5. Orden de conversión propuesto

Por daño visible, no por comodidad:

1. **`agenda-trabajo.tsx`** — es la pantalla en la que un barbero vive todo el
   día, y la comparten dos paneles. Tiene tablero (`D2-Barbero-Agenda`).
2. **`dueno/dashboard` + `dueno/agenda`** — lo primero que ve el dueño. Tienen
   tablero.
3. **Los dos `stats`** — tienen tablero, y son casi solo cifras: Anton hace la
   mayor parte del trabajo.
4. **`barbero/clientes`** + `clientes-local.tsx` — tienen tablero.
5. **Los dos `config`** — la mayor deuda (21 entre las dos) y sin tablero:
   aquí es donde hace falta dibujar primero.
6. **Las 13 de entrada** — sin tablero, y `Onboarding` hay que rehacerlo.
7. **La deuda que queda en cliente** (17 tarjetas repartidas).

---

## 6. Cómo se comprueba

Que no vuelva a derivar depende de que se pueda medir:

```bash
# Tarjetas viejas que quedan, por archivo
for f in $(find app components -name '*.tsx'); do
  n=$(grep -c 'COLORS.border\b' "$f"); [ "$n" -gt 0 ] && echo "$n $f"
done | sort -rn
```

Una pantalla está convertida cuando su cuenta es 0 **o** lo que queda está en
la lista de excepciones de la sección 2. No antes.
