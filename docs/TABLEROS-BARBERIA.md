# Tableros de la barbería (panel del dueño) — propuesta v1

> **En código (23 sep).** Pedido: «vamos a terminar todo el panel de
> administrador… luego evaluamos las opciones». Se hizo con las
> recomendaciones de abajo (1, 2, 4, 5 y 6); la **3 (el independiente) queda
> como está** —dos paneles— hasta evaluar el conjunto, porque toca el reparto
> de paneles de toda la app. Ver «Lo que se hizo» al final.

El mismo método que con el cliente y el barbero: primero qué va en cada
pestaña y qué no, después los tableros, después los estados, y al final el
código.

Ya existen tres tableros D2 del dueño en el lienzo (`D2-Barberia-Cola`,
`D2-Barberia-Equipo`, `D2-Barberia-Stats`). Se dibujaron antes de rehacer el
panel del barbero, así que sirven de punto de partida visual, no de estructura.

---

## Lo que hay hoy

Cuatro pestañas: **Mi local · Cola · Stats · Config.** (Más `barbero.tsx`,
escondida, que es la ficha de cada silla.)

| Pantalla | Líneas | Qué hace |
|---|---|---|
| Mi local (`dueno/dashboard.tsx`) | 682 | Casi todo: tarjeta del código de acceso, dos cifras (atendidos hoy · **ingresos hoy**), la cola del local en vivo (sillas, cerradas, sin pagar, asignar), «Clientes del local» (abre una hoja), «Mi silla», SOLICITUDES, EQUIPO / QUIENES RENTAN, invitar por código |
| Cola (`dueno/agenda.tsx`) | 216 | **La misma cola otra vez**, más «Ir a mi silla» y un menú con una sola opción: «No se presentó» |
| Stats | 212 | Periodos hoy/7d/30d; dinero en local de empleados, visitas en local de alquiler; tu silla; lista del equipo |
| Config | 658 | Menú: marca y contacto, suscripción, cómo trabaja tu local, funciones (puntos solo con empleados), tiempos (solo con empleados), otros (cuenta, cerrar local) |
| Ficha de silla (`dueno/barbero.tsx`) | 524 | Modalidad, servicios, reseñas, quién le da el trabajo, suspender |
| Clientes del local (`components/clientes-local.tsx`) | 174 | Hoja dentro de Mi local: lista, búsqueda, ficha con historial, WhatsApp |

### Los problemas

1. **La cola está dos veces.** Mi local y Cola enseñan lo mismo, cada una con
   un trozo distinto de acciones: asignar vive en una, «no se presentó» en la
   otra. Es el mismo defecto que tenía la Agenda del barbero, al revés: allí una
   pantalla hacía dos cosas; aquí dos pantallas hacen una.
2. **El dinero está en la portada.** «Ingresos hoy» en Mi local. Con el
   barbero se decidió que el dinero vive solo en Estadísticas; el dueño es el
   mismo caso con más razón, porque la pantalla del local se enseña (se deja
   el teléfono en el mostrador, se le enseña a un empleado).
3. **Clientes está escondida** como una hoja dentro de Mi local, detrás de una
   fila. En el barbero es una pestaña.
4. **Equipo está al fondo de Mi local**, debajo de la cola, y las solicitudes
   de gente que quiere entrar quedan fuera de la vista.
5. **«Mi silla» aparece en dos sitios** (fila en Mi local, botón en Cola) y
   ninguno dice cómo está la silla: solo lleva a ella.
6. **La tarjeta del código ocupa el primer sitio de la portada.** Se comparte
   una vez; se mira la fila cincuenta veces.
7. **Nombres**: «Stats» y «Config» frente a «Estadísticas» y «Ajustes» del
   barbero.

### Encontrado revisando (23 sep) — la lista de clientes del dueño cuenta mal

