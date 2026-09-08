# CONTEXT · Turno (NAVAJA)

> Archivo de retoma rápida. Léelo al iniciar un chat nuevo para no reconstruir contexto.
> Última actualización: 2026-07-02.

## Qué es
**Turno** = app Expo/React Native de **citas + cola digital para barberías** (LatAm, foco República Dominicana). 4 roles: `cliente`, `empleado` (barbero), `barbero_renta` (independiente), `dueno`. Identidad visual = sistema **NAVAJA** (rojo `#E5202B` CTA, azul `#1646E0` secundario, carbón `#16171C`, canvas `#F6F5F2`; fuentes Anton + Plus Jakarta Sans).

## REGLA INVARIABLE: la barbería es la matriz
Un barbero **nunca** existe suelto: siempre está enlazado a al menos una barbería.
Garantizado en BD (`negocio_id` NOT NULL en `turno_perfiles`, `turno_membresias`,
`turno_citas`, `turno_cola`) y en el onboarding (el barbero solo entra con el código
de un local; para ser "independiente total" crea su propia barbería como dueño).
El **código de barbero** (ver abajo) es solo una capa de descubrimiento: identifica al
barbero y su historial lo sigue, pero **reservar siempre pasa por una barbería**
(`turno_barbero_negocios` solo devuelve locales con perfil activo/aprobado).
No romper esto.

## Códigos (local y barbero) — se generan solos en BD
- **Código de barbería** (`turno_negocios.codigo_acceso`): lo crea `turno_gen_codigo()`
  al crear el local. 6 chars `A–Z`+`0–9`, único entre negocios. El dueño lo comparte
  para que barberos y clientes se unan.
- **Código de barbero** (`turno_usuarios.codigo_barbero`): lo asigna el trigger
  `turno_asignar_codigo_barbero` cuando el usuario se vuelve `profesional` (los clientes
  no reciben). 6 chars `A–Z`+`0–9`, único entre usuarios. Backfill hecho.
- Ambos: se guardan/buscan en MAYÚSCULA; colisiones evitadas con reintento.

## Novedades de esta sesión (además de lo de abajo)
- **Suscripción** (modelo "por asiento, con piso y tope"): cliente gratis; barbero
  independiente paga el mínimo; empleado lo cubre el dueño; dueño paga
  `clamp(mínimo×asientos, mínimo, máximo)` → todo dueño paga al menos el mínimo.
  Lógica en `lib/pricing.ts` + `turno_asientos_negocio`; montos placeholder en
  `constants.SUSCRIPCION`. Cobro real por IAP pendiente (cuentas de tienda + RevenueCat).
- **Identidad del barbero a nivel persona** (foto/bio/especialidad/contactos en
  `turno_usuarios`, no en el perfil) + **código de barbero** compartible.
- **Datos que siguen al barbero**: estadísticas, clientes y notas privadas agregados por
  persona (`turno_mis_*`, `turno_notas_barbero`).
- **Cliente encuentra al barbero por su código** (`cliente/buscar-barbero`).
- Correcciones: motor de cola (cita bloquea solo su ventana), `.single()`→`.maybeSingle()`,
  ErrorBoundary, moneda consistente (`lib/format.dinero`), CI de typecheck.
- Migraciones 15–21. Todo en el PR #2 (rama `claude/app-status-2o0mdy`).

## Estado actual (alto nivel)
**Funcionalmente completa para los 4 roles. Lista para piloto cerrado.** Lo que falta es infraestructura de lanzamiento, no pantallas.

| Rol | Pantallas | Estado |
|---|---|---|
| Cliente | home, turno, agendar, historial, perfil, preferencias | ✅ |
| Barbero | agenda (cola 3 grupos, llamar/atender, walk-in, bloquear hora), stats, clientes (notas privadas), config (estado, servicios, horarios) | ✅ |
| Dueño | dashboard (código, aprobar barberos, cola, stats), agenda, stats, config | ✅ |
| Dueño-barbero | su "Mi agenda" = agenda de trabajo real (perfil propio) | ✅ |
| Onboarding | 11 pantallas + login, con botón atrás | ✅ |

- **Horario:** todo el sistema en 12h AM/PM vía `lib/format.ts` `hora12()`.
- **WhatsApp:** disparadores funcionando (`lib/whatsapp.ts`): `avisarTurno` (cliente llamado), `recordarCita`, `escribirCliente`, `cobrarPorWhatsApp`. Wired en agenda de trabajo y clientes.
- **Push:** código + backend **listos y desplegados** (tabla `turno_push_tokens`, RPC, edge function `turno-enviar-push` ACTIVE, `lib/notificaciones.ts`, push "Es tu turno" al llamar). Falta SOLO el dev build EAS para probar en dispositivo (ver `PRODUCCION.md`). No funciona en Expo Go.
- **Motor de cola:** 20 reglas en Postgres (RPCs + triggers SECURITY DEFINER + pg_cron). 14 migraciones en `supabase/migrations/`.
- **QA:** flujos E2E probados por SQL simulando jwt de cada rol; 2 bugs reales corregidos (confiabilidad, prioritaria guard). `tsc` limpio, 0 stubs/TODOs.

