# Tableros del cliente — propuesta v2

Rehecha sobre el concepto que fijaste:

> Mi turno sale al tablero principal. Es el nombre de la app, es la propuesta
> de valor, y es lo que debe estar primero. La tarjeta de mi turno se compone
> unificada con el estado de la barbería: una sola tarjeta.

**Mi turno › Mi barbería › Historial › Configuración.**

Lo que esto cambia de raíz: **«Inicio» deja de existir.** No como pantalla
renombrada — desaparece. Era un vestíbulo que resumía cuatro pantallas y
obligaba a pasar por él para llegar a cualquier sitio. Ahora se entra
directamente a lo que se viene a hacer.

De **7 pantallas** se pasa a **4 pestañas + 3 tarjetas**.

---

## La tarjeta unificada — el corazón de la propuesta

Un solo objeto oscuro que responde las dos preguntas a la vez: *cómo está la
barbería* y *qué tengo yo*. Hoy son dos tarjetas que compiten (y una tercera,
la fidelidad, encima). La tarjeta tiene **dos estados**, y son excluyentes:

### Estado A — no tienes turno

```
┌─────────────────────────────────────┐
│ ▨▨▨ poste ▨▨▨                       │
│ BARBERÍA DÁVILA        ● ABIERTO    │
│                                      │
│  25′          3 esperando            │
│  DE ESPERA    2 sillas · 1 libre     │
│                                      │
│ Jeison  libre   Ana  2 esperando     │
│ ─────────────────────────────────    │
│ [ FILA AHORA ]  [ AGENDAR ]          │
└─────────────────────────────────────┘
```

La cifra grande es la espera. Los dos botones son el pie de la tarjeta, no una
sección aparte: entrar a la fila *es* lo que se hace con esta información.

### Estado B — tienes turno

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ ▨▨▨ poste ▨▨▨            BD-208     │
│ EN LA FILA · BARBERÍA DÁVILA        │
│                                      │
│  3º           Corte + barba          │
│  EN LA FILA   con Jeison             │
│                                      │
│  ≈ 25′ · te toca sobre las 3:40      │
│ · · · · · · perforación · · · · · ·  │
│ [ VOY EN CAMINO ]  Cancelar          │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Ticket de verdad: perforación y muescas. La cifra grande pasa a ser **tu
puesto**, no la espera general — cuando ya estás dentro, la espera del local
deja de importar. Abajo, la gestión del turno.

**Con turno «llamado»** el ticket se vuelve rojo macizo y la cifra es
`¡ES TU TURNO!`. Es el único momento en que la pantalla grita.

---

## 1 · MI TURNO — pestaña principal

| # | Bloque | De dónde viene | Nota |
|---|---|---|---|
| 1.1 | **Tarjeta unificada** | fusión de `EstadoLocal` + ticket | El objeto oscuro. |
| 1.2 | Segundo turno («va después») | Mi turno | Ticket pequeño, sin poste. |
| 1.3 | Aviso «Tu turno expiró» | Mi turno | Si no, el turno desaparece sin explicación. |
| 1.4 | `TUS CITAS` | Inicio + Mi turno | **Se acaba el duplicado.** Vive solo aquí. |
| 1.5 | Aviso «Todavía no atienden por la app» | Inicio | Sustituye los botones de la tarjeta. |

**Cinco bloques.** Se abre la app y está todo lo que importa ahora.

Lo que **ya no** está aquí: el catálogo de barberos con precios (va a Mi
barbería), la fidelidad, el mini-historial, la cabecera de marca grande.

---

## 2 · MI BARBERÍA — barberos, servicios, fidelidad

| # | Bloque | De dónde viene |
|---|---|---|
| 2.1 | Cabecera: logo, nombre, eslogan, dirección | Inicio |
| 2.2 | Conmutador de locales | Inicio |
| 2.3 | **Tarjeta de fidelidad** | Perfil · el objeto oscuro |
| 2.4 | `VALES DISPONIBLES` | Perfil · van con la fidelidad |
| 2.5 | `EL EQUIPO` — barberos, estado, especialidad | Mi turno |
| 2.6 | `SERVICIOS Y PRECIOS` | Mi turno |
| 2.7 | **Tarjeta «agregar barbería o barbero»** | nueva · absorbe `buscar-barbero` |

