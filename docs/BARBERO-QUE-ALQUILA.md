# El barbero que alquila en un local que no usa la app

**Planteado:** la regla de que el barbero siempre tiene barbería obliga a quien
alquila una silla —en un local cuyo dueño no quiere la app— a crearse una
barbería que no tiene.

Fui a mirarlo. La conclusión corta: **el alta ya está bien resuelta, el modelo
es defendible, y el problema de verdad es otro — no hay puerta de vuelta.**

---

## 1 · Lo que ya está resuelto: no se le pide inventar nada

`negocio-config.tsx` **ya trata distinto** al que trabaja solo:

| | Local | Trabaja solo |
|---|---|---|
| Paso | «Tu barbería · 3 de 3» | **«Tu trabajo · 3 de 3»** |
| Título | «Datos del local» | **«Tus datos»** |
| Nombre | «Nombre del local», obligatorio | **«Cómo te ven tus clientes (opcional)»** |
| Por defecto | — | **su propio nombre** |
| Dirección | — | **no se pide** |

Y el porqué está escrito en el código:

> Trabajando solo, el nombre del sitio ES su nombre mientras no diga otra cosa.
> Obligarle a inventarse un rótulo para poder empezar es pedirle una decisión
> de marca en la pantalla de alta.

O sea: **Jeison no crea «Barbería Jeison». Crea «Jeison Reyes».** No hay
fachada inventada, ni dirección de un local que no es suyo.

## 2 · Por qué el modelo es defendible

Porque **un negocio no es un edificio: es la unidad de negocio.** Y el que
alquila una silla *es* un negocio independiente — pone sus precios, sus
horarios y cobra su dinero. Eso ya es doctrina en este repo:

- Migración 88: el dueño **no** puede cerrarle la jornada a quien le renta,
  «eso es cambiarle las horas a un negocio ajeno dentro de su propio local».
- Migración 117: la cartera del local no se la lleva el barbero, y al revés.
- Migración 93: **paga su silla sin depender de que ningún local pague por él.**

Esa última es la clave comercial: si el barbero necesitara que el local
existiera en Turno, **un local que no quiere la app lo dejaría fuera**. La rama
del «solo» existe exactamente para eso.

## 3 · Dónde sí duele — tres cosas, y solo una es grave

### a) La palabra. *(mío, barato de arreglar)*

El alta dice «tu trabajo», pero el resto de la app dice **barbería**: el
conmutador de panel pone `BARBERÍA · Jeison Reyes`, y **mis tableros dibujan un
local con logo, eslogan, dirección y un equipo de tres personas**. Para un
barbero solo eso se lee como una fachada falsa.

Es un fallo de diseño, no del modelo. La pestaña del cliente no puede llamarse
«Mi barbería» cuando detrás hay una persona.

### b) Dos que alquilan en el mismo sitio *(riesgo, sin resolver)*

Si Jeison y Miguel alquilan sillas en el mismo local físico, cada uno crea su
negocio. **Un cliente que va a ese sitio ve dos «barberías» sin relación**, en
la misma acera. Y si el dueño real se apunta después, hay un tercero.

No hay nada en el modelo que lo detecte ni que lo enlace.

### c) **No hay puerta de vuelta** *(este es el grave)*

Busqué la función que mueve un perfil de un negocio a otro. **No existe.**
`lib/db.ts` sabe cambiar el *tipo* de negocio, pero no trasladar un perfil.

Así que cuando el dueño del local **sí** se apunte a Turno —que es el final
feliz que queremos— Jeison no puede entrar en él. Tendría que empezar de cero:

| Qué pierde | Por qué |
|---|---|
| Su código de barbero | Es del perfil viejo; sus clientes tienen guardado ese |
| El historial de visitas | Cuelga del negocio anterior |
| **Los recortes de sus clientes** | La fidelidad cuelga de `negocio_id` **y** de `perfil_id` |

Lo tercero es lo que más escuece: **el cliente pierde sus recortes porque su
barbero cambió de sitio**, que desde fuera no tiene ninguna explicación.