`turno_clientes_del_local` (migración 117) le enseña al dueño la **lista
entera** del local —correcto, son sus clientes—, pero las cifras de cada
cliente (`visitas`, `total`, `ultima`) salen de
`h.perfil_id in (perfiles de quien pregunta)`: **solo las visitas de la silla
del propio dueño**. En un local de empleados, un cliente que viene cada semana
con un empleado le aparece al dueño con **0 visitas y sin última fecha**. Si la
pestaña Clientes del dueño tiene «Por recuperar», como la del barbero, hoy
marcaría como perdidos a los mejores clientes del local.

La 117 lo hizo así a propósito para el barbero («el único número que significa
algo es el de ese local» — y el suyo). Para quien administra hace falta la otra
mitad: visitas de **todo el local**. Con un matiz en los de alquiler: el dinero
de un barbero que renta es suyo, no del dueño (lo mismo que ya hace Stats), así
que ahí el dueño vería visitas pero no lo gastado en otras sillas. Es un cambio
de servidor (sería la **120**) y no se toca sin visto bueno.

---

## Cómo son los locales de verdad (base de datos, 23 sep)

| Tipo | Locales | De una silla | Varias sillas | El dueño atiende |
|---|---|---|---|---|
| Empleados | 4 | 1 | 3 | 4 |
| Alquiler (espacios_rentados) | 5 | **5** | 0 | 4 |

Dos cosas que cambian el diseño:

- **El dueño atiende en 8 de 9 locales.** El caso normal no es un gerente
  mirando desde fuera: es un barbero que además manda. El panel tiene que
  convivir con Mi silla, no competir con ella.
- **Todos los locales de alquiler tienen una sola silla.** Hoy «local de
  alquiler» es, en la práctica, **el independiente**: un barbero solo, que para
  la app es dueño de un local. A esa persona el panel de barbería le enseña una
  cola de una silla, un equipo vacío y unas estadísticas repetidas.

Así que hay tres dueños distintos y la estructura tiene que servir a los tres:

| | Quién es | Qué necesita del panel |
|---|---|---|
| **A** | Local con empleados (atienda o no) | Todo: fila del local, equipo, clientes, dinero |
| **B** | Local de alquiler con varias sillas (aún no existe en la base, pero es el modelo) | Fila del local, quién renta y si está al día, visitas — **no** el dinero ajeno |
| **C** | Independiente: local de una silla, la suya | Casi nada: su día vive en Mi silla. Del «local» solo usa marca, código, suscripción y, si un día alguien quiere rentarle, la solicitud |

---

## La propuesta: cinco pestañas

```
MI LOCAL   ·   EQUIPO   ·   CLIENTES   ·   ESTADÍSTICAS   ·   AJUSTES
  ahora        personas     cartera        dinero          reglas
```

La misma forma que el barbero (una pestaña de AHORA, tres de consulta, una de
reglas), para que quien tiene los dos paneles no aprenda dos apps.

Arriba de todo, cuando el dueño además atiende: el **conmutador Barbería / Mi
silla** que ya dibuja `D2-Barberia-Cola`. Es la única puerta a su silla.

### 1 · MI LOCAL — solo hoy, solo lo que pasa

- **Cabecera**: nombre del local y, a la derecha, el código en pequeño (toca →
  compartir). La tarjeta grande del código se va a Ajustes.
- **Cifras** (sin dinero): en fila · atendidos hoy · sillas abiertas · espera
  aproximada.
- **Aviso rojo** si hay solicitudes: «2 barberos quieren entrar» → lleva a
  Equipo. Si hay sillas sin pagar (alquiler), otro aviso igual.
- **LAS SILLAS**: una fila por silla con su estado en vivo (libre, atendiendo a
  X, en pausa · vuelve 3:15, cerrada). La del dueño, marcada «tú»; tocarla
  cambia al panel Mi silla.
- **QUIÉN ESTÁ ESPERANDO**: la fila del local en orden. Menú por persona con
  todo junto —lo que hoy está repartido—: *Asignar a…* (si el local reparte),
  *No se presentó*.
- Si la fila del local está apagada o la suscripción vencida: la caja que ya
  existe, en su sitio.

Desaparece la pestaña **Cola**: su contenido es este.