## Pendiente (orden recomendado) — detalle en `PRODUCCION.md` y `HANDOFF.md`
1. **Dev build EAS para push** — el código ya está; falta `eas init` (projectId), cuenta Apple, vars EAS, y `eas build --profile development` para probar el push real en dispositivo. No funciona en Expo Go.
2. **Endurecer para producción** — `DEV_LOGIN=false` en `constants/index.ts` + quitar botones "(dev)" en `cliente/perfil.tsx` + borrar cuenta `dev@turno.test` + definir moneda por país (hoy se asume RD$).
3. **Disparadores WhatsApp avanzados** (recordatorios automáticos por cron) — los manuales ya están.
4. **i18n / moneda por país.**
5. **Tests / CI** — hoy la verificación es manual/SQL.
6. **(Opcional) push 100% server-side** — trigger en `turno_cola`→`pg_net` en vez de disparo desde la app del barbero (ver `PRODUCCION.md`).

## Arquitectura / archivos clave
- `constants/index.ts` — COLORS (paleta NAVAJA), FONTS, SPACING, RADIUS, `DEV_LOGIN`.
- `components/ui.tsx` — Display (Anton), Button, Badge, Chip, Pole, Avatar, Card, KV, Icon.
- `components/agenda-trabajo.tsx` — **agenda de trabajo COMPARTIDA** (`AgendaTrabajo({titulo})`). La usan barbero/agenda Y dueño/agenda (cuando el dueño atiende). Evita duplicar código.
- `lib/db.ts` — ~todas las queries/RPC. Embeds ambiguos de `turno_citas` se desambiguan con `!servicio_id` / `!perfil_id` / `!cliente_id`.
- `lib/format.ts` (`hora12`), `lib/whatsapp.ts`, `lib/storage.ts` (sesión AsyncStorage), `lib/realtime.ts`, `lib/auth.ts`.
- `app/index.tsx` — ruteo por sesión; resuelve `perfil_id` para no-clientes (incluye dueño-barbero).
- `app/(app)/{cliente,barbero,dueno}/` — paneles. `app/(auth)/` — onboarding.

### Demo / dev
Con `DEV_LOGIN=true` la app arranca SIEMPRE como cliente (hub). Usuario dev `183b…` es cliente + barbero aprobado (perfil `a3`) en "Barbería Demo" + dueño. Saltos de rol: cliente Perfil → botones "Barbero (dev)" / "Dueño (dev)" (setean rol + `perfil_id` en sesión).

## Infra — CONSTRAINT CRÍTICO
Supabase proyecto `pphnaasmirbnuilgzfeo` (ref MCP) está **COMPARTIDO** con **Prestalo (producción, datos reales)** y tablas `libro_*` (otra app). **Tocar SOLO tablas `turno_`.** Nunca modificar Prestalo/libro_*. Los 8 errores `rls_disabled` del linter son de `libro_*` (fuera de scope; avisado al usuario). Detalle: ver memoria `turno-supabase-compartido`.

## Cómo correr (simulador iOS)
- Expo SDK 55, React 19.2, RN 0.83.6. `babel-preset-expo` PINEADO a `~55.0.22` (NO 56 — el 56 rompe el runtime con `NativeJSLogger.addListener`).
- Arrancar: `npx expo start` **sin `--clear`** (iCloud + Metro tarda mucho con --clear). Esperar a que `curl localhost:8081/status` diga "running", luego `xcrun simctl openurl <DEVICE> exp://127.0.0.1:8081`.
- Capturas del simulador exceden 2000px → reducir con `sips -Z 1200` antes de leer.
- **Gotcha resuelto (2026-06-24):** un `npm install` reconcilió node_modules y faltaba la dep transitiva `async-limiter` (de `ws` en `@react-native/dev-middleware`) → Metro crasheaba con "Cannot find module 'async-limiter'". Se reinstaló; si reaparece tras tocar node_modules: `npm install async-limiter`.

## Memorias relacionadas
`turno-sistema-navaja` (diseño + estado por rol), `turno-estado-y-plan` (plan por fases), `turno-supabase-compartido`, `turno-run-simulador`, `turno-documentos-y-gotchas`.
