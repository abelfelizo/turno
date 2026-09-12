# HANDOFF · Turno

> Dónde se quedó el proyecto y qué sigue. Estado completo en `CONTEXT.md`;
> checklist de release en `PRODUCCION.md`.
> Última actualización: **2026-09-11** · migración **107** · rama `claude/app-status-2o0mdy`.

## TL;DR

App de **citas + fila digital para barberías** (Expo/RN + Supabase, sistema NAVAJA). Los
cuatro roles funcionan y el producto está **completo para un piloto cerrado**: lo que falta
no son pantallas, es infraestructura de lanzamiento (correo verificado y cobro).

Desde la última entrega el trabajo ha venido de **probar la app en el teléfono y corregir
lo que aparecía**, migración a migración, con el mismo método cada vez:

> reproducir el fallo contra la base real → arreglarlo → verificarlo → dejar los casos en
> una suite permanente.

Ese último paso es el que importa. Sin él, cada corrección se puede volver a romper sin que
nada avise, y ya pasó dos veces.

## Lo último que se cerró

- **Migraciones 66–97.** El sin cita es un cliente (cuenta como dinero), la fila se come la
  agenda, "te toca y el reloj corre", cómo te llega el trabajo (`modo_atencion`), la puerta
  y el letrero, la silla es de quien atiende, el que está en la silla no hace fila, los
  cuatro relojes del servicio, dónde queda el local (país + moneda), suspender no es echar,
  las reseñas se leen, mi barbero, devolver vacío no es negarse, una barbería nace abierta,
  la prueba gratis existe de verdad, "hoy cierro más tarde" (87), de quién es esa decisión
  (88), la red anti-anónimos que se cuenta sola (89), hasta cuándo manda el cliente en su
  cita (90), "hoy abro antes" (91), **el casero no es el jefe** (92), **cada silla paga la
  suya** (93), quién deja entrar a quién (94), **el día que empezamos a cobrar** (95), una
  silla pagada es una silla (96), quién pagó no es asunto tuyo (97), **el casero no se
  nombra jefe** (98), el cupo se ve (99), las dos horas extra que el cron no veía (100) y
  **pertenecer no es poder mirar** (101), **la ficha del cliente no es del vecino** (102),
  dos tablas de notas es una de más (103), la lista vieja de clientes se va (104),
  **estar apuntado no es trabajar aquí** (105), no solo se corta el pelo (106) y
  **al empleado el trabajo se lo dan** (107).
- **El reparto de poder en los locales de asientos alquilados**, que era la pregunta de
  producto más grande abierta. El dueño agrupa y cobra el alquiler; no dirige, no lee la
  cartera ni la facturación de su inquilino, y suspenderlo le quita la fila y la fachada del
  local pero no le apaga el negocio. Con su consecuencia: el barbero paga SU silla y no
  depende de que el local pague. Y con su salida: puede montarse el suyo desde la app.
- **El cobro que de verdad corta** (95–97), que era la decisión de producto pendiente desde
  la migración 86 y que dos casos rojos llevaban meses guardando. Sin pagar no se aparece, no
  se acepta trabajo y no se opera la fila; con empleados hay **cupo de sillas por
  antigüedad**, para que pagar una no dé para cinco; y las citas ya reservadas y el historial
  no se tocan. El letrero que ve el cliente no delata a quien no pagó.
- **La auditoría de menús, roles y permisos contra el esquema nuevo**, que es de donde
  salieron la 98 y la 99. La regla estaba bien en el servidor y las pantallas seguían
  contando la versión vieja: las dos de suscripción decían «no pasa nada» al vencerse —justo
  las que tienen que explicar el apagón—, el cliente seguía eligiendo entre barberos que no
  puede usar, y el menú del dueño de alquiler le enseñaba un precio que no paga. Cuando el
  cobro cambia, cambia lo que las pantallas tienen que decir; si no se revisan, el producto
  queda diciendo dos cosas a la vez.
