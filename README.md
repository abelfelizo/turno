# Turno

App de gestión de agenda para barberías en Latinoamérica.

## Setup

```bash
cp .env.example .env
# Agrega tu Supabase anon key en .env
npm install
npx expo start --ios
```

## Supabase
- Proyecto: pphnaasmirbnuilgzfeo (compartido con Préstalo)
- Tablas: prefijo `turno_` (17 tablas, 7 triggers)
- Anon key: Supabase → Settings → API

## Arquitectura

### Roles
- `dueno` — creó el local, aprueba barberos, ve panel completo
- `barbero_renta` — independiente en local ajeno, paga su suscripción
- `empleado` — trabaja para el dueño, el dueño paga
- `cliente` — siempre gratis

### Flujos de onboarding
- Tengo una barbería → tipo negocio → ¿atiende? → config → código
- Trabajo en una barbería → tipo servicio → situación → código/independiente
- Soy cliente → código del local → preferencias → home

### Cola — 3 tipos con prioridades
1. **Cita confirmada** — prioridad absoluta
2. **Cola digital** — entró por app, espera en casa
3. **Cola física** — llegó al local sin app

Ver `lib/reglas.ts` para los 20 casos de resolución de conflictos.

### Máquina de estados
**Cita:** creada → confirmada → en_camino → atendida
**Cola:** en_fila → llamado → en_camino → atendido

## Estructura
```
app/
  (auth)/          — onboarding (11 pantallas)
  (app)/
    barbero/       — agenda, stats, clientes, config
    dueno/         — dashboard local, agenda propia, stats, config
    cliente/       — home, turno, historial, perfil
lib/
  supabase.ts      — cliente Supabase
  db.ts            — todas las queries
  storage.ts       — sesión local
  realtime.ts      — subscriptions en tiempo real
  reglas.ts        — 20 reglas de negocio
  whatsapp.ts      — mensajes WhatsApp
types/index.ts     — TypeScript completo
constants/index.ts — colores, keys, estados
```

## Seguridad y Auth
- **Auth:** Supabase Auth con código OTP por email (familia magic link). Ver `lib/auth.ts`.
  Para WhatsApp/SMS OTP: configurar un proveedor de teléfono en Supabase Auth.
- **RLS:** activado en las 17 tablas `turno_` con políticas por pertenencia
  (`turno_membresias`) y propiedad. `anon` no tiene acceso.
- **Migraciones versionadas:** `supabase/migrations/`. Datos demo: `supabase/seed.sql`
  (barbería de prueba, código de acceso `DEMO01`).
- ⚠️ Este proyecto Supabase es **compartido** con Prestalo (producción) y `libro_*`.
  Tocar SOLO tablas `turno_`.

## Estado actual
- ✅ Build coherente (Expo SDK 52, `expo-doctor` 18/18)
- ✅ Base de datos + RLS + Auth (Fase 0)
- ✅ Tipos TypeScript completos
- ✅ 7 funciones-trigger de negocio en Postgres (visitas, puntos, confiabilidad…)
- ✅ Realtime configurado
- ✅ Login + ruteo por sesión real
- ✅ Pantalla de agenda del barbero funcional
- ✅ Motor de cola (20 reglas) en Postgres + cron de expiración — Fase 1
- ✅ Onboarding completo (11 pantallas: dueño, barbero, cliente) — Fase 2
- ⏳ Paneles dueño / cliente / barbero (stats, config, home, turno…) — Fase 2 (resto)