### 2 · EQUIPO — «Quienes rentan» en los de alquiler

- **SOLICITUDES** arriba, cuando las hay (aprobar / rechazar).
- **LAS SILLAS**: cada persona con su etiqueta EMPLEADO / RENTA, estado de hoy
  y, en alquiler, si está al día. Toca → la ficha (`barbero.tsx`, a pasar a D2).
- **Agregar barbero**: invitar con su código.
- Suspendidos al final, con *Reactivar*.

### 3 · CLIENTES

La hoja `clientes-local` convertida en pestaña, con el mismo patrón D2 que la
del barbero: *Todos / Por recuperar*, búsqueda, orden, WhatsApp y llamar, ficha
(con quién se corta, qué pide, alergias en rojo, historial). **Sin la nota
privada del barbero**, como ya está. «Por recuperar» depende de la 120.

### 4 · ESTADÍSTICAS — el único sitio con dinero

- Periodos (hoy / 7 días / 30 días / todo).
- Local de empleados: ingresos del local, % frente al periodo anterior,
  visitas, clientes nuevos, ticket medio, **quién mueve el local** (barras por
  silla), por servicio.
- Local de alquiler: visitas por silla, ocupación; **tu dinero** solo el de tu
  silla, como hoy.
- Reseñas del local.

### 5 · AJUSTES

Mismo esqueleto que el del barbero, en grupos:

- **El local**: marca y contacto, código de acceso (la tarjeta grande vive
  aquí), suscripción.
- **Cómo trabaja**: modalidad (empleados / alquiler), funciones (puntos,
  asignación por el dueño), tiempos.
- **Tu cuenta**: cambiar de panel, cerrar sesión, cerrar el local.

### Qué va a dónde

| Hoy | Mañana |
|---|---|
| Mi local · tarjeta del código | Ajustes · El local (y chip en la cabecera de Mi local) |
| Mi local · «Ingresos hoy» | Estadísticas |
| Mi local · cola del local | Mi local · QUIÉN ESTÁ ESPERANDO |
| Cola (pestaña entera) | Se quita; «No se presentó» pasa al menú de Mi local |
| Mi local · «Clientes del local» (hoja) | Pestaña Clientes |
| Mi local · «Mi silla» + Cola · «Ir a mi silla» | Conmutador de arriba + fila «tú» en LAS SILLAS |
| Mi local · SOLICITUDES, EQUIPO, invitar | Pestaña Equipo (con aviso en Mi local) |
| Stats | Estadísticas |
| Config | Ajustes |

---

## Decisiones antes de dibujar

**1. Cinco pestañas o cuatro.**
*Recomiendo cinco.* Cuatro obliga a meter Equipo o Clientes dentro de otra
pestaña, que es exactamente lo que hoy esconde Clientes. Cinco además iguala
al barbero.

**2. Dinero fuera de Mi local.**
*Recomiendo sí*, igual que en Mi silla: solo en Estadísticas. En contra: el
dueño pierde el «¿cómo va el día?» de un vistazo; se compensa con *atendidos
hoy* en las cifras.

**3. El independiente (C).**
- **(a) Recomendado:** si el local tiene **una sola silla y es la del
  dueño**, no hay panel Barbería: entra directo a Mi silla, sin conmutador, y
  lo del local (marca, código, suscripción, pasar a tener equipo) aparece como
  un grupo **«Tu local»** en sus Ajustes. Una solicitud para rentarle una silla
  sale como aviso arriba en Mi silla. En cuanto entra una segunda silla,
  aparece el panel Barbería. *A favor:* es 5 de 5 locales de alquiler y le
  quita una app entera que no usa. *En contra:* hay que tocar
  `getMisRoles`/`paneles.ts` y los Ajustes del barbero; y el día que tenga
  equipo el panel «aparece», lo que hay que explicar una vez.
- **(b)** Dejarlo como está: dos paneles siempre. Cero trabajo, pero todo lo
  que hagamos en este panel es para gente que tendrá una silla vacía delante.