- **Los dos fallos que trajo el piloto del 11-sep**, los dos con la misma forma. El cron
  expiraba a los clientes de una fila que el barbero acababa de alargar dos horas, porque
  `turno_cerrar_olvidados` leía el horario SEMANAL y la extensión vive en `turno_jornadas`
  (100). Y el casero leía por la tabla lo que la 92 le había cerrado por la función (101).
  Dos sitios leyendo la misma regla por puertas distintas, las dos veces.
- **La cuarta tabla que la 101 no miró** (102). La 101 arrancó el predicado roto de `cola`,
  `citas` e `historial_visitas` y dejó `turno_preferencias_cliente` diciendo exactamente lo
  mismo. O sea que **cualquier cliente del local leía la ficha de los demás**: tipo de corte,
  barba, **alergias**, notas y foto — y el código del local se comparte por WhatsApp.
  Reproducido antes de tocar nada. Al arreglar una familia de fallos hay que enumerar la
  familia entera, no los casos que traía el reporte.
- **La auditoría de la capa de datos contra la base real**, de donde salieron la 102, la 103
  y la 104. Cruzar `pg_proc` y `pg_policies` con lo que la app llama de verdad dio: ninguna
  RPC que la app invoque falta en la base (cero 404 en caliente), **tres** tablas de notas
  distintas cuando la regla es una, **una** tabla huérfana con 0 filas (`turno_notas_privadas`),
  **una** función viva sin llamadores que escondía un bug ya conocido (`turno_mis_clientes`,
  sustituida en la 59 justo porque no veía a quien se unió y aún no ha venido) y **diez**
  exportaciones de `lib/db.ts` sin un solo importador.
- **Doce suites de base, TODAS re-corridas enteras contra el estado de hoy** (migración 107),
  las doce verdes, **360 casos**: puertas 70, suscripción 36, jornada 36, motor_cola 34,
  autonomía 33, obstáculos 32, confianza 27, horarios 26, sin cita 22, modo 21, viaje 17,
  fidelidad 6.

  Ya no queda ningún «esto no lo he corrido pero creo que no le afecta». Tres cosas que
  salieron precisamente de correrlas en vez de razonarlas:

  · **`sin cita` da 22 y no 21.** Su caso de «la agenda de hoy NO se cierra entera» se
    salta solo cuando es tan tarde que ya no queda jornada; a las 19:30 no se evaluó, a la
    01:18 sí. La suite lo dice en su salida en vez de contarlo como aprobado. **Un caso no
    evaluado no es un caso verde**, y por eso valía la pena volver.

  · **`motor_cola` parecía en riesgo por la 107 y no lo estaba** — su barbero tiene también
    membresía de dueño, así que es autónomo. Argumento correcto; ahora, corrida.

  · **`modo_atencion` destapó un fallo de producto** que no tenía nada que ver con lo que
    se estaba probando: la barbería que cierra de madrugada. Ver el apartado siguiente.

  Y una cosa que las suites NO pueden avisar sola: `autonomia` tiene un caso verde,
  **«alta · en ASIENTOS ALQUILADOS entra activo, se agrega él»**, que guarda la regla de la
  migración 94 — la misma que el dueño del producto ya ha corregido («barbero y barbería se
  pueden agregar mutuamente, pero requiere aprobación del otro»). Está verde y está
  obsoleto: **una prueba en verde solo garantiza que el código hace lo que la prueba dice,
  no que la prueba siga diciendo lo que el producto quiere.** Hay que darle la vuelta
  cuando se haga la aprobación mutua.

## Un fallo abierto: la barbería que cierra de madrugada

Salió corriendo `modo_atencion` a la 01:18 de RD, y **no es cosa de las pruebas**.
Reproducido aparte, con un horario que cualquiera pondría un viernes:

```
horario 21:00 → 03:00 · hora de RD: 01:18
turno_fila_abierta  →  "ahora está cerrado: su fila abre de 21:00 a 03:00"
turno_entrar_a_cola →  rebota con ese mismo mensaje
```

