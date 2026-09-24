# Tableros del barbero — propuesta v1

> **Decidido (22 sep):** cinco pestañas · **ningún dinero en Mi silla**, solo
> en su pestaña · esa pestaña se llama **Estadísticas**, no «Números» · se
> empieza por **Mi silla**. Antes de los tableros en limpio van los bocetos:
> Mi silla, los 20 modos de su tarjeta y sus 8 ventanas emergentes, en el
> lienzo de diseño junto a los del cliente.
>
> **Mi silla, en limpio (22 sep):** once tableros `D2B-*` en el lienzo —la
> pantalla libre (A) y con alguien en la silla (B), la lámina de los 20 modos
> de su tarjeta, y las 8 hojas: cobrar, no está, menú de una persona, atender
> sin cita, salgo un momento, ficha, cambiar de local y la cita—. Enlazados
> entre sí para recorrerlos en modo Play. La tarjeta copia la anatomía de
> `components/tarjeta-turno.tsx` tal como está programada, no como se dibujó
> antes: si tablero y código discrepan, manda el código.

El mismo método que con el cliente: primero qué va en cada pestaña y qué no,
después los tableros, después los estados, y al final el código. Esto es solo
lo primero. **No hay nada dibujado ni tocado todavía.**

---

## Lo que hay hoy

Cuatro pestañas: **Agenda · Stats · Clientes · Config.**

| Pantalla | Líneas | Qué hace |
|---|---|---|
| Agenda (`components/agenda-trabajo.tsx`) | 1.869 | Casi todo: selector de día, estado de la silla, pausa, fila en vivo, llamado, en la silla, citas del día, citas sin cerrar de días pasados, horas bloqueadas, jornada (alargar / adelantar / cerrar), cambio de local, código de barbero, distintivo de panel |
| Stats | 231 | Ingresos por periodo, visitas, clientes, ticket medio, reseñas, lista de visitas |
| Clientes | 406 | Lista, «por recuperar», ficha (cómo le gusta, alergias, nota privada, últimas visitas) |
| Config | 1.239 | 13 bloques: perfil público, código, suscripción, servicios, horario, reglas, tiempos, fidelidad, locales, cuenta, borrar cuenta… |

### El problema de fondo es el mismo que tenía el cliente

**La Agenda mezcla AHORA con CALENDARIO.** El propio código lo confiesa
(`agenda-trabajo.tsx:790`):

> «tocabas un jueves, el cuadro de arriba seguía enseñando la fila de hoy
> —porque la fila en vivo es de hoy, no del jueves— y la conclusión razonable
> era que el selector no servía para nada.»

Se arregló escondiendo el cuadro vivo cuando no es hoy, que es un parche: la
pantalla sigue siendo dos cosas con un solo selector de día arriba. Una
responde **«¿quién sigue?»** —la pregunta que el barbero se hace cincuenta
veces al día— y la otra **«¿qué tengo el jueves?»**, que se hace dos.

En el cliente el movimiento fue sacar el turno al frente porque es la razón de
que exista la app. **Para el barbero la razón es la silla.**

---

## La propuesta: cinco pestañas

```
MI SILLA   ·   AGENDA   ·   CLIENTES   ·   ESTADÍSTICAS   ·   AJUSTES
  ahora       calendario     personas       dinero       reglas
```

### 1 · MI SILLA — pestaña principal, y solo HOY

Una tarjeta oscura, la única de la pantalla, igual que la del cliente. Manda
lo que está pasando en la silla, en este orden de prioridad:

| Si… | Manda |
|---|---|
| hay alguien sentado | **EN LA SILLA** — nombre, servicio, los relojes (lleva / le queda), `COBRAR` |
| llamaste a alguien | **LLAMADO** — cuenta atrás de llegada, `ATENDIENDO` · `+5` · `NO ESTÁ` · `AVISAR` |
| hay una cita ahora | **CITA DE AHORA** — `ATENDIDA` · `NO LLEGÓ` · `ESCRIBIRLE` |
| la silla está libre | **LIBRE** — cuántos esperan, `LLAMAR AL SIGUIENTE` |
| estás en pausa | **EN PAUSA · vuelve 3:15** — `YA VOLVÍ` en rojo macizo |

La cabecera de la tarjeta es **el local**, y si trabajas en dos sitios, es el
conmutador: el mismo patrón que la tarjeta del cliente. Hoy está en un
desplegable gris encima de todo.

Debajo, en claro:

