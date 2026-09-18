# Tableros del cliente — qué va y qué no en cada uno

Inventario de **todo** lo que hoy muestra cada pantalla del cliente, sacado del
código, bloque por bloque. Para cada bloque hay una recomendación, pero la
decisión es tuya: marca `VA`, `FUERA` o `MUEVE A …`.

Nada de esto se toca hasta que la hoja esté cerrada.

**Regla que gobierna todas las recomendaciones** — D2 permite *un solo objeto
oscuro por pantalla*, y tiene que ser aquello por lo que se abrió la pantalla.
Casi todos los «FUERA» de abajo salen de ahí o de que la misma función esté en
dos sitios.

Son **7 pantallas**. Hoy solo 3 tienen tablero D2.

---

## 1 · INICIO — `cliente/home` · tablero `D2-Cliente-Inicio`

La pregunta que contesta: **¿cómo está esto y qué tengo yo?**

| # | Bloque | Qué es hoy | Recomiendo | Por qué |
|---|---|---|---|---|
| 1.1 | «Hola» | Saludo suelto sobre el nombre del local | **FUERA** | Ocupa la línea más valiosa de la pantalla para no decir nada. El tablero pone `HOLA, CARLOS` como rótulo pequeño, no como titular. |
| 1.2 | Logo + nombre + eslogan + dirección | Cabecera de marca | **VA** | Es la identidad del local. La dirección con punto de referencia es como se explica un sitio aquí. |
| 1.3 | Pestañas de locales + botón «+» + buscar barbero | Tira horizontal de barberías tuyas | **VA, rediseñar** | Necesario si tienes varios locales. Hoy son píldoras redondeadas: en D2 son filete y mayúsculas. |
| 1.4 | `EstadoLocal` | Bloque oscuro: abierto/cerrado, sillas, espera | **VA — es el objeto oscuro** | Es lo primero que se pregunta quien abre la app. |
| 1.5 | Ticket «EN LA FILA» | Ticket oscuro con tu turno activo | **MUEVE A «Mi turno»** | **Es el segundo objeto oscuro y rompe la regla.** Además duplica la pantalla que existe para eso. En Inicio basta una línea roja: «Estás en la fila · puesto 3». |
| 1.6 | `TUS CITAS` | Lista con cuenta atrás, confirmar, reprogramar, cancelar | **VA, recortar** | La cita próxima sí. Pero **confirmar/reprogramar/cancelar en Inicio sobra**: son tres acciones destructivas en la pantalla de entrada. Dejar solo la cita y que se toque para abrirla. |
| 1.7 | Citas pasadas («SE PASÓ LA HORA») | Cita vencida con su explicación | **FUERA de Inicio** | Inicio es lo que viene, no lo que se perdió. Va a Historial. |
| 1.8 | `¿QUÉ QUIERES HACER?` + dos puertas | Botón rojo «Fila ahora» + contorno «Agendar» | **VA** | Es la decisión de la pantalla. Recién arreglado. |
| 1.9 | Aviso «Todavía no atienden por la app» | Sustituye las puertas si no hay sillas activas | **VA** | Sin él, dos botones que llevan a pantallas vacías. |
| 1.10 | Tarjetas de fidelidad | Barra de progreso, premio, «faltan N recortes» | **MUEVE A «Perfil»** | Ya existe idéntica en Perfil, donde el tablero la pone como objeto oscuro. En Inicio es una tercera cosa compitiendo. |
| 1.11 | `TUS VISITAS` (4 últimas) + «Ver todo» | Mini-historial con precios | **FUERA** | Historial es una pestaña propia. Enseñar 4 aquí es un cuarto bloque para algo que está a un toque. |

**Resultado:** Inicio pasa de 11 bloques a 6. Un objeto oscuro (el estado del
local), un rojo macizo (Fila ahora).

---

## 2 · MI TURNO — `cliente/turno` · tablero `D2-Cliente-MiTurno`