El mensaje **se contradice a sí mismo**: le enseña al cliente un horario que incluye
la hora que es. La causa es una línea: se pregunta `ahora between apertura y cierre`,
y eso es falso en cuanto la ventana cruza la medianoche (apertura 21:00 > cierre 03:00).

Arreglarlo de verdad es más que un `case`, y por eso no se hizo de paso:

- la comparación aparece en varios sitios (`turno_fila_abierta`, `turno_entrar_a_cola`,
  `turno_cerrar_olvidados`…) y **la regla que solo se arregla en un sitio no es una
  regla**: hay que enumerarlos, como enseñó la 102;
- `turno_slots_disponibles` tendría además que generar huecos que cruzan de día, y ahí
  "la agenda de hoy" deja de ser obvio: un hueco de las 01:00 ¿es de hoy o de ayer?;
- y antes de todo eso hay una decisión de producto: **¿este producto soporta turnos de
  madrugada?** Si la respuesta es que no, lo correcto no es el `case`, es **impedir que
  se guarde un horario con cierre anterior a la apertura** y decirlo al guardarlo, en
  vez de aceptarlo y luego comportarse como si el local estuviera cerrado.

Mientras tanto, lo único que se tocó es el montaje de `modo_atencion`, que se construía
solo una ventana envuelta («ahora ± 2 h») y por eso daba siete rojos falsos de noche.
Ahora se clava dentro del día. **El fallo de arriba sigue ahí.**

## Qué sigue, en orden

### 🔴 Sin esto no hay piloto de verdad
1. **Comprar el dominio y verificar el subdominio en Brevo (SPF/DKIM).** Hoy el correo de
   OTP cae en spam: la gente no puede ni entrar. Es el único bloqueo duro.
2. **Rotar la clave SMTP** que se pegó en un chat, y actualizarla en Supabase.

### 🟠 Después
3. **Probar las notificaciones con dos teléfonos.** Hay **un solo token** en
   `turno_push_tokens`. El envío es peer-to-peer (la base no puede hacer HTTP), así que si
   el teléfono que recibe nunca registró el suyo, el push no llega **y no da error**. No se
   puede dar por bueno hasta ver dos tokens y un aviso recibido.
4. **La pasarela de pago.** Todo lo de alrededor está cerrado: quién paga (86 y 93), cuántos
   días quedan, y desde la 95 **qué se apaga cuando no se paga**, con el cupo por antigüedad
   de la 96. Los dos casos rojos que guardaban esa decisión se dieron la vuelta con la
   migración delante, que es justo para lo que estaban puestos. Lo que falta es cobrar:
   `pagada_hasta` y `sillas_pagadas` hoy se escriben a mano. Un SDK de pagos es código
   nativo, así que **no entra por OTA**.
5. **Rediseño del panel del cliente**, rehecho contra esta rama.

## Constraint de infraestructura (CRÍTICO)

Supabase `pphnaasmirbnuilgzfeo` está **compartido con otro proyecto en producción con datos
reales**. **Tocar SOLO objetos `turno_`.** `auth.users` y el SMTP también son compartidos.
Los errores `rls_disabled` del linter son de `libro_*`, otra app, fuera de alcance.

## Mapa de archivos

- Diseño y piezas: `constants/index.ts`, `components/ui.tsx`, `components/hoja.tsx`,
  `components/tabs.tsx`
- Compartido clave: `components/agenda-trabajo.tsx` (barbero y dueño-barbero)
- Lógica: `lib/db.ts`, `lib/atencion.ts`, `lib/format.ts`, `lib/notificaciones.ts`,
  `lib/paises.ts`, `lib/pricing.ts`, `lib/whatsapp.ts`
- Pantallas: `app/(app)/{cliente,barbero,dueno}/`, `app/(auth)/`
- Backend: `supabase/migrations/` (01–107), `supabase/functions/turno-enviar-push/`
- Pruebas: `supabase/tests/` (12 suites) y su `README.md`
- Docs: `CONTEXT.md` (estado), `PRODUCCION.md` (release), `ARQUITECTURA-UX.md` (el brief de
  julio), este `HANDOFF.md`