- **LA FILA** — quién espera, en orden, con su servicio y cuánto lleva. El
  menú de cada uno (sacar, devolver, cambiar servicio) se queda como está.
- **LO QUE QUEDA HOY** — las citas pendientes de hoy, solo las que faltan.
- **SALGO UN MOMENTO** — la pausa con reloj: `10 min · 15 · 30 · sin hora`.
  Está decidida en `PAUSA-DE-FILA.md` y la mitad ya funciona (el interruptor
  de descanso); lo que falta es del servidor.
- **ATENDER SIN CITA** — el que entra por la puerta. **No entra a la fila:
  se le atiende ahora o no se le atiende** (decidido 22 sep):
  - Si **alguien espera EN el local** (fila física, o de la app que ya dijo
    que llegó), el botón **se apaga** y dice a quién se está respetando. Un
    botón que solo sirve para descubrir que no se puede es peor que ninguno.
  - Si los que esperan **están en la app y aún no han llegado**, se enciende.
  - **«Si tiene el tiempo»** depende del servicio, así que se decide dentro de
    la hoja: los servicios que no caben antes de su próxima cita salen
    apagados, con el motivo. A los de la app se les corre la espera, y se dice.
  - No hace falta nada de servidor: `atenderSinCita` ya sienta directo. La
    regla vive en la pantalla; el servidor sigue dejándolo, y eso es
    deliberado — la silla es del barbero.

**Lo que sale de aquí:** el selector de día, las horas bloqueadas, la jornada,
las citas sin cerrar de otros días, el código de barbero y el distintivo de
panel. Nada de eso es de ahora.

### 2 · AGENDA — el calendario

- Selector de día arriba, y ahí sí manda: lo que eliges es lo que ves.
- Las citas de ese día, con su estado dicho con palabras (eso ya está hecho y
  bien: `FRASE_CITA`).
- Las horas bloqueadas de ese día, con `BLOQUEAR HORA`.
- La jornada de ese día: `CIERRO MÁS TARDE` · `EMPIEZO ANTES` · `NO VENGO`.
- **SIN CERRAR** — las citas de días pasados que nadie marcó. Hoy salen en la
  agenda de cualquier día; aquí van arriba y en rojo mientras haya alguna,
  porque son dinero que no se contó.

### 3 · CLIENTES — casi como está

Tiene tablero D2 y la estructura es buena: `Todos` · `Por recuperar`, y la
ficha. Lo que cambia es de diseño, más una cosa:

- **Los botones de contacto que pediste para el cliente van también aquí**:
  WhatsApp y llamar, en la línea de cada cliente, solo si dejó el dato.

### 4 · ESTADÍSTICAS — lo que hoy es «Stats»

- El ingreso del periodo en grande, con `7 días · 30 días · Todo`.
- **De dónde vino**: fila / citas / sin cita. Está en el tablero D2 y no en el
  código.
- **Por servicio**: qué te da de comer. También solo en el tablero.
- Tus reseñas y tu nota.

El nombre: «Stats» es una palabra de programador. «Números» es lo que dice un
barbero cuando cuenta la caja.

### 5 · AJUSTES — lo que hoy es «Config», ordenado por quién decide

Los 13 bloques de hoy están en el orden en que se fueron añadiendo. Van en
tres grupos:

```
QUIÉN SOY          lo mío, viaja conmigo a cualquier local
  Perfil público   nombre, foto, especialidad, bio, WhatsApp, Instagram
  Mi código        para que los clientes me agreguen · COMPARTIR

CÓMO TRABAJO       depende de si eres empleado o no
  Servicios y precios
  Horario
  Reglas y tiempos
  Fidelidad

DÓNDE Y CUENTA
  Mis locales      los que tengo, invitaciones pendientes, unirme con código
  Suscripción      solo si pagas la tuya
  Cambiar de panel
  Cuenta · Sin vuelta atrás
```

---

## Los tres barberos, y dónde se nota la diferencia

Decidido en esta sesión: **del local, solo cuando es empleado**; si alquila o
trabaja solo, **todo viaja con él**, precios y servicios incluidos.

| | Empleado | Alquila silla | Independiente |
|---|---|---|---|
| Mi silla · Agenda · Clientes · Números | **igual** | **igual** | **igual** |
| Servicios y precios | los ve, no los toca | los pone él | los pone él |
| Horario | los ve, no lo toca | lo pone él | lo pone él |
| Fidelidad | la activa y la paga el local | la activa y la paga él | la activa y la paga él |
| Suscripción | no la ve | la suya | la suya |

