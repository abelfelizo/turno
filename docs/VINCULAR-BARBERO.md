# Vincular a un barbero independiente con una barbería

**Decidido:** los recortes son **del local solo cuando el barbero es
empleado**. Si alquila su silla o trabaja solo, son suyos y viajan con él.

Y hay que construir la puerta para que un independiente entre en un local que
se dio de alta después que él.

---

## 1 · Por qué la regla es la correcta

Porque **no es una regla nueva: es la misma línea que el repo ya traza para el
dinero**, aplicada a la fidelidad.

| | Empleado | Alquila su silla |
|---|---|---|
| Quién pone los precios | El local | **Él** (migración 88) |
| De quién es el ingreso | Del local | **Suyo** (migración 117) |
| Quién le fija el horario | El local | **Él** |
| Quién paga la suscripción | El local | **Él** (migración 93) |
| **De quién son los recortes** | **Del local** | **Suyos** |

Una sola pregunta —*¿de quién es el negocio?*— contesta las cinco. Eso es lo
que hace que la regla se pueda explicar en una frase y que nadie tenga que
recordar una excepción.

---

## 2 · Lo que ya está construido

**La invitación existe, y está bien hecha.** `turno_invitar_barbero(negocio,
codigo)`:

- Identifica al barbero por su **código**, que es único y ya sale en su
  pantalla. El comentario dice por qué no por teléfono ni correo: *«eso dejaría
  barrer la tabla de usuarios probando números»*.
- Queda **pendiente de que él acepte** — *«invitar no es meter a nadie»*.
- Y ya hay `turno_responder_invitacion` para el sí o el no.

El dueño la usa desde `dueno/dashboard.tsx:153`.

---

## 3 · Los tres huecos

### a) La invitación llega a una puerta por la que él ya no pasa

`getMisInvitaciones` y `responderInvitacion` **solo se usan en
`(auth)/barbero-pendiente.tsx`** — una pantalla de la sala de espera del alta.

> Un barbero independiente que ya está trabajando en su propio panel **nunca ve
> la invitación**. Le llega y se queda ahí.

Es el hueco más barato de tapar y el que rompe todo el flujo: el local invita,
el barbero no se entera, y el dueño concluye que no funciona.

### b) No puede unirse por su cuenta

Existe `(auth)/barbero-codigo` para meter el código del local, pero es del
alta. Desde dentro, un barbero ya montado no tiene dónde escribirlo.

Hace falta la dirección contraria a la invitación: **él pide entrar.**

### c) Aceptar crea una segunda silla, no una mudanza

Hoy la invitación crea un **perfil nuevo** en el negocio del local. Al
aceptarlo, Jeison acaba con dos:

| | Perfil viejo | Perfil nuevo |
|---|---|---|
| Negocio | «Jeison Reyes» | Barbería Dávila |
| Su código | el que dio a sus clientes | otro |
| Historial | ahí | vacío |
| **Recortes de sus clientes** | **ahí** | vacío |

Nada dice que el nuevo **es la continuación** del viejo. Esa es la
vinculación que falta.

---

## 4 · Las dos puertas

### Puerta A · El local llama — *ya existe el motor, falta la puerta*

```
[ Barbería Dávila te invitó ]
  Como: EMPLEADO
  ─────────────────────────────
  Lo que cambia si aceptas:
  · Tus precios y tu horario pasa a ponerlos el local
  · Tus 27 clientes y sus 84 recortes se van contigo
  · Tu código BD4K deja de funcionar; te damos el del local
  ─────────────────────────────
  [ ACEPTAR Y MUDARME ]   No, gracias
```

Aparece **en su panel**, no en la sala de espera del alta: cinta arriba de su
agenda y fila en sus ajustes.

### Puerta B · Él pide entrar — *nueva*

En sus ajustes, `UNIRME A UNA BARBERÍA`: escribe el código del local, ve
**quién es** antes de pedirlo (la misma confirmación que ya diseñamos para el
cliente) y queda pendiente de que el dueño lo apruebe.

