# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Turno** is a mobile app for managing barbershop / salon scheduling in Latin
America. It is an **Expo (React Native) + TypeScript** app using **expo-router**
for file-based navigation and **Supabase** (Postgres + Realtime) as the backend.

The product manages three concurrent "queue" types (confirmed appointments,
digital queue, physical walk-ins) with a priority system, and supports four user
roles. See `lib/reglas.ts` for the 20 business rules that resolve queue
conflicts.

## Language & naming convention (important)

The entire codebase — identifiers, table names, types, comments, and UI strings
— is written in **Spanish**. This is intentional and consistent. When adding or
modifying code, **keep Spanish naming** (e.g. `crearCita`, `getColaActiva`,
`negocio_id`, `EstadoCita`). Do not "translate" existing names to English.
UI copy is in Spanish (and dates use locale `es-DO`).

## Commands

```bash
npm install              # install deps
npm start                # expo start (dev server / Metro)
npm run ios              # expo start --ios
npm run android          # expo start --android
```

There is **no test suite, linter, or build script** configured. Type checking
is available via `npx tsc --noEmit` (project uses `strict: true`).

## Setup / environment

Create a `.env` from the example and add the Supabase anon key:

```bash
cp .env.example .env     # then add your Supabase anon key
```

The Supabase client (`lib/supabase.ts`) reads two **public** env vars (note the
`EXPO_PUBLIC_` prefix required by Expo to expose them to the client):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

There is no `.gitignore` in the repo yet — be careful not to commit a real
`.env` with secrets.

## Architecture

### Roles (`RolUsuario` in `types/index.ts`)

- `dueno` — owner; created the shop, approves barbers, sees the full panel
- `barbero_renta` — independent barber renting space, pays own subscription
- `empleado` — employee working for the owner; owner pays
- `cliente` — always free

### Routing (expo-router, file-based)

```
app/
  _layout.tsx          root Stack (headerShown: false, light status bar)
  index.tsx            entry: reads local session, redirects by role
  (auth)/              onboarding flow (Stack) — 11 screens + welcome
  (app)/
    barbero/           Tabs: agenda, stats, clientes, config
    dueno/             Tabs: dashboard (Mi local), agenda, stats, config
    cliente/           Tabs: home, turno, historial, perfil
```

- `app/index.tsx` is the router root: it loads the local session via
  `getSesion()` and `router.replace()`s to the right area based on `rol`
  (cliente → `cliente/home`, dueno → `dueno/dashboard`, else → `barbero/agenda`).
- Route groups `(auth)` and `(app)` are parentheses-wrapped so they don't add
  URL segments. Each role folder has a `_layout.tsx` defining its bottom `Tabs`.

### `lib/` — all backend & business logic

- `supabase.ts` — single Supabase client (AsyncStorage-backed auth session).
- `db.ts` — **all** database queries live here. Every table is namespaced with
  the helper `const T = (tabla) => \`turno_${tabla}\``. Add new queries here
  rather than calling Supabase directly from screens.
- `realtime.ts` — Supabase Realtime subscriptions (`suscribirCola`,
  `suscribirCitas`, `suscribirEstadoPerfil`, `desuscribir`). Filtered by
  `negocio_id` / `perfil_id`.
- `storage.ts` — local session persistence in AsyncStorage (`guardarSesion`,
  `getSesion`, `limpiarSesion`). The `SesionLocal` shape holds
  `usuario_id`, `rol`, and optional `perfil_id` / `negocio_id`.
- `reglas.ts` — pure business-logic helpers + the documented 20 conflict cases
  (`puedeAgendar`, `calcularExpiracion`, `haExpirado`, `enVentanaGracia`,
  `calcularETA`, `determinarSiguiente`, `tieneturnoActivo`).
- `whatsapp.ts` — opens WhatsApp deep links for reminders / charging
  (`cobrarPorWhatsApp`, `recordarCita`).

### `types/index.ts` — single source of truth for types

All domain types and entities (`Negocio`, `Usuario`, `Perfil`, `Servicio`,
`Horario`, `Cita`, `Cola`, `Grupo`, `HistorialVisita`, etc.) plus the state
unions (`EstadoCita`, `EstadoCola`, `RolUsuario`, …). Update this file when the
DB schema changes.

### `constants/index.ts`

`COLORS` (theme palette — `primary` navy `#1a1a2e`, `gold` `#C9A84C`, semantic
colors), AsyncStorage `KEYS`, state maps (`ESTADOS_CITA`, `ESTADOS_COLA`),
`PRIORIDAD_COLA`, and `TIEMPOS_DEFAULT`. Use these instead of hardcoding values.

## Domain model: the queue system

Three queue types resolved by priority (lower number = higher priority):

1. **Confirmed appointment** (`prioridad: 1`) — absolute priority.
2. **Digital queue** (`prioridad: 2`) — joined via app, waits remotely.
3. **Physical queue** (`prioridad: 3`) — walk-in, no app.

State machines:

- **Cita:** `creada → confirmada → en_camino → atendida`
  (plus `no_confirmada`, `no_llego`, `cola_prioritaria`, `cancelada`)
- **Cola:** `en_fila → llamado → en_camino → atendido`
  (plus `expirado`, `reinsertado`, `abandonado`)

The 20 conflict-resolution cases are documented inline in `lib/reglas.ts`. Read
them before changing any scheduling/priority logic.

## Backend (Supabase)

- Project ID referenced in README: `pphnaasmirbnuilgzfeo` (shared with another
  app, "Préstalo"). **All Turno tables are prefixed `turno_`** — never touch
  non-`turno_` tables. ~17 tables, ~7 triggers.
- A Supabase MCP server is available in this environment for inspecting schema
  (`list_tables`, `list_migrations`, `execute_sql`, etc.). Prefer read-only
  inspection; `apply_migration` writes directly to the remote project, so use it
  with care and only when explicitly asked.

## Conventions for new code

- **Screens** are React function components with hooks. Data is loaded in a
  `cargar()` async function called from `useEffect`; realtime subscriptions are
  set up alongside and cleaned up in the effect's return. See
  `app/(app)/barbero/agenda.tsx` as the reference implementation.
- **Styling**: `StyleSheet.create` at the bottom of each file, conventionally
  named `s`. Pull colors from `COLORS`. No external UI/styling library.
- **Data access**: go through `lib/db.ts`. Functions `throw` on Supabase error
  and return `data` (or `[]` for lists).
- **Navigation**: `useRouter()` from expo-router; `router.push()` /
  `router.replace()` / `router.back()`.
- Imports use relative paths (e.g. `../../../lib/db`); no path aliases are
  configured.

## Implementation status

Many screens are intentional placeholders/stubs. As of the latest state:

- ✅ Database, TypeScript types, business rules (`reglas.ts`), realtime wiring.
- ✅ `app/(auth)/welcome.tsx` and the barber agenda
  (`app/(app)/barbero/agenda.tsx`) are fully implemented.
- ⏳ The 11 `(auth)` onboarding screens are stubs (each marked with a
  `TODO: Implementar pantalla de onboarding` comment and a "Pantalla pendiente"
  UI).
- ⏳ All `dueno/*` and `cliente/*` tab screens (and barber `stats`, `clientes`,
  `config`) are ~8-line "Próximamente" stubs.

When implementing a stubbed screen, mirror the patterns in `welcome.tsx`
(simple navigation screens) or `barbero/agenda.tsx` (data-driven screens with
realtime + refresh control).