Aquí es donde se mira **antes** de decidir: quién trabaja, qué cobran, cuánto
llevo acumulado. Tocar un barbero abre la tarjeta de pedir turno con él ya
elegido.

---

## 3 · HISTORIAL — visitas, gastos, reseñas

| # | Bloque | De dónde viene |
|---|---|---|
| 3.1 | **`TUS NÚMEROS`** — visitas, gastado, barbero y servicio favoritos | Perfil · el objeto oscuro |
| 3.2 | Lista de visitas con precio | Historial |
| 3.3 | Citas pasadas | Inicio · aquí sí tienen sentido |
| 3.4 | **Tarjeta de dejar reseña** | nueva · hoy es una hoja suelta |
| 3.5 | Vacío: «Aún no tienes visitas» | Historial |

Era la pantalla más vacía de las siete. Ahora tiene cuerpo, y el gasto
acumulado deja de estar escondido en Perfil.

---

## 4 · CONFIGURACIÓN

| # | Bloque | De dónde viene |
|---|---|---|
| 4.1 | Avatar, nombre, teléfono | Perfil |
| 4.2 | `MIS PREFERENCIAS` — corte, barba, alergias, notas | **absorbe `preferencias` entera** |
| 4.3 | `CUENTA` — cerrar sesión, avisos en este teléfono | Perfil |
| 4.4 | `CAMBIAR DE PANEL` | Perfil |
| 4.5 | `SIN VUELTA ATRÁS` — eliminar cuenta | Perfil |

**Sin objeto oscuro, a propósito.** Es la única pantalla que no tiene nada que
destacar: son ajustes, y todos pesan lo mismo.

Los cuatro campos de preferencias se editan **aquí mismo**. Una pantalla aparte
para cuatro campos era un viaje de ida y vuelta por nada.

---

## Las tres tarjetas nuevas

### A · Pedir turno o agendar

Una sola tarjeta con dos caminos, porque la decisión real es *ahora o después*:

```
  ¿CUÁNDO?     [ AHORA ]   [ OTRO DÍA ]
  BARBERO      Jeison · Ana · Cualquiera
  SERVICIO     Corte  RD$400 · 30 min
  PERSONAS     – 1 +
  ─────────── si es OTRO DÍA ───────────
  DÍA          hoy · mañana · vie 12
  HORA         3:00 · 3:30 · 4:00
  ─────────────────────────────────────
  [ ENTRAR A LA FILA ]   o   [ CONFIRMAR 3:00 PM ]
```

Sustituye a `cliente/agendar` **y** a la hoja de entrar a la fila. Hoy son dos
recorridos distintos para la misma decisión.

> **Riesgo que conviene que sepas:** cinco pasos son muchos para una tarjeta
> inferior corta. Propongo tarjeta **alta** (90 % de la pantalla) con scroll
> propio — que ya tiene el gesto de arrastrar hacia abajo para cerrar que
> construimos. Funcionalmente es una pantalla; para el pulgar es una tarjeta.
> Si prefieres que «Otro día» siga siendo pantalla completa, se separa.

### B · Dejar reseña

Hoy existe como hoja suelta en Historial, sin tablero. Pasa a tarjeta con
nombre propio: barbero, servicio y fecha arriba; estrellas en Anton; campo de
texto con contorno negro; «Enviar reseña» en rojo macizo.

### C · Agregar barbería o barbero

Absorbe `buscar-barbero` y el botón «+» del conmutador de locales, que hoy son
dos caminos separados para lo mismo.

```
  [ TENGO UN CÓDIGO ]     el que te dio la barbería
  [ BUSCAR BARBERO ]      por nombre
```

---

## Los favoritos se quedan puestos