Y esto **empeora con el tiempo**: cuantos más barberos solos haya cuando llegue
el primer local real, más caro es. Hoy es barato.

---

## 4 · Opciones

| | Qué es | Arregla | Coste | |
|---|---|---|---|---|
| **A** | Arreglar el lenguaje y los tableros: un negocio de uno se presenta como **la persona**, no como un local | a | Bajo · solo app | **Sí** |
| **B** | `negocio_id` nullable | a, b | **Muy alto** — toca RLS, jornadas, cola, fidelidad, suscripción | No |
| **C** | Bandera de «negocio de un solo barbero» para que el servidor lo sepa y la app decida (sin pedir logo, sin «agregar barbero», sin equipo) | a | Bajo · una columna | **Sí** |
| **D** | Función de **traslado de perfil** a otro negocio, definiendo qué se lleva | **c** | Medio · migración | **Sí, y pronto** |
| **E** | Detectar y enlazar negocios en la misma dirección | b | Alto, y hoy no hay dirección que comparar | No ahora |

### Por qué B no

`negocio_id` es NOT NULL y de ahí cuelga medio servidor: las políticas de
acceso, la jornada, la cola, la fidelidad y la suscripción. Hacerlo opcional
obliga a que cada una de esas piezas conteste «¿y si no hay negocio?». Se
cambia un problema de presentación por uno estructural.

### Por qué D es el que importa

Es el único daño **irreversible** de los tres. A y C son cosméticos y se pueden
hacer cuando toque. B es innecesario. Pero cada mes que pasa sin D, la deuda
crece con el número de barberos solos.

---

## 5 · Recomendación

1. **A + C ahora**, con el rediseño: el negocio de uno se llama y se dibuja como
   la persona. La pestaña del cliente deja de decir «Mi barbería» cuando detrás
   hay un barbero solo — dice **«Mi barbero»**. Sin equipo, sin logo de local,
   sin dirección de un sitio que no es suyo.
2. **D en la siguiente tanda de servidor**, junto a la pausa de fila. Hay que
   decidir primero qué se lleva un perfil al mudarse, y eso es producto, no
   código: **mi recomendación es que los recortes viajen con el barbero**, no
   con el local, porque el cliente los ganó con esa persona.
3. **(b) queda anotado como riesgo aceptado.** Hoy no se pide dirección al
   barbero solo, así que ni siquiera hay con qué detectar el duplicado. Cuando
   haya dirección, se revisa.

---

## 6 · Decidido

**Los recortes son del local solo cuando el barbero es empleado.** Si alquila
su silla o trabaja solo, son suyos y viajan con él.

No es una regla nueva: es **la misma línea que el repo ya traza para el
dinero**, aplicada a la fidelidad. Una sola pregunta —*¿de quién es el
negocio?*— contesta quién pone los precios (88), de quién es el ingreso (117),
quién paga la suscripción (93) y ahora también de quién son los recortes.

La puerta de vinculación, entera, en **`VINCULAR-BARBERO.md`**. El resumen:

- **La invitación ya existe** (`turno_invitar_barbero`, por código de barbero)
  pero llega a `(auth)/barbero-pendiente`, una pantalla de la sala de espera
  del alta: **un barbero que ya trabaja nunca la ve.**
- **Falta la dirección contraria:** que él pida entrar con el código del local
  desde sus ajustes.
- **Y falta el traslado:** aceptar crea hoy una segunda silla, no una mudanza.
  Nada dice que el perfil nuevo es la continuación del viejo.

---

## 7 · Lo que ya no está en duda

La pregunta que quedaba abierta aquí —¿los recortes son del local o del
barbero?— **está contestada** arriba. Lo que sigue abierto es más pequeño y
está en `VINCULAR-BARBERO.md` § 8: si se puede trabajar en dos sitios a la vez,
y qué pasa si el dueño echa al barbero al día siguiente de mudarse.
