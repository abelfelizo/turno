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

## 3 · Corrección: casi todo estaba construido

En la primera versión de este documento dije que faltaba «que él pida entrar
con el código del local desde sus ajustes». **Era falso.** Está en
`barbero/config.tsx`, y bien hecho:

| Pieza | Dónde |
|---|---|
| `MIS LOCALES` con todos sus sitios | `getBarberoNegocios` · línea 141 |
| Unirse a un local con su código | `unirseProfesional` · línea 343, con su modal |
| **Dejar un local** (deshacer) | `dejarLocal` · línea 360 |
| El dueño lo desvincula | `desvincularBarbero` |
| Dos sitios a la vez | El conmutador de panel ya los lista |

Y hasta el caso fino está resuelto:

> Si ese local ya te había INVITADO, tu solicitud es el segundo sí y entras de
> una. Mandar a esperar a quien ya está dentro es el fallo que este `if` evita.

**Trabajar en dos sitios y deshacerlo no hay que construirlo. Ya funciona.**

---

## 4 · Lo que el front end NO respeta

Fijado el principio —**el perfil siempre es del barbero, y donde sea se lo
lleva**— quedan tres sitios donde la app lo contradice.

### a) Las estrellas se quedan en el local *(el grave)*

`turno_resumen_resenas(p_perfil)` agrega **por perfil**, y hay un perfil por
local. Consecuencia:

> Un barbero con 4,8 ★ y 120 reseñas que entra en otro local **aparece sin
> valoración**. Empieza de cero como si nunca hubiera cortado.

Eso choca de frente con el principio. Si el perfil es suyo, **sus estrellas son
suyas**: se ganaron cortando pelo, no ocupando una silla concreta. Lo mismo
vale para el historial de visitas.

Arreglo: la valoración se agrega **por usuario**, no por perfil. Y si se quiere
conservar el detalle, la tarjeta puede decir `4,8 ★ · 120 cortes · 31 aquí`.

### b) Al unirse por código, el rol está fijo a «empleado»

`config.tsx:343` llama a `unirseProfesional` con **`rol: 'empleado'`** escrito a
mano. Un barbero que va a **alquilar** una silla no puede entrar como tal.

Y esto ya no es cosmético, porque **el rol decide de quién son los recortes**:
entra mal clasificado, y el programa de fidelidad queda del local cuando
debería ser suyo. Hay que preguntarlo: *¿vas de empleado o alquilas tu silla?*

### c) La invitación no le llega donde vive

`getMisInvitaciones` y `responderInvitacion` **solo se usan en
`(auth)/barbero-pendiente.tsx`**, la sala de espera del alta. Un barbero que ya
trabaja nunca la ve.

Existe la salida —que teclee el código y entre por el segundo sí— pero **tiene
que enterarse por fuera de la app** de que le invitaron.

---

## 5 · Qué viaja — la regla, corregida

Mi versión anterior decía «lo que dice quién es viaja, lo que dice cómo trabajas
aquí se queda», **para todos**. La regla real es más simple y depende del rol:

> **Si es independiente, viaja todo — incluidos sus precios y sus servicios.**
> **Si es empleado, solo viaja lo que dice quién es.**

| | Independiente (solo o renta) | Empleado |
|---|---|---|
| Nombre, foto, código | Viaja | Viaja |
| Valoración y reseñas | Viaja | Viaja |
| Historial de cortes | Viaja | Viaja |
| Clientes | Viaja | Viaja |
| **Precios** | **Viajan** | Los pone el local |
| **Servicios** | **Viajan** | Los pone el local |
| Horario | Suyo | Lo pone el local |
| Recortes | Suyos | Del local |

Y tiene sentido: **el independiente es el mismo negocio en otra dirección.** Se
lleva su carta de precios como se lleva su tijera. El empleado entra a un
negocio ajeno, y ahí la carta es del negocio.

Consecuencia práctica: cuando un independiente se une a un local **como renta**,
sus servicios y precios tienen que aparecer ya cargados, no en blanco. Volver a
teclear la carta entera es la clase de fricción que hace que no lo use.

---

## 6 · Quién paga el premio

> **El contador es de quien lo active, y paga el que ofrece el premio.**
> Barbero independiente: lo activa él, lo paga él. Con empleados: paga la
> barbería.

Esto **disuelve el problema** que ocupaba antes esta sección. Yo lo había
planteado como «Dávila tiene que regalar cortes que nunca vendió», y con esta
regla **Dávila no hereda ninguna deuda**: el programa lo activó Jeison, así que
los recortes acumulados son suyos y los honra él.

Ya no hay que enseñarle al dueño lo que el barbero trae para que decida: no le
cuesta nada.

**Mi lectura de la consecuencia, por si hay que corregirla:** cuando Jeison
entra **como empleado**, su programa deja de admitir recortes nuevos —ahí manda
el del local— pero **lo ya acumulado sigue vivo y lo paga él**. Es un saldo que
se cierra, no algo que se borre. El cliente no pierde nada y el local no paga
nada.

Y en la tarjeta del cliente hay que decir **quién ofrece el premio**, porque es
a quien se le reclama: `FIDELIDAD · CON JEISON` frente a
`FIDELIDAD · BARBERÍA DÁVILA`. Es el `ambito` que el servidor ya devuelve.

---

## 7 · Qué hay que construir — mucho menos de lo que parecía

En la primera versión propuse una migración de **traslado de perfil**. Ya no
hace falta, y esto es consecuencia directa de lo que decidiste:

> **Si se puede estar en dos sitios y se puede salir de uno, la mudanza no es
> una operación: es entrar al nuevo y salir del viejo.** Las dos piezas ya
> existen.

Lo que queda no es mover nada. Es que **lo suyo no se quede atrás**:

| Capa | Trabajo | Por qué |
|---|---|---|
| **Servidor** | Valoración e historial **por usuario**, no por perfil | Sin esto, cambiar de sitio borra 120 reseñas |
| **Servidor** | Push `invitacion` — hoy no hay tipo para esto | Si no, se entera por fuera de la app |
| **Barbero** | Preguntar el rol al unirse, en vez de fijar `empleado` | El rol decide de quién son los recortes |
| **Barbero** | La invitación en su panel, no en la sala de espera del alta | Hoy no la ve nunca |
| **Cliente** | Aviso de que su barbero se mudó, y a dónde | Si no, un día la barbería tiene otro nombre |

**El cliente también se entera.** Un push y una línea en la tarjeta: *«Jeison
ahora atiende en Barbería Dávila. Tus 7 recortes siguen contigo.»*

Y con dos sitios a la vez, el aviso no siempre es una mudanza: también puede
ser *«Jeison ahora también atiende en Barbería Dávila»*. **La app no debe
suponer que se fue** — puede que solo haya sumado un sitio.

---

## 8 · Decidido

| Pregunta | Respuesta |
|---|---|
| ¿Dos sitios a la vez? | **Sí.** Ya funciona: el conmutador de panel los lista |
| ¿De quién es el perfil? | **Del barbero. Donde sea, se lo lleva** |
| ¿Se puede deshacer? | **Sí.** `dejarLocal` ya existe |
| ¿De quién son los recortes? | **Del local solo si es empleado** |
| ¿Quién paga el premio? | **El que lo ofrece.** Independiente: él. Empleados: la barbería |
| ¿Qué viaja? | **Independiente: todo, precios incluidos. Empleado: solo quién es** |

Nada abierto.