La pregunta: **¿cuánto me falta, y cómo entro?**

| # | Bloque | Qué es hoy | Recomiendo | Por qué |
|---|---|---|---|---|
| 2.1 | Titular «Mi turno» | Anton 26 | **VA** | |
| 2.2 | Aviso «Tu turno expiró» | Cuando no llegaste a tiempo | **VA** | Explica por qué desapareció el turno. Sin él parece un fallo. |
| 2.3 | Ticket del turno activo | Poste, puesto, servicio, ETA, perforación | **VA — es el objeto oscuro** | Es la pantalla entera. Aquí es donde debe vivir (ver 1.5). |
| 2.4 | «Va después» (segundo turno) | Cuando tienes dos en cola | **VA** | |
| 2.5 | Píldora «≈ N min de espera» | Estimación | **VA, rediseñar** | En D2 es cifra en Anton dentro del ticket, no píldora redondeada al lado. |
| 2.6 | `TUS CITAS RESERVADAS` | Lista con cuadrado de fecha | **DECIDIR** | Es la **misma lista que Inicio 1.6**. Hay que elegir un sitio. Recomiendo: **aquí**, porque «Mi turno» es donde está lo que tienes pendiente; en Inicio solo el aviso de la próxima. |
| 2.7 | `ENTRAR A LA FILA DIGITAL` + lista de barberos | Cada barbero con sus servicios y precios | **VA** | Es la única puerta real a la fila. |
| 2.8 | Botón «Cualquiera» | Entra con el primero libre | **VA** | Para el que no tiene preferencia, que es la mayoría. |
| 2.9 | Hoja de entrar a la fila (`HojaFila`) | Panel inferior: ventana de llegada, doble servicio | **VA — necesita tablero** | No tiene tablero D2. Solo existe en la dirección C, descartada. |

---

## 3 · RESERVAR — `cliente/agendar` · **sin tablero**

| # | Bloque | Qué es hoy | Recomiendo |
|---|---|---|---|
| 3.1 | Titular «Reservar» | Anton 24 | **VA** |
| 3.2 | Resumen del servicio elegido | Bloque carbón con poste | **VA — es el objeto oscuro** |
| 3.3 | `1 · BARBERO` | Tira horizontal con avatares | **VA** |
| 3.4 | `2 · SERVICIO` | Filas con barra roja en el elegido | **VA** |
| 3.5 | «¿Para cuántas personas?» | Contador tú + acompañantes | **VA** |
| 3.6 | `3 · DÍA` | Chips de fecha | **VA** |
| 3.7 | `4 · HORA` | Chips de hora | **VA** |
| 3.8 | Botón «Confirmar cita · 3:00 PM» | CTA rojo con la hora dentro | **VA** |

Pantalla sana: es un embudo numerado y el orden ya es el correcto. **Solo
necesita que se dibuje su tablero** para fijar medidas y no volver a
improvisarla.

---

## 4 · HISTORIAL — `cliente/historial` · **sin tablero**

| # | Bloque | Qué es hoy | Recomiendo |
|---|---|---|---|
| 4.1 | Titular «Historial» | Anton 26 | **VA** |
| 4.2 | Lista de visitas | Servicio, fecha, barbero, precio | **VA** |
| 4.3 | Vacío: «Aún no tienes visitas registradas» | | **VA** |
| 4.4 | Hoja «¿Cómo estuvo?» + reseña | Panel para puntuar | **VA** |
| 4.5 | *(nuevo)* Citas pasadas | Viene de Inicio 1.7 | **DECIDIR** |

La pantalla más vacía de las siete. **Es la candidata natural para recoger lo
que sale de Inicio** (1.7 y 1.11).

---

## 5 · PERFIL — `cliente/perfil` · tablero `D2-Cliente-Perfil`

