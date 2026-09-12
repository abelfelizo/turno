# CONTEXT · Turno (NAVAJA)

> Archivo de retoma rápida. Léelo al iniciar un chat nuevo para no reconstruir contexto.
> Última actualización: **2026-09-11** · migración **104** · rama `claude/app-status-2o0mdy`.

## Qué es
**Turno** = app Expo/React Native de **citas + fila digital para barberías** (LatAm, foco
República Dominicana). Cuatro roles: `cliente`, `empleado` (barbero), `barbero_renta`
(alquila su asiento), `dueno`. Identidad visual **NAVAJA**: rojo `#E5202B` para lo que
decide, azul `#1646E0` para lo secundario, carbón `#16171C`, canvas `#F6F5F2`; Anton para
titulares, Plus Jakarta Sans para el resto.

---

## LO QUE HAY QUE ENTENDER ANTES DE TOCAR NADA

### 1. La regla que no se rompe: la barbería es la matriz
Un barbero **nunca** existe suelto: siempre enlazado a al menos una barbería. Garantizado
en BD (`negocio_id` NOT NULL en `turno_perfiles`, `turno_membresias`, `turno_citas`,
`turno_cola`) y en el onboarding. Para ser "independiente total" se crea su propia
barbería como dueño. El **código de barbero** es solo descubrimiento: identifica a la
persona y su historial la sigue, pero **reservar siempre pasa por un local**.

Pero «local» no quiere decir «sitio con gente»: quiere decir **el contenedor de su
negocio**. El barbero que alquila un sillón en una barbería que NO usa la app monta el suyo
de una silla y trabaja igual. Eso existía en el modelo desde siempre y no existía en la
pantalla: "trabajo en una barbería" le pedía el CÓDIGO de un local que no está en Turno, así
que se quedaba fuera en la pantalla uno.

**El onboarding crea exactamente tres tipos de usuario: cliente, barbero y dueño.** Ni uno
más — el que trabaja por su cuenta no es un cuarto tipo, es un barbero. Por eso dónde
trabaja se le pregunta DENTRO de su camino (`app/(auth)/barbero-donde.tsx`): "en una
barbería que usa Turno" pide el código; "por mi cuenta" le monta su negocio de una silla.
Y desde Config > Mis locales puede montarse el suyo sin tener que quedarse antes sin
ninguno.

### 2. La base NO puede hacer llamadas HTTP
No hay `pg_net` ni `http` en este proyecto. Consecuencia directa y no negociable: **todo
push se envía desde la app**, de teléfono a teléfono. La edge function `turno-enviar-push`
existe y está ACTIVE, pero quien la llama es el móvil del barbero, no un trigger. Cualquier
diseño que asuma "el servidor avisa" está mal en este repo.

### 3. Una regla que solo vive en la interfaz no es una regla
Es el error que más veces ha aparecido en este piloto, siempre igual: la puerta cerrada en
la pantalla y abierta en el API. Las políticas RLS estaban bien; el agujero estaba en las
funciones `SECURITY DEFINER`, que **por definición se saltan RLS** y tienen que comprobar
por su cuenta quién llama. Y su inverso también cuenta: una regla que vive solo en el
servidor mientras la pantalla promete otra cosa.

Corolario operativo: **toda función nueva se añade a la red anti-anónimos de
`puertas.test.sql` el mismo día que se escribe.** Y **devolver vacío no es negarse** — se
parecen mientras la consulta funcione, y el día que el filtro se cae una sigue contestando
en silencio (migración 84).

Esa regla dependía de que alguien se acordara, y no bastó: al ir a añadir UNA función que
faltaba, el censo contra `pg_proc` encontró **dieciocho** que la red nunca había llamado.
Desde la migración 89 la red **se cuenta sola** — `puertas.test.sql` enumera `pg_proc` y se
pone roja cuando existe una función `turno_*` que un anónimo puede ejecutar y la red no
nombra. Tres de aquellas dieciocho estaban abiertas de verdad; la peor,
`turno_stats_periodo_perfil`, soltaba la facturación de cualquier silla a un anónimo porque
`v_dueno <> turno_uid()` con uid nulo no es `true`, es `NULL`, y un `if NULL` no entra.
**Comparar contra `turno_uid()` no es comprobar que hay sesión: primero se pregunta si hay
alguien, después se compara.**