Una vez configurados, barbero y servicio quedan por defecto para los próximos
turnos y citas.

**Medio construido ya, y conviene saber cuál mitad:**

| Pieza | Estado |
|---|---|
| `turno_marcar_preferido` / `turno_mi_preferido` (migración 83) | **Hecho** |
| `agendar.tsx:69` preselecciona el barbero preferido | **Hecho** |
| Servicio habitual guardado | **Falta** |
| Se aplica también al entrar a la fila, no solo a las citas | **Falta** |

Ojo con una confusión que ya existe en el código: `barberoFav` y `servicioFav`
de Perfil **se calculan del historial**, no son preferencias guardadas. Son dos
cosas distintas con el mismo nombre. Lo que se guarda es `preferido`; lo que se
deduce es `masFrecuente(...)`. La propuesta usa lo guardado, y propone el
deducido como sugerencia la primera vez.

Dónde se ve:

- **Configuración** abre con `LO QUE SE QUEDA POR DEFECTO`: dos cuadros de
  contorno con el barbero y el servicio. Es lo primero de la pantalla porque es
  lo que más ahorra.
- **La tarjeta de pedir turno** abre **ya rellena**, y lo dice con un filete
  rojo: `Rellenado con lo tuyo de siempre · cámbialo si hoy quieres otra cosa`.

> **Que esté relleno se avisa, no se esconde.** Un formulario que aparece
> completo sin decir por qué se confirma sin leer — y se pide un servicio que
> no era.

- **Mi barbería** marca al preferido con el cuadro en rojo y `TU PREFERIDO`, y
  al servicio habitual con `TU HABITUAL`. Cambiar de favorito se hace ahí,
  donde se está mirando el equipo.

---

## A dónde va cada pantalla de hoy

| Pantalla actual | Destino |
|---|---|
| `cliente/home` | **Desaparece.** Se reparte. |
| `cliente/turno` | Pestaña 1, absorbiendo el estado del local |
| `cliente/agendar` | Tarjeta A |
| `cliente/historial` | Pestaña 3, crecida |
| `cliente/perfil` | Se parte en tres: fidelidad→2, números→3, resto→4 |
| `cliente/preferencias` | Absorbida en la 4 |
| `cliente/buscar-barbero` | Tarjeta C |

---

## Consecuencias en código, para que no sorprendan

Esto no es repintar: es mover la estructura de navegación.

1. **La pantalla de entrada del cliente cambia** de `cliente/home` a
   `cliente/turno`. Toca `app/index.tsx`, `lib/paneles.ts` y el enrutado de los
   push (`cita` apunta hoy a `home`).
2. **Dos rutas se borran y una se renombra.** `home` desaparece;
   `preferencias` y `buscar-barbero` se absorben. `perfil` pasa a
   `configuracion`.
3. **`cliente/turno` se vuelve la pantalla más pesada** — absorbe
   `EstadoLocal`. Hay que vigilar que no repita el error de Inicio.
4. **Las citas dejan de estar en dos sitios**, así que las acciones
   (confirmar, reprogramar, cancelar) tienen por fin un solo hogar.

**Nada de esto entra por aire sin más**: es un cambio de pestañas y de rutas,
y conviene publicarlo de una pieza, no a trozos.

---

## Tableros a dibujar

| Tablero | Estado |
|---|---|
| `D2-Cliente-MiTurno-A` (sin turno) | nuevo |
| `D2-Cliente-MiTurno-B` (con turno) | nuevo |
| `D2-Cliente-MiBarberia` | nuevo |
| `D2-Cliente-Historial` | nuevo |
| `D2-Cliente-Configuracion` | nuevo |
| `D2-Tarjeta-PedirTurno` | nuevo |
| `D2-Tarjeta-Reseña` | nuevo |
| `D2-Tarjeta-AgregarBarberia` | nuevo |

Los tres D2 de cliente que ya existen (`Inicio`, `MiTurno`, `Perfil`) quedan
**obsoletos**: dibujaban una estructura que esta propuesta deshace.
