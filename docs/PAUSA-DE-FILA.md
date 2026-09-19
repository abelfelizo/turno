# «Salgo un momento» — la pausa de fila

## Lo primero: esto ya existe a medias

No hay que inventarlo. El botón de pausa **ya está en el panel del barbero** y
**ya cierra la fila**:

| Pieza | Dónde | Estado |
|---|---|---|
| Botón que alterna `disponible` ↔ `descanso` | `agenda-trabajo.tsx:849` | **Hecho** |
| La fila se cierra al entrar en descanso | `agenda-trabajo.tsx:741` | **Hecho** |
| El servidor rechaza turnos nuevos | `turno_fila_abierta` → `'está en descanso'` | **Hecho** |
| El cliente ve la silla en descanso | `estado-local.tsx` | **Hecho** |
| Los bloqueos con hora de fin | `crearBloqueo(...hora_fin)` | **Hecho** |

Y encima la doctrina del repo ya lo cubre, palabra por palabra:

> «Los bloqueos son del barbero en todos los casos: solo QUITAN
> disponibilidad, nunca la inventan.» — migración 88

Una pausa es un bloqueo corto. No hay regla nueva que inventar.

---

## Lo que falta, que es exactamente lo que señalaste

### Falta 1 · La pausa no tiene reloj

`turno_fila_abierta` devuelve la cadena **`'está en descanso'`** y nada más. El
cliente no puede saber si eso son cinco minutos o dos horas.

> **Una pausa sin hora de vuelta es indistinguible de un cierre.** Si no dice
> cuándo vuelve, el cliente se va — que es justo lo contrario de para qué
> existe la pausa.

El `vuelve ~3:00` que hoy sale en el cuadro de estado viene de un **bloqueo**,
no del descanso. Son dos mecanismos distintos y solo uno tiene reloj.

### Falta 2 · Nadie avisa a los que ya están esperando

El descanso cierra la puerta a los nuevos. Los tres que ya están en la fila
**no se enteran de nada**: no les llega push, y su estimación no cambia a la
vista. Se quedan esperando a alguien que no está.

Los tipos de push que existen hoy son `turno`, `cita`, `agenda`, `equipo`,
`premio`, `bloqueo`, `jornada`, `atendido`, `sacar`, `servicios`, `acciones`,
`empleados`. **No hay ninguno de retraso.**

### Falta 3 · Es un estado, no una salida

Hoy el barbero pone «descanso» y tiene que acordarse de quitarlo. Si se le
olvida, su fila queda muerta el resto del día sin que nada se lo recuerde. Lo
que tú describes —«salir rápido»— pide **duración**, no estado.

---

## La propuesta

### En el panel del barbero: un toque y un reloj

En vez de un interruptor, una tira de opciones:

```
SALGO UN MOMENTO
[ 10 min ]  [ 15 min ]  [ 30 min ]  [ Sin hora ]
```

- Pone `estado_actual = 'descanso'` (ya funciona) **y** una hora de vuelta.
- `Sin hora` es el descanso de hoy, tal cual. Se conserva porque a veces de
  verdad no se sabe.
- Mientras está en pausa, el botón pasa a **`YA VOLVÍ`** en rojo macizo. Un
  solo toque para deshacerlo, siempre visible.

### Al activarla, tres cosas a la vez

1. **Se cierra la fila a los nuevos.** Ya pasa.
2. **Push a todos los que están en la fila:**
   `Jeison salió un momento · vuelve sobre las 3:15. Tu turno sigue en pie.`
   Un tipo nuevo: `retraso`.
3. **Las estimaciones se corren** los minutos de la pausa. Si no, la app sigue
   prometiendo una hora que ya no va a cumplir.

### Cuando se acaba el tiempo y no ha vuelto

Aquí hay una trampa que conviene no pisar:

> **La pausa NO se levanta sola.** Reabrir la fila automáticamente mete gente
> nueva a esperar a alguien que no ha vuelto. Es peor que la pausa.

Lo que pasa al vencer:
- **Al barbero** le llega un push: `¿Ya volviste? Tu fila sigue cerrada.`
- **Al cliente en la fila**, la tarjeta cambia el texto: de `vuelve sobre las
  3:15` a `debería estar volviendo`. Sin hora falsa.
- La fila sigue cerrada hasta que el barbero toque `YA VOLVÍ`.