### 4. `posicion` no es el puesto
`turno_cola.posicion` es un **contador de entrada** (`max+1` sobre las filas activas,
incluida la de quien ya está sentado), no un ranking. Quien quiera saber "¿cuántos hay
delante de mí?" llama a **`turno_puesto`** (migración 78), que cuenta solo `en_fila` dentro
de la cola que le corresponde y devuelve 0 cuando ya le toca. El orden real de atención es
el par `(prioridad, posicion)`: **1** = tenía cita, **2** = fila digital, **3** = sin cita.

### 5. Infra COMPARTIDA — constraint crítico
Supabase `pphnaasmirbnuilgzfeo` se llama "Prestalo" y está **compartido con otro proyecto en
producción con datos reales** (tablas `libro_*` y las de Prestalo). **Tocar SOLO objetos con
prefijo `turno_`.** `auth.users` y la configuración SMTP también son compartidas. Los
errores `rls_disabled` del linter son de `libro_*`: fuera de alcance.

---

## Estado por rol

| Rol | Pantallas | Estado |
|---|---|---|
| Cliente | home (estado del local + dos puertas), turno, agendar, historial, perfil, preferencias, buscar-barbero | ✅ |
| Barbero | agenda (estado con cuatro relojes, fila, citas, walk-in, bloquear hora), stats, clientes (notas privadas), config por secciones | ✅ |
| Dueño | dashboard (código, aprobar, cola del local, stats), agenda, stats, ficha de barbero, config por secciones | ✅ |
| Dueño-barbero | su "Mi agenda" es la agenda de trabajo real (`components/agenda-trabajo.tsx`, compartida) | ✅ |
| Onboarding | 3 puertas (cliente, barbero, dueño) y 12 pantallas + login, con botón atrás | ✅ |

## El esquema, en una tabla

Tres tipos de usuario, y todo lo demás se deriva de la **modalidad del local**:

| | Cliente | Barbero | Dueño de asientos alquilados | Dueño de empleados |
|---|---|---|---|---|
| ¿Paga? | **Nunca** | Se paga por él **siempre** | **No**: solo agrupa | **Sí**, cubre a los suyos |
| ¿Controla la silla de otro? | — | No | **No** | **Sí** |
| ¿Cómo entra un barbero? | — | — | **Se agrega él** con el código, activo al momento | **Solo el dueño**: entra pendiente y él lo aprueba |
| ¿Qué le queda al dueño? | — | — | Suspender (quitar de la fila y la fachada) y desvincular | Todo lo de un patrón |
| ¿Y si no se paga? | Ve el local, no la fila | No aparece ni recibe cola | Su silla se apaga; el local no cuesta nada | Se apagan **todas** las sillas |

La coherencia es la que importa: **quien no dirige, tampoco autoriza ni cobra.** Las
migraciones 92 (mando), 93 (pago), 94 (puerta de entrada) y 98 (la modalidad de una persona)
son la misma regla aplicada a cuatro cosas distintas.

> **Control y pago viajan juntos** (migración 98). En un local de asientos alquilados el
> dueño NO puede nombrar empleado a nadie. Parecía un detalle de menú y era la puerta que
> abría todas las demás: pasar a 'empleado' apaga `turno_perfil_autonomo`, enciende
> `turno_manda_en_la_silla` y le devuelve de golpe todo lo que la 92 le había quitado — y
> encima gratis, porque `turno_silla_al_dia` mira el TIPO DEL LOCAL y le sigue cobrando al
> inquilino. Al revés sí: una barbería de empleados puede alquilar un asiento suelto. La
> asimetría es la misma que ya tenía la puerta de entrada desde la 38. El dueño que de
> verdad quiere empleados cambia la modalidad DEL LOCAL, y entonces paga por ellos.

### El cobro corta de verdad (migraciones 95, 96, 97 y 99)

Durante nueve migraciones la suscripción fue un dato que no apagaba nada, a propósito,
porque **qué pasa cuando alguien no paga** era una decisión de producto sin tomar. Se tomó,
y va por **una sola palanca**, `turno_silla_al_dia(perfil)`, enganchada en los dos sitios por
los que ya pasaba todo — `turno_perfil_acepta` y `turno_perfil_operable`. Una regla escrita
en quince sitios se corrige en catorce.

