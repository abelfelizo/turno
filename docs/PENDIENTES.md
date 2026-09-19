# Pendientes del rediseño

Cosas acordadas que **no** se hacen ahora, con el momento en que tocan.

---

## Para el final, cuando estén los tres usuarios

### 1 · Los diálogos de confirmación

Hoy **no hay ni uno diseñado**: son **115 `Alert.alert`** repartidos por 23
archivos, incluidos eliminar cuenta, cerrar sesión, cancelar cita y cancelar
turno. Salen con la tipografía del sistema, esquinas del sistema y botón en el
rojo del sistema. Justo en el momento más serio de la app, el diseño
desaparece.

**No se rediseñan los 115.** Son tres clases distintas mezcladas:

| Clase | Cuántos | Qué hacer |
|---|---|---|
| Destructivos e irreversibles | ~12 | **Diseñar** |
| Errores (`Intenta de nuevo`, mensajes del servidor) | ~70 | **No son diálogo**: tira bajo la cabecera |
| Confirmaciones tontas (`Guardado`, `Listo`) | ~30 | **Fuera**: si solo dicen que funcionó, se tocan sin leer |

**Lo que se construye:** un componente `<Confirmacion>` en D2 —bloque carbón,
título en Anton, consecuencias en filete rojo, botón destructivo en rojo
macizo— usado **solo en los ~12 irreversibles**.

**Por qué se diseña en vez de dejar el del sistema** (que tiene dos ventajas
reales: se reconoce como «esto va en serio» precisamente por no ser de la app,
y `style: 'destructive'` coloca el botón donde el pulgar lo espera en iOS):

> El diálogo del sistema **no puede mostrar lo que vas a perder**. Hoy dice
> «cancela tus turnos y citas futuras» en abstracto. Uno propio dice «pierdes
> 7 recortes con Jeison y 2 con Ana, y una cita el viernes a las 3:00».

Eso no es decoración: es lo que hace que la decisión sea informada. Y hay que
ganarse a mano lo que el sistema daba gratis: botón atrás de Android, lector de
pantalla, y el orden de los botones en cada plataforma.

**Momento:** al final, cuando los tres paneles estén convertidos. Antes no,
porque el inventario de los ~12 cambia según lo que sobreviva al rediseño.

---

## Resuelto al comprobarlo — no hay nada que hacer

### El barbero sin barbería

Planteado: «cuando se agrega un barbero sin barbería hay que crear una puerta
de acceso a la barbería; es preferible que los clientes tengan la barbería».

**Ya está así, y la decisión está escrita en el código** (`barbero-donde.tsx`):

> Por dentro las dos ramas acaban igual de bien: `turno_perfiles.negocio_id` es
> NOT NULL, así que el barbero **SIEMPRE** tiene un negocio. Lo que cambia es
> si se mete en uno que ya existe o si se monta el suyo de una silla.

El barbero que trabaja solo pasa por `negocio-config` y sale con **su propia
barbería de una silla**, marcada `espacios_rentados` porque en un local de uno
«alquilo mi asiento» es literalmente lo que es: manda él en sus precios y sus
horarios.

O sea: **un barbero sin barbería no existe en el modelo**, y el cliente siempre
tiene local que mirar. La puerta ya está construida.

### Reabierto y evaluado: ¿y el que alquila en un local sin app?

La regla «el barbero siempre tiene barbería» parecía obligarle a inventarse un
local. **El alta ya lo resuelve** —dice «Tu trabajo», el nombre por defecto es
el suyo y no pide dirección— pero al evaluarlo apareció un problema de verdad:

> **No existe función para trasladar un perfil de un negocio a otro.** Cuando
> el dueño del local sí se apunte a Turno, el barbero no puede entrar: tendría
> que empezar de cero y sus clientes **perderían los recortes**.

Es el único daño irreversible de los tres, y **empeora con el tiempo**. Entero
en `BARBERO-QUE-ALQUILA.md`, con las opciones comparadas.

**Decidido:** los recortes son **del local solo cuando el barbero es
empleado**. Si alquila o trabaja solo, son suyos y viajan con él — la misma
línea que el repo ya traza para el dinero.

La puerta de vinculación, especificada en `VINCULAR-BARBERO.md`.

### Lo que sí queda del tema, y es de diseño

**Mi barbería cuando el local es de una silla.** Los tableros dibujan un local
de tres barberos. Con uno solo:

- `EL EQUIPO` con una sola persona se lee raro como sección.
- El nombre puede ser el del barbero, así que la cabecera y el bloque del
  equipo dicen lo mismo dos veces.
- No hay eslogan ni, probablemente, dirección con punto de referencia.

**Es una variante de tablero, no un mecanismo nuevo.** Va cuando se dibuje el
panel del barbero, que es donde se decide cómo se presenta un local de uno.

---

## Lo que quedó fuera del frontend de cliente

El panel de cliente ya está convertido: pestañas, tarjeta unificada, hoja de
elegir, historial y ajustes. Lo que **no** entró en esa ronda:

### 1 · `agendar.tsx` sigue sin convertir a D2

Funciona y recibe `perfil` y `servicio` desde la hoja de elegir, así que la
puerta está bien puesta. Lo que le falta es el lenguaje visual: sigue con las
esquinas redondeadas y la tipografía de antes. **No se tocó a propósito**: es
la pantalla con más estado de todo el panel (día, hueco, grupo, reprogramar) y
mezclar un rediseño con el cambio de rutas es la forma de no saber cuál de los
dos rompió qué.

### 2 · La pausa de fila, del lado del servidor

La tarjeta y la hoja ya **saben** leerla —el barbero en pausa sale apagado y
con la hora a la que vuelve, y el chip de su silla se pinta en ámbar— pero el
motivo que enseñan es el que ya manda `turno_estado_barbero`. Poner la fila en
pausa desde el panel del barbero, y el aviso de retraso a quien espera, es
trabajo de migración: entero en `PAUSA-DE-FILA.md`.

### 3 · Reseñas e historial siguen siendo de UN local

`getHistorialCliente` filtra por `negocio_id`, así que «TUS NÚMEROS AQUÍ»
dice la verdad —son los de este local— pero el cliente que va a dos barberías
no tiene dónde ver su total. (`getMisResenas` sí es de la persona entera, y no
pasa nada: solo se usa para tachar las visitas ya calificadas, y una visita
solo existe en el local donde pasó.) Va cuando se decida qué es de
la persona y qué del local, la misma pregunta que `BARBERO-QUE-ALQUILA.md`
contesta para los recortes.

### 4 · El próximo hueco solo mira HOY

Con el local trabajando únicamente con cita, la cifra grande enseña la hora
del primer hueco libre de hoy. Si no queda ninguno dice que no quedan, y para
otro día está el botón de reservar. Mirar mañana ahí dentro convertiría la
cifra principal en un dato que no se puede usar sin abrir la agenda igual.

---

## Ya anotado en otros documentos

| Qué | Dónde |
|---|---|
| El traslado de perfil entre negocios | `BARBERO-QUE-ALQUILA.md` |
| La pausa de fila (migración + push `retraso`) | `PAUSA-DE-FILA.md` |
| El rojo `redSoft` → `#FF4438` en `constants/index.ts` | `TARJETA-ESTADOS.md` § 2 bis |
| Servicio habitual guardado + favoritos en la fila | `TABLEROS-CLIENTE.md` |
| Gestos que piden APK nuevo (gesture-handler, swipe entre pestañas, splash) | `CONTEXT.md` |
| La guarda de panel, sin publicar | commit `5e42fe6` |
| El panel de barbero y el de barbería, sin convertir | `MAPA-D2.md` |
