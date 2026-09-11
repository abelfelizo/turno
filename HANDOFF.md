# HANDOFF · Turno

> Dónde se quedó el proyecto y qué sigue. Estado completo en `CONTEXT.md`;
> checklist de release en `PRODUCCION.md`.
> Última actualización: **2026-09-11** · migración **101** · rama `claude/app-status-2o0mdy`.

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
  **pertenecer no es poder mirar** (101).
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
- **Doce suites de base, todas verdes** contra la BD real y **re-corridas enteras después de
  la 101**, que es el estado de hoy: cola 34, autonomía 33, fidelidad 6, viaje 17,
  obstáculos 32, puertas 43, horarios 26, sin cita 21, modo 21, confianza 27, suscripción
  36, jornada 36. Más el censo y la red anti-anónimos, verdes aparte.

  Dos notas para que el conteo no engañe:

  · **`sin cita` marca 21 y no 22 porque la propia suite se salta un caso.** El de «la
    agenda de hoy NO se cierra entera» solo tiene sentido si con 3 h de fila por delante
    todavía queda jornada; se corrió a las 19:30 de RD y no quedaba. La suite lo dice en su
    salida en vez de contarlo como aprobado, que es lo correcto: **un caso no evaluado no es
    un caso verde.** Para verlo hay que correrla por la mañana.

  · **`puertas` sube a 43 por los cinco casos «tabla» de la 101, no por la red.** La red
    entera sigue siendo **un** caso: las funciones nuevas se añaden a la llamada, no al
    conteo.

  Y una corrección al propio HANDOFF: aquí se dijo que `confianza` usaba `set local role`.
  No lo usa —solo lo nombra un comentario—; impersona con `set_config` y prueba funciones
  `SECURITY DEFINER`. Las que de verdad evalúan RLS son `puertas`, `autonomia`,
  `suscripcion`, `jornada` y `motor_cola`.

## Los cuatro fallos que más enseñaron

Van aquí porque el que retome esto los va a volver a encontrar si no los conoce.

1. **La puerta cerrada en la pantalla y abierta en el API.** Apareció **cinco** veces. Las
   políticas RLS estaban bien; el agujero estaba en las funciones `SECURITY DEFINER`, que se
   saltan RLS por definición. La red de `puertas.test.sql` **llama** a cada función
   alcanzable por un anónimo en vez de leer el código, porque leerlo ya falló. Toda función
   nueva entra en esa red el mismo día que se escribe.

   **La quinta le dio la vuelta al patrón, y por eso es la más útil** (migración 101). Esta
   vez las RLS eran el agujero y las funciones estaban bien: la 92 cerró con cuidado
   `turno_stats_periodo_perfil` para que el casero no leyera la facturación de su inquilino,
   y la TABLA `turno_historial_visitas` se quedó abierta un mes. Un `select
   sum(precio_cobrado)` con `set local role authenticated` la devolvía entera. **Cerrar la
   función y no mirar la tabla es cerrar media puerta.**

   Y la grieta era más ancha que el reporte: las políticas decían `negocio_id in (select
   turno_mis_negocios())`, y esa función **incluye los locales donde eres solo CLIENTE** — lo
   mismo que ya tumbó el cron en la 73. O sea que cualquiera que se uniera con el código del
   local se llevaba lo que factura el local entero y las citas de los demás, con nombre y
   hora. Desde la 101 las tres tablas del núcleo van por `turno_manda_en_la_silla`.

   La cuarta es la que mejor lo enseña (migración 97). La 95 puso cuidado en que el letrero
   NO delatara al barbero que no había pagado —frase neutra, razonada en su cabecera— y en la
   línea siguiente escribió `grant execute on turno_silla_al_dia to authenticated, anon`: la
   misma pregunta, contestada de frente a cualquiera con la llave del APK. El grant no
   sostenía nada (solo la llaman funciones `SECURITY DEFINER`, que corren con el rol del
   dueño). **El cuidado de una migración no protege lo que la migración de al lado regala.**

   Y de paso salió una exención podrida: `turno_perfil_acepta` y `turno_perfil_operable`
   estaban fuera de la red con el motivo «viven dentro de una política RLS». Comprobado
   contra `pg_policies` y `pg_constraint`: no viven en ninguna. Una exención con el motivo
   caducado es peor que ninguna, porque parece decidida.

2. **Devolver vacío no es negarse** (migración 84). Cuatro funciones no tenían portero
   ninguno: contestaban `null` al desconocido. No se escapaba nada — hasta el día que
   alguien toque ese `where` y la función siga contestando, ahora con datos, sin que nada se
   ponga rojo.

3. **El cron corre sin sesión.** La migración 73 metió un trigger que exigía ser del equipo,
   y con eso tumbó el mantenimiento nocturno entero (vencer llamados, cerrar olvidados y
   cerrar citas viejas iban en la misma transacción). Arreglado en la 75. Cualquier trigger
   nuevo tiene que decidir explícitamente qué hace cuando `turno_uid()` es null.

4. **Un portero escrito con `<>` no es un portero** (migración 89).
   `turno_stats_periodo_perfil` decía

   ```sql
   if v_dueno <> public.turno_uid() and not (v_neg in (...)) then raise ...
   ```

   y parecía correcto — lo es, para un intruso registrado. Pero sin sesión `turno_uid()` es
   null, `v_dueno <> null` es **NULL**, `NULL and true` es NULL, y un `if NULL` no entra: el
   portero se queda callado y deja pasar. Comprobado contra la base real, un anónimo con la
   llave del APK se llevó ingresos, visitas, clientes y ticket medio de una silla existente.
   **Primero se pregunta si hay alguien; después se compara.**

   Y la lección de método, que es la que más duele: ese mismo fallo se probó antes con un
   uuid de ceros y salió "cerrada" — rebotaba en `perfil inexistente` mucho antes de llegar
   al portero. **Un portero se prueba con la puerta que de verdad existe.**

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
- Backend: `supabase/migrations/` (01–101), `supabase/functions/turno-enviar-push/`
- Pruebas: `supabase/tests/` (12 suites) y su `README.md`
- Docs: `CONTEXT.md` (estado), `PRODUCCION.md` (release), `ARQUITECTURA-UX.md` (el brief de
  julio), este `HANDOFF.md`