- **Una silla que no está al día no aparece, no acepta trabajo y no opera la fila.** El
  dueño de un local de empleados que no paga se queda sin ninguna silla —todas cuelgan de la
  misma suscripción, la suya incluida—, que es exactamente «necesita al menos un barbero pago
  para habilitar las funciones de fila».
- **El cupo por antigüedad** (96). `turno_suscripciones.sillas_pagadas` dice por cuántas se
  paga; `NULL` = sin tope (prueba y cortesía, a propósito). Cuando sobran, trabajan las más
  antiguas: es la única regla que no obliga a nadie a decidir el día que vence el pago. Sin
  esto se pagaba una silla y trabajaban cinco. Y **se ve** (99): `turno_suscripcion` lo
  devuelve, porque la 96 metió el número que decide quién trabaja y no lo sacó por ninguna
  puerta — el dueño leía "Al día · 4 asientos" con dos barberos invisibles. Una regla que
  decide quién come y que el afectado no puede consultar no es una regla, es una sorpresa.
- **Lo que NO se apaga**: las citas ya reservadas y el historial. Se corta el servicio que se
  cobra —aparecer y recibir por la app—, no el trabajo de nadie.
- **Y no se delata a quien no pagó.** `turno_fila_abierta` devuelve la frase neutra «no está
  tomando clientes ahora mismo»: lo que un barbero deba por la app es entre él y nosotros, no
  una nota en el escaparate de su negocio. La 97 cerró el atajo que la 95 se había dejado
  abierta al lado — `turno_silla_al_dia`, `turno_perfil_acepta` y `turno_perfil_operable`
  contestaban esa misma pregunta a cualquiera con `EXECUTE`.
- **En la app**: `turno_local_operativo(negocio)` no decide nada —la regla ya se aplica sola,
  silla a silla— y existe solo para poder DECÍRSELO al dueño en vez de dejarle un panel
  apagado sin explicación. El cliente de un local sin sillas al día ve el negocio entero
  (nombre, dirección, sus tarjetas) y ninguna fila.

## Lo que decide cada quién

- **La modalidad del LOCAL manda, no la persona** (`turno_negocios.tipo`): `empleados` → la
  barbería pone servicios, precios y horarios; `espacios_rentados` → cada barbero paga su
  asiento y pone sus reglas. El rol se **deriva** del tipo del local al entrar con el
  código, y desde la migración 94 la **aprobación también**: en asientos alquilados el
  barbero entra ACTIVO —se agrega él— y con empleados entra pendiente. Los **bloqueos**
  (almuerzo, un rato fuera) son del barbero siempre: solo quitan disponibilidad, nunca la
  inventan.
- **Modo de atención** por barbero (`modo_atencion`): `solo_citas`, `solo_fila`, `ambos`.
  Cubre al que solo trabaja con cita sin obligarle a apagar nada más.
- **El casero no es el jefe** (migración 92). R11 decía quién pone precios y horarios;
  faltaba el resto del poder, que iba por `turno_perfil_operable` —«mi silla, O soy el dueño
  del local»— sin mirar la modalidad. Con eso el dueño podía, sobre la silla de alguien que
  le PAGA RENTA, llamarle clientes, sentarle gente, cerrarle la jornada, leerle la cartera
  con teléfonos y leerle la facturación. Ahora todo eso pasa por
  **`turno_manda_en_la_silla`**, con la misma forma que `turno_manda_en_el_horario`:

  > **es mía  OR  (soy el dueño del local  AND  no es autónomo)**

  Al empleado lo dirige su barbería; al que renta, nadie. El perfil dueño, en un local de
  asientos alquilados, **solo agrupa**.
- **Suspender no es echar** (migración 81) — y desde la 92 tampoco es apagar. Para un
  EMPLEADO sigue parándolo del todo: eso le corresponde a su patrón. Para un AUTÓNOMO
  significa «te saco de la fila y de la fachada del local»: desaparece del escaparate y la
  puerta lo rechaza, pero **sigue atendiendo a quien tenga delante**, con su agenda, sus
  precios y su dinero. Si el dueño pudiera apagarle la app no sería su casero, sería su jefe
  — y entonces no es un alquiler.