(El local de alquiler cuya única silla es de otro —hay 1 de 5— sí necesita el
panel: no entra en la regla.)

**4. El dueño que atiende: una sola puerta a su silla.**
*Recomiendo* el conmutador de arriba + la fila «tú» dentro de LAS SILLAS, que
además dice cómo está (libre, atendiendo…). Se quitan los dos accesos de hoy.

**5. La 120 (clientes del dueño con visitas de todo el local).**
*Recomiendo prepararla ya*, probada en seco como la 119, y aplicarla solo con
tu visto bueno. Sin ella, Clientes del dueño no puede tener «Por recuperar».

**6. Por dónde empezar.**
*Recomiendo Mi local*, como con Mi silla: es la pantalla que más se abre y la
que hoy está duplicada.

---

## Lo que se hizo (23 sep)

| Pestaña | Archivo | Qué hay |
|---|---|---|
| Mi local | `dueno/dashboard.tsx` | Cabecera con el código en pequeño (toca → compartir) · aviso rojo de solicitudes · cifras sin dinero (en fila, atendidos hoy, sillas abiertas, espera máx.) · LAS SILLAS con su estado en vivo, la tuya marcada TÚ y que lleva a Mi silla · QUIÉN ESTÁ ESPERANDO con una hoja por turno: asignar / pasar a otra silla (si el local reparte), «No se presentó» (si ya le tocó), y el porqué de lo que no se puede · local apagado explicado · recarga al enfocar y en vivo |
| Equipo | `dueno/equipo.tsx` (nueva) | Solicitudes en bloque oscuro (aprobar / rechazar con confirmación) · sillas con EMPLEADO / RENTA / ADMINISTRADOR y SUSPENDIDO, suspendidos al final con *Reactivar* · **Invitados** esperando respuesta (antes no se veían) · compartir el código del local · invitar con su código |
| Clientes | `dueno/clientes.tsx` (nueva) | Todos / Por recuperar (más de 30 días sin volver), buscar, ordenar, WhatsApp y llamar · ficha: gastado, su barbero, lo que pide, alergias, últimas visitas; sin las notas privadas de los barberos |
| Estadísticas | `dueno/stats.tsx` | Periodos hoy / 7 / 30 / todo · empleados: ingresos del local con % frente al periodo anterior, visitas, clientes, ticket, **quién mueve el local** (barra por silla), de dónde vinieron, y las visitas de sillas rentadas contadas aparte · alquiler: visitas (de alquiler + tu silla), tu dinero solo el de tu silla |
| Ajustes | `dueno/config.tsx` | Menú en tres grupos (El local · Cómo trabaja · Tu cuenta) · sección nueva **Código del local** · cambiar de panel con la cuenta |
| Ficha de silla | `dueno/barbero.tsx` | Pasada ligera: encabezado con su modalidad, rótulos, filas planas |

**Quitado:** la pestaña Cola (`dueno/agenda.tsx`) y la hoja
`components/clientes-local.tsx`, sustituidas por Mi local y Clientes (en el
historial de git si hiciera falta). El aviso push de tipo `equipo` abre ahora
la pestaña Equipo.

**Migración 120 — PREPARADA, SIN APLICAR.** `turno_clientes_del_local_admin`:
solo añade una función (visitas de las sillas que el dueño manda, con quién se
corta cada cliente). Probada en seco dentro de una transacción revertida:
`clientes_dueno` 9/9. Mientras no se aplique, la pestaña Clientes funciona con
la función de siempre y **lo dice** («por ahora las visitas son solo las de tu
silla») y no ofrece «Por recuperar». Vuelta atrás: `rollback_120_…sql`.

**Límite conocido:** la API devuelve como mucho 1.000 filas por lista. Las
cifras grandes de Estadísticas del dueño las suma el servidor (sin límite);
el reparto por silla y por origen sale de la lista, y si llega al corte la
pantalla lo avisa. En las Estadísticas del **barbero** todo sale de la lista:
con más de 1.000 visitas en «Todo» el total se quedaría corto. Pendiente.