**La consecuencia estructural:** el día a día es idéntico para los tres. Toda
la diferencia vive en un solo sitio —«Cómo trabajo» en Ajustes— y ahí el
empleado ve los bloques en modo lectura, con una línea que dice **quién los
pone**. El código ya lo hace así (`config.tsx:281`, la variable `empleado`);
lo que cambia es el orden y el diseño, no la lógica.

---

## Lo que ya encontramos que falta, y dónde cae

| Hueco | Pestaña | Tipo |
|---|---|---|
| La pausa no tiene reloj ni avisa a la fila | Mi silla | Servidor — `PAUSA-DE-FILA.md` |
| Las estrellas se quedan en el local al irse | Números | Servidor — `turno_resumen_resenas` agrega por perfil y no por persona |
| `unirseProfesional` siempre entra como empleado | Ajustes · Mis locales | Servidor + pantalla |
| La puerta para vincular a un independiente con un local que llega después | Ajustes · Mis locales | `VINCULAR-BARBERO.md` |
| «De dónde vino» y «por servicio» | Números | Solo pantalla: los datos ya están en las visitas |

---

## Tres decisiones antes de dibujar

### 1 · ¿Cinco pestañas, o Mi silla y Agenda juntas?

**Recomiendo cinco.** El pro de juntarlas es una pestaña menos. El contra es
el que ya está pasando: una pantalla con dos significados según el día que
toques. Cinco pestañas es el máximo cómodo en un teléfono, pero cabe, y cada
una responde a una sola pregunta.

### 2 · ¿El dinero de hoy en Mi silla?

«Hoy llevas RD$ 3.400 · 6 cortes» es lo que un barbero más consulta después de
«quién sigue». **Pero el teléfono se le enseña al cliente** —para que vea su
puesto, para que se agregue con el código— y una cifra de dinero en esa
pantalla es algo que muchos no quieren enseñar.

**Recomiendo dejarlo solo en Números.** Si lo quieres a mano, la alternativa
es ponerlo oculto hasta que se toque.

### 3 · El orden de construcción

**Recomiendo empezar por Mi silla.** Es donde el barbero vive el día, es la
más rota (la mezcla de ahora y calendario) y es la que más gana. Las otras
cuatro son sobre todo diseño encima de una lógica que ya funciona.

---

## Lo que viene después de esto

1. Que ajustes o confirmes esta estructura.
2. Los tableros, empezando por Mi silla, en el mismo lienzo del cliente.
3. Los estados de la tarjeta de Mi silla, como las 20 del cliente.
4. El código.

---

## En código (22 sep)

Mi silla ya está en la app, en el panel del barbero, como primera de las
cinco pestañas: **Mi silla · Agenda · Clientes · Estadísticas · Ajustes**.

| Pieza | Qué hace |
|---|---|
| `lib/silla.ts` | Decide el modo de la tarjeta (los 20 del tablero), la regla del que entra sin cita, si un servicio cabe antes de la próxima cita, la pausa. Función pura, sin pantalla. |
| `scripts/probar-silla.mjs` | Un caso por modo + las prioridades + la regla sin cita + «si tiene el tiempo». `TZ=America/Santo_Domingo node scripts/probar-silla.mjs`. Probado también contra una copia estropeada: falla como debe. |
| `components/tarjeta-silla.tsx` | Dibuja el modo. No decide nada. |
| `components/mi-silla.tsx` | La pantalla: carga, tiempo real, reloj, y todas las acciones de la agenda portadas una a una con sus reglas y sus avisos. |
| `components/hojas-silla.tsx` | Las ocho hojas del tablero (cobrar, no está, sin cita, persona, cita, salgo, local, ficha) más sacar y cambiar servicio. |
| `app/(app)/barbero/_layout.tsx` | Las cinco pestañas; se rehacen enteras al cambiar de local, como en el cliente. |

**La agenda** (`AgendaTrabajo soloCalendario`) deja de enseñar el cuadro de
AHORA —estado, fila, llamar, sin cita—, que vive en Mi silla. De hoy le queda
una fila, «Tu jornada de hoy», porque abrir antes / alargar / cerrar por hoy
solo se alcanzaban desde aquel cuadro y no se podían perder.

**Salgo un momento** no necesita nada nuevo del servidor: es el descanso (que
cierra la fila a los nuevos) más un bloqueo corto con el motivo
`Salgo un momento` (que pone la hora de vuelta, y el servidor ya la devuelve
como `hasta`). Si pasa la hora, la fila no se reabre sola: la tarjeta pregunta.