- **Cada silla paga la suya** (migración 93), y decide la modalidad del LOCAL, igual que
  R11: `espacios_rentados` → paga cada silla, la del dueño incluida si atiende (agrupar no
  cuesta); `empleados` → paga el local. La app pregunta por **una sola puerta**,
  `turno_suscripcion_de(perfil)`, que además devuelve `quien` para poder decirlo con
  palabras. Un local que no paga ya no arrastra al barbero que sí paga.
- **El barbero de confianza** (migración 83) decide QUIÉN te atiende, nunca CUÁNDO. Vive en
  la membresía porque el mismo cliente puede ir a dos sitios.

---

## Backend

**101 migraciones** en `supabase/migrations/`, con nombre en español que dice qué resuelven.
El motor de cola vive en Postgres: RPCs y triggers `SECURITY DEFINER` + `pg_cron` para la
limpieza nocturna.

**El cron corre SIN SESIÓN**: `turno_uid()` es null ahí. Se nos rompió el mantenimiento
entero en la migración 73 por no tenerlo en cuenta (arreglado en la 75), así que cualquier
trigger nuevo tiene que decidir explícitamente qué hace sin sesión.

### Pruebas de base — `supabase/tests/` (12 suites, `npm run test:db`)

| Suite | Qué mira |
|---|---|
| `motor_cola` | Invariantes de la fila: orden, un-turno-por-tipo, gating de "voy en camino", límite, puesto vs. posición |
| `autonomia` | Quién decide qué. Corre con `set local role authenticated`: sin eso RLS ni se evalúa |
| `fidelidad` | Visitas, meta, premio y canje, con la tarjeta del local y la del rentado |
| `viaje` | El camino feliz de punta a punta, con las mismas RPC que la app y en el mismo orden |
| `obstaculos` | El mismo día con fila, agenda y bloqueos **a la vez**: los fallos vivían en los cruces |
| `puertas` | Recorre el API **como un desconocido** y exige que se le cierre. Incluye la red anti-anónimos y **el censo** que la cuenta sola (migración 89) |
| `horarios` | La jornada, los huecos de la agenda, y cómo nace una barbería (migración 85) |
| `sin_cita` | El cliente de la calle: que cuente como visita y no se cuele |
| `modo_atencion` | Por dónde acepta trabajo cada barbero, y que el letrero diga lo mismo que la puerta |
| `confianza` | Suspender, leer reseñas y el barbero de confianza — sobre todo donde se cruzan |
| `suscripcion` | La prueba, el pago, la cortesía, **quién paga** (local o silla) y **qué se apaga** cuando no se paga: el cupo por antigüedad y que el letrero no delate a nadie |
| `jornada` | "Hoy cierro más tarde": alargar, cerrar antes, volver a la norma, y de quién es esa decisión (R11) |

**Cómo se corren.** Con `DATABASE_URL` puesto, `npm run test:db`. Sin él (el caso normal en
un entorno remoto), pegando cada archivo en el SQL editor de Supabase o por MCP
`execute_sql`. Cada suite **siempre termina en `RAISE`** para que la transacción revierta
entera: la base es compartida y no puede quedar ni un registro. Un `ERROR` de Postgres al
final no significa que falló, significa que terminó — lo que importa es el conteo y que no
haya líneas con `x`.

**Un caso no evaluado no es un caso verde.** `sin_cita` se salta solo el caso de «la agenda
de hoy NO se cierra entera» cuando es tan tarde que, con 3 h de fila por delante, ya no
queda jornada — y lo dice en su salida (`· 1 sin evaluar`) en vez de sumarlo. Por eso esa
suite da 22 por la mañana y 21 de noche, y las dos cosas están bien. Si aparece esa línea,
o se corre más temprano o se asume que ese caso no se probó hoy.

**Trampas de plpgsql que ya nos costaron tiempo:**
- Un bloque `begin … exception` **revierte sus propias sentencias** al capturar: los
  fixtures creados dentro desaparecen. Se crean fuera.
- `set_config(..., true)` y `set local role` son de la transacción: hechos dentro de un
  bloque que captura, se deshacen con él.
- Desde la migración 85 el perfil **nace con jornada sembrada**, así que un `insert into
  turno_horarios` pelado choca con el índice único `(perfil_id, dia_semana)`. Va con
  `on conflict … do update`.

---

## Arquitectura / archivos clave