Simétrico a lo que ya existe: uno invita, el otro pide, **y siempre hacen falta
los dos síes**.

---

## 5 · Qué se lleva al mudarse

| Qué | ¿Viaja? | Por qué |
|---|---|---|
| Sus clientes | **Sí** | Le siguen a él, no al sitio |
| Historial de visitas | **Sí** | Es su trabajo |
| Reseñas y valoración | **Sí** | Se las ganó él |
| **Recortes acumulados** | **Sí, siempre** | El cliente los ganó **con esa persona** |
| Sus servicios y precios | **Solo si entra como renta** | De empleado, los pone el local |
| Su horario | **Solo si entra como renta** | Igual |
| Su código de barbero | **No** | Pasa a usar el del local |
| Turnos y citas vivos | **No** | Se cierran antes de mudarse |

**Lo acumulado viaja siempre; lo que cambia según el rol es de quién son los
recortes que se generen A PARTIR DE AHORA.** Así el cliente nunca pierde nada
—que era el daño que no tiene explicación posible— y la regla del local solo
gobierna lo que viene.

---

## 6 · El caso espinoso, que conviene ver antes y no después

Jeison entra **como empleado** trayendo clientes con 84 recortes acumulados.
Esos recortes se ganaron en su negocio, no en Dávila. Y ahora:

> **Dávila tiene que regalar cortes que nunca vendió.**

Tres salidas:

1. **El local los honra sin más.** Lo más limpio para el cliente, y un coste
   real para un local que no lo pidió.
2. **Se le enseña al dueño ANTES de invitar** — «este barbero trae 27 clientes
   con 84 recortes; 3 ya tienen premio» — y que decida con el número delante.
3. **Los recortes viajan pero se congelan**: siguen contando para el programa
   viejo hasta que se canjeen, y los nuevos ya son del local.

**Recomiendo la 2.** No cambia el modelo, no le quita nada al cliente, y
convierte una sorpresa desagradable en una condición de la invitación. Un dueño
que ve «trae 84 recortes» y aun así invita, invitó sabiendo.

La 3 es la más justa sobre el papel y la más difícil de explicar en una
pantalla: dos contadores a la vez para el mismo cliente.

---

## 7 · Qué hay que construir

| Capa | Trabajo |
|---|---|
| **Servidor** | `turno_trasladar_perfil(perfil_viejo, perfil_nuevo)`: mueve clientes, historial, reseñas y fidelidad; cierra el negocio viejo si se queda sin sillas |
| **Servidor** | Que la invitación devuelva **lo que el barbero trae**, para la salida 2 |
| **Servidor** | Push `invitacion` al barbero — hoy no hay tipo para esto |
| **Barbero** | La invitación en su panel (cinta + fila en ajustes), no en la sala de espera |
| **Barbero** | `UNIRME A UNA BARBERÍA` con el código del local |
| **Barbería** | Ver lo que trae antes de invitar |
| **Cliente** | Aviso de que su barbero se mudó, y a dónde |

**El cliente también se entera.** Si tu barbero se muda y no te lo dicen, un
día abres la app y la barbería tiene otro nombre. Eso es un push y una línea en
la tarjeta: *«Jeison ahora atiende en Barbería Dávila. Tus 7 recortes siguen
contigo.»*

---

## 8 · Lo que queda por decidir

1. **¿Se puede estar en dos sitios a la vez?** Hoy el modelo lo permite —dos
   perfiles, dos negocios— y el conmutador de panel ya los muestra. Mudarse es
   una cosa; trabajar de verdad en dos locales es otra, y hay barberos que lo
   hacen. **Recomiendo permitirlo y que «mudarse» sea explícito**, no el efecto
   secundario de aceptar una invitación.
2. **¿Puede el dueño deshacer la mudanza?** Si echa al barbero al día
   siguiente, ¿vuelve a su negocio viejo o se queda sin nada? Sin respuesta,
   una mudanza es una puerta de un solo sentido — y acabamos de gastar un
   documento entero explicando por qué eso es malo.