---

## Los dos estados nuevos de la tarjeta

Se suman a los 18 ya definidos.

### E19 · Sin turno · la fila está en pausa

```
▨▨▨ poste ▨▨▨
BARBERÍA DÁVILA                  ◐ EN PAUSA
  3:15         Jeison vuelve 3:15
  VUELVE SOBRE Miguel vuelve 3:40
               Ana y Kelvin siguen atendiendo
──────────────────────────────────────────
[ ENTRAR A LA FILA ]        [ AGENDAR ]
```

**La cifra grande es la hora de vuelta.** Es el séptimo significado de esa
ranura, y encaja: es lo único que decide si esperas o te vas.

**Con más de un barbero, la pausa de uno no cierra el local.** Si todos están
en pausa, no hay botón de fila y queda `AGENDAR` solo.

> **El botón no nombra a nadie.** Con tres barberos y dos en pausa no hay un
> nombre que poner — y elegir uno por el cliente es recomendar, que no es lo que
> hace este botón.

La cifra es la hora de vuelta **del primero que vuelve**. El cuerpo lista quién
está fuera y hasta cuándo, y quién sigue atendiendo. La persona se elige dentro
de la tarjeta de pedir turno, donde el que está en pausa sale deshabilitado con
su hora.

**Y de ahí sale una regla para los favoritos:** si tu barbero de siempre es el
que está en pausa, la tarjeta no puede abrirse rellenada con él como si nada.
Se abre con él marcado y deshabilitado, diciendo hasta cuándo — y con los
demás disponibles debajo. Rellenar con alguien que no puede atenderte es peor
que no rellenar.

### E20 · Con turno · tu barbero está en pausa

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ ▨▨▨ poste ▨▨▨            BD-208   │
│ EN LA FILA · HAY UN RETRASO       │
│  3º            Corte + barba      │
│  EN LA FILA    con Jeison         │
│  ◐ Salió un momento · vuelve 3:15 │
│    Tu turno sigue en pie          │
│ · · · · · perforación · · · · · · │
│ [ VOY EN CAMINO ]      Cancelar   │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**Tu puesto no se toca.** Sigue siendo `3º`, porque la pausa no te mueve de
sitio. Lo que cambia es la línea de la estimación, que pasa a decir el motivo.

**«Tu turno sigue en pie» va escrito, no sobreentendido.** El miedo inmediato
de quien ve «el barbero se fue» es haber perdido el sitio.

Y una regla dura:

> **La ventana de llegada no corre durante una pausa.** Si te llamaron y el
> barbero se ausenta, `expira_at` se congela. Perder el turno por un retraso
> ajeno es el peor fallo posible de esta app.

---

## Qué hay que construir, por capas

| Capa | Trabajo | Tamaño |
|---|---|---|
| **Servidor** | Columna `pausa_hasta` en `turno_perfiles`; `turno_fila_abierta` devuelve la hora; congelar `expira_at` durante la pausa | migración nueva |
| **Servidor** | Push `retraso` a los que están en la fila | función + emisor |
| **Barbero** | La tira de 10/15/30/sin hora y el botón `YA VOLVÍ` | pantalla existente |
| **Cliente** | E19 y E20 en la tarjeta | tarjeta nueva, ya en el plan |

**Nada de esto entra por aire solo:** la columna y la función son migración, y
el push necesita emisor. Es la primera cosa de todo este rediseño que **no** es
solo app.

---

## Lo que hay que decidir

1. **¿Los minutos son fijos o editables?** 10/15/30 cubre casi todo y es un
   toque. Un selector de hora es más flexible y más lento — y se usa de pie,
   con prisa, que es el peor momento para pedir precisión.
2. **¿La pausa cancela las citas que caen dentro?** Creo que **no**: una cita es
   un compromiso con hora, y moverla sin preguntar es peor que el retraso.
   Pero hay que decirlo.
3. **¿Se puede entrar a la fila «para cuando vuelva»?** Dejar la puerta abierta
   llena la fila de gente que no sabe que hay retraso. Recomiendo que no, que
   es lo que ya hace hoy.
4. **¿El dueño puede pausar la silla de un barbero que le renta?** Por la
   doctrina de la migración 88, **no**: eso es cerrarle el día a un negocio
   ajeno dentro de su local. Sus empleados sí.