| # | Bloque | Qué es hoy | Recomiendo | Por qué |
|---|---|---|---|---|
| 5.1 | Avatar + nombre + teléfono | Cabecera | **VA** | |
| 5.2 | Tarjeta de fidelidad | Bloque oscuro con poste, progreso, premio | **VA — es el objeto oscuro** | Recoge también la de Inicio (1.10). |
| 5.3 | Botón «Canjear» | Aparece al llegar a la meta | **VA** | |
| 5.4 | `VALES DISPONIBLES` | Premios ya canjeados sin usar | **VA** | «Muéstralo al cobrar»: se usa delante del barbero. |
| 5.5 | `TUS NÚMEROS` | Visitas, gastado, barbero fav., servicio fav. | **VA** | Cifras en Anton: es lo que mejor encaja en D2. |
| 5.6 | `MIS PREFERENCIAS` + «Editar» | Resumen de corte, barba, alergias | **VA** | |
| 5.7 | `MIS LOCALES` | Barberías tuyas | **DECIDIR** | Es la **misma lista que Inicio 1.3**. Recomiendo dejarla aquí y que Inicio solo tenga el conmutador. |
| 5.8 | `CUENTA`: cerrar sesión | Con explicación de qué se conserva | **VA** | |
| 5.9 | «Avisos en este teléfono» | Activar notificaciones | **VA** | |
| 5.10 | `CAMBIAR DE PANEL` (`CambiarRol`) | Si tienes más de un rol | **VA** | |
| 5.11 | `SIN VUELTA ATRÁS`: eliminar cuenta | Con todas las consecuencias escritas | **VA** | |
| 5.12 | *(falta)* Distintivo de panel | `PanelBadge` no está en ninguna pantalla de cliente | **DECIDIR** | Como cliente, nada te dice en qué panel estás. |

---

## 6 · PREFERENCIAS — `cliente/preferencias` · **sin tablero**

| # | Bloque | Recomiendo |
|---|---|---|
| 6.1 | Titular «Preferencias» | **VA** |
| 6.2 | Tipo de corte · Barba · Alergias · Notas | **VA** |
| 6.3 | Botón «Guardar» | **VA** |

Cuatro campos y un botón. **No necesita tablero propio**: se deriva de la regla
de campos (contorno negro de 2 px).

---

## 7 · BUSCAR BARBERO — `cliente/buscar-barbero` · **sin tablero**

| # | Bloque | Recomiendo |
|---|---|---|
| 7.1 | Titular «Buscar barbero» | **VA** |
| 7.2 | Campo de búsqueda | **VA** |
| 7.3 | Resultado: avatar, nombre, especialidad | **VA** |
| 7.4 | `DÓNDE TRABAJA` | **VA** |

Igual que Preferencias: se deriva de las reglas.

---

## Resumen de lo que hay que decidir

**Duplicados** — la misma cosa en dos pantallas. Hay que elegir sitio:

| Qué | Está en | Recomiendo |
|---|---|---|
| Ticket del turno | Inicio 1.5 **y** Mi turno 2.3 | Mi turno |
| Citas reservadas | Inicio 1.6 **y** Mi turno 2.6 | Mi turno (aviso en Inicio) |
| Fidelidad | Inicio 1.10 **y** Perfil 5.2 | Perfil |
| Lista de locales | Inicio 1.3 **y** Perfil 5.7 | Perfil |
| Historial | Inicio 1.11 **y** Historial | Historial |

**Tableros que hay que dibujar** (hoy no existen):

1. `D2-Cliente-Agendar` — embudo de 4 pasos
2. `D2-Cliente-Historial` — y decidir si recoge las citas pasadas
3. `D2-Cliente-HojaFila` — el panel de entrar a la fila
4. Inicio y Mi turno **hay que redibujarlos**: los actuales tienen el ticket en
   Inicio y una pestaña «Reservar» que no existe en la app.

**Preferencias y Buscar barbero** no necesitan tablero: salen de las reglas.