- `constants/index.ts` — COLORS (paleta NAVAJA), FONTS, SPACING, RADIUS, `DEV_LOGIN`.
- `components/ui.tsx` — Display (Anton), Button, Badge, Chip, Avatar, Card, KV, PuntoVivo.
- `components/hoja.tsx` — **la hoja inferior compartida**. Sube con el teclado
  (`KeyboardAvoidingView`) y se cierra tocando fuera. Todo formulario que salga de abajo usa
  esta, no un `Modal` suelto.
- `components/tabs.tsx` — `useOpcionesTabs()`: la barra respeta los controles del sistema
  vía `useSafeAreaInsets()`.
- `components/agenda-trabajo.tsx` — la agenda de trabajo **compartida** entre barbero y
  dueño-barbero. No duplicar.
- `components/estado-local.tsx`, `components/resenas.tsx`, `components/clientes-local.tsx`.
- `lib/db.ts` — casi todas las queries y RPC. Los embeds ambiguos de `turno_citas` se
  desambiguan con `!servicio_id` / `!perfil_id` / `!cliente_id`. Exporta `ordenDeAtencion`,
  que es el orden de la fila tal y como lo ve la pantalla.
- `lib/atencion.ts` — modo de atención y estado de la fila en palabras.
- `lib/format.ts` — `hora12`, `dinero`, `relojesDeSilla` (los cuatro tiempos del servicio).
- `lib/paises.ts` — países, monedas y dirección completa.
- `lib/notificaciones.ts` — registro de token y envío peer-to-peer.
- `app/index.tsx` — ruteo por sesión; resuelve `perfil_id` para no-clientes.

---

## Pendiente

### 🔴 Bloquea un piloto real
1. **Dominio + verificación del subdominio en Brevo (SPF/DKIM).** Hoy los correos de OTP
   caen en spam. Es el único bloqueo duro para meter gente de verdad.
2. **Rotar la clave SMTP** que se pegó en un chat, y actualizarla en Supabase.

### 🟠 Funcional, sin terminar
3. **La pasarela de pago.** Todo lo de alrededor ya está: cada local y cada silla nacen con
   **30 días de prueba** (86 y 93), la modalidad del local decide quién paga (93), y desde la
   95 **no pagar apaga la fila de verdad**, con el cupo por antigüedad de la 96 para que
   pagar una silla no dé para cinco. `lib/pricing.ts` calcula cuánto tocaría ("por asiento,
   con piso y tope"). Lo que falta es **cobrarlo**: hoy `pagada_hasta` y `sillas_pagadas` se
   escriben a mano. Un SDK de pagos es código nativo: **no entra por OTA**.
4. **Notificaciones sin probar de verdad.** Solo hay **un** token registrado en
   `turno_push_tokens`. Como el envío es peer-to-peer, si el teléfono que recibe nunca
   registró el suyo, el push no va a ninguna parte y **no da error**. Antes de dar por
   bueno el sistema hay que ver dos teléfonos con token.
5. **Rediseño del panel del cliente** — pendiente de rehacer contra esta rama (la primera
   versión se hizo contra `main`, que va muy por detrás).

---

## Cómo correr

- Expo SDK 55, React 19.2, RN 0.83.6. `babel-preset-expo` **pineado** a `~55.0.22` (el 56
  rompe el runtime con `NativeJSLogger.addListener`).
- `npx expo start` **sin `--clear`**, esperar a que `curl localhost:8081/status` diga
  "running", y luego `xcrun simctl openurl <DEVICE> exp://127.0.0.1:8081`.
- Publicar OTA: Actions → `actualizar.yml` → **Use workflow from
  `claude/app-status-2o0mdy`**, canal `preview`, *desde* vacío.
- **Ojo con EAS:** el `env` de los perfiles de `eas.json` lo aplica `eas build`, **no**
  `eas update`. El workflow lo inyecta a mano por eso.
- Si Metro crashea con "Cannot find module 'async-limiter'": `npm install async-limiter`.

## Documentos
`HANDOFF.md` (dónde se dejó y qué sigue) · `PRODUCCION.md` (checklist de release) ·
`ARQUITECTURA-UX.md` (el brief de rediseño de julio, ya implementado casi entero) ·
`supabase/tests/README.md` (cómo y por qué se prueba la base).
