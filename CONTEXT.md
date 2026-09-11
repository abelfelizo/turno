# CONTEXT · Turno (NAVAJA)

> Archivo de retoma rápida. Léelo al iniciar un chat nuevo para no reconstruir contexto.
> Última actualización: **2026-09-11** · migración **85** · rama `claude/app-status-2o0mdy`.

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
| Onboarding | 11 pantallas + login, con botón atrás | ✅ |

## Lo que decide cada quién

- **La modalidad del LOCAL manda, no la persona** (`turno_negocios.tipo`): `empleados` → la
  barbería pone servicios, precios y horarios; `espacios_rentados` → cada barbero paga su
  asiento y pone sus reglas. El rol se **deriva** del tipo del local al entrar con el
  código. Los **bloqueos** (almuerzo, un rato fuera) son del barbero siempre: solo quitan
  disponibilidad, nunca la inventan.
- **Modo de atención** por barbero (`modo_atencion`): `solo_citas`, `solo_fila`, `ambos`.
  Cubre al que solo trabaja con cita sin obligarle a apagar nada más.
- **Suspender no es echar** (migración 81): el dueño para a un empleado unos días sin
  desvincularlo — conserva clientes, citas e historial.
- **El barbero de confianza** (migración 83) decide QUIÉN te atiende, nunca CUÁNDO. Vive en
  la membresía porque el mismo cliente puede ir a dos sitios.

---

## Backend

**85 migraciones** en `supabase/migrations/`, con nombre en español que dice qué resuelven.
El motor de cola vive en Postgres: RPCs y triggers `SECURITY DEFINER` + `pg_cron` para la
limpieza nocturna.

**El cron corre SIN SESIÓN**: `turno_uid()` es null ahí. Se nos rompió el mantenimiento
entero en la migración 73 por no tenerlo en cuenta (arreglado en la 75), así que cualquier
trigger nuevo tiene que decidir explícitamente qué hace sin sesión.

### Pruebas de base — `supabase/tests/` (10 suites, `npm run test:db`)

| Suite | Qué mira |
|---|---|
| `motor_cola` | Invariantes de la fila: orden, un-turno-por-tipo, gating de "voy en camino", límite, puesto vs. posición |
| `autonomia` | Quién decide qué. Corre con `set local role authenticated`: sin eso RLS ni se evalúa |
| `fidelidad` | Visitas, meta, premio y canje, con la tarjeta del local y la del rentado |
| `viaje` | El camino feliz de punta a punta, con las mismas RPC que la app y en el mismo orden |
| `obstaculos` | El mismo día con fila, agenda y bloqueos **a la vez**: los fallos vivían en los cruces |
| `puertas` | Recorre el API **como un desconocido** y exige que se le cierre. Incluye la red anti-anónimos |
| `horarios` | La jornada, los huecos de la agenda, y cómo nace una barbería (migración 85) |
| `sin_cita` | El cliente de la calle: que cuente como visita y no se cuele |
| `modo_atencion` | Por dónde acepta trabajo cada barbero, y que el letrero diga lo mismo que la puerta |
| `confianza` | Suspender, leer reseñas y el barbero de confianza — sobre todo donde se cruzan |

**Cómo se corren.** Con `DATABASE_URL` puesto, `npm run test:db`. Sin él (el caso normal en
un entorno remoto), pegando cada archivo en el SQL editor de Supabase o por MCP
`execute_sql`. Cada suite **siempre termina en `RAISE`** para que la transacción revierta
entera: la base es compartida y no puede quedar ni un registro. Un `ERROR` de Postgres al
final no significa que falló, significa que terminó — lo que importa es el conteo y que no
haya líneas con `x`.

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
3. **Cobro y suscripciones.** `lib/pricing.ts` calcula los planes (modelo "por asiento, con
   piso y tope": cliente gratis, barbero independiente paga el mínimo, al empleado lo cubre
   el dueño, el dueño paga `clamp(mínimo×asientos, mínimo, máximo)`). La pantalla dice que
   el pago "se habilitará próximamente". **No hay ni un cobro**: falta cuenta de tienda y
   pasarela (IAP / RevenueCat, o local).
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