**En el cliente**, una silla en pausa se veía como CERRADO: el servidor manda
el descanso como `fila_abierta = false`. Ahora la tarjeta del cliente la
cuenta como pausa: «EN PAUSA · VUELVE SOBRE 3:15», y el chip de la silla dice
«vuelve ~3:15» en vez de «cerrado».

### Decidido el 22 sep

- **Migración 118 — aplicada.** El que entra sin cita respeta a quien ESTÁ en
  el local (fila física, «ya llegué», llamado o en camino, doble servicio),
  no a quien espera en la app sin haber llegado. Probada contra la base
  antes y después (suites `sin_cita` 27/27 y `motor_cola` 34/34). La app
  sigue la misma regla (`REGLA_WALK_IN = 'nadie_presente'`). Para volver
  atrás: `supabase/rollback_118_turno_atender_sin_cita.sql`.
- **Precios en las hojas — se quedan.** La tarjeta y la pantalla de Mi silla
  siguen sin dinero; las hojas de cobrar, sin cita y la ficha lo enseñan.

## Las otras cuatro pestañas, en código (22 sep)

| Pestaña | Qué cambió |
|---|---|
| **Agenda** | Componente nuevo, `components/agenda-calendario.tsx`: solo calendario. Selector de día arriba (manda), SIN CERRAR arriba y en rojo, la jornada (hoy se cambia; otro día solo se enseña), citas y horas bloqueadas del día con sus hojas, bloquear una hora, y el código de barbero para compartir. |
| **Clientes** | D2. Pestañas Todos / Por recuperar, buscador por nombre, WhatsApp y llamar en cada línea (solo con teléfono real), los días sin venir en rojo, el umbral (`revisita_dias`) dicho arriba, y un aviso a todos los por recuperar que enseña el texto exacto antes de mandarse. |
| **Estadísticas** | D2. Todo sale de las mismas visitas del periodo (`getVisitasPerfil`): ingresos, comparación con el periodo anterior, visitas / clientes / ticket, **de dónde vinieron** (citas · fila por la app · en el local) y **por servicio**, tu calificación y la lista. |
| **Ajustes** | Menú en tres grupos —Quién soy · Cómo trabajo · Dónde y cuenta— y estilos D2. La lógica de cada sección no se tocó. |

**«Sin cita» no se puede separar en Estadísticas.** El que entra sin cita se
registra como `cola_fisica`, igual que la fila presencial, así que el reparto
dice «En el local» y no «Sin cita»: afirmar lo segundo sería inventar un dato.
Separarlos pide que la visita guarde la prioridad (3 = sin cita); es una
migración pequeña, anotada aquí y sin hacer.

**`components/agenda-trabajo.tsx` — borrado** (22 sep, con visto bueno): ya
no lo usaba ninguna pantalla. Sigue en la historia de git si hiciera falta.

## Empleado frente a independiente, comprobado (23 sep)

Cinco sillas de prueba (empleado sin permiso, empleado con permiso, dueño que
atiende, alquila silla, independiente) × 25 acciones, contra la base y dentro
de una transacción que se revierte. En el día a día la pantalla ofrece
exactamente lo que el servidor acepta a cada una. Lo que no cuadraba:

1. **El independiente no veía sus puntos** en ningún panel — arreglado en
   Ajustes (`puntosPropios`: alquila, o es dueño de un local de alquiler).
2. **Su suscripción decía «va dentro del plan del local»**, y en un local de
   alquiler cada silla paga la suya — arreglado en `lib/pricing.ts`.
3. **🔴 La tabla de la fila estaba abierta por detrás**: un cliente podía
   insertarse con prioridad 1 o marcar su turno como atendido (visita y
   puntos regalados). Migración **119 aplicada** el 23 sep: suite
   `supabase/tests/fila_a_mano.test.sql` 14/14 contra la base, y `sin_cita`
   (27/27) y `motor_cola` (34/34) siguen en verde. Vuelta atrás en
   `supabase/rollback_119_…sql`.

   Nota de las pruebas: `sin_cita` tiene dos casos que dependen de la hora
   («el primer hueco respeta 1 h» y «reservar a 70 min se niega»). Pasadas
   las 23:00 fallan porque la hora cae al día siguiente, no por la regla; con
   el local movido a un huso de mediodía da 27/27. Conviene fijarle el huso
   como a `obstaculos` y `madrugada`.
4. El empleado podía encender su propia tarjeta de puntos (sin efecto). Lo
   cierra la misma 119.
