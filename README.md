# Turno

App de gestión de agenda para barberías en Latinoamérica.

## Setup

```bash
cp .env.example .env
# Agrega tu Supabase anon key en .env
npm install
npx expo start --ios
```

> **Para retomar el proyecto, lee `CONTEXT.md`** (estado real) y `HANDOFF.md` (qué sigue).
> Este README es el mapa de entrada; los dos de arriba son el estado.

## Supabase
- Proyecto: pphnaasmirbnuilgzfeo (compartido con Préstalo — **tocar solo `turno_`**)
- Tablas: prefijo `turno_`
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

## Pruebas de la base

El núcleo de la app es un motor de cola concurrente en Postgres, y eso `tsc` no lo puede
mirar. Se prueba con **10 suites SQL** en `supabase/tests/` (`npm run test:db`), cada una
dentro de una transacción que **siempre revierte** — la base es compartida y no puede
quedar ni un registro. Detalle en `supabase/tests/README.md`.

Regla del repo: cuando se arregla algo, **el caso se queda en una suite**. Reproducir el
fallo contra la base, arreglarlo, verificarlo, y dejarlo cubierto.

## Estado actual (2026-09-11, migración 85)

- ✅ Los cuatro roles completos: cliente, barbero, dueño y dueño-barbero
- ✅ Motor de cola, citas, fidelidad, reseñas, suspensión y barbero de confianza en Postgres
- ✅ 85 migraciones versionadas + 10 suites de prueba verdes contra la BD real
- ✅ Push desplegado (envío peer-to-peer: la base no puede hacer HTTP)
- 🔴 **Dominio + SPF/DKIM en Brevo** — sin esto el OTP cae en spam y no hay piloto
- 🟠 Cobro y suscripciones: `lib/pricing.ts` calcula, pero no hay pasarela
- 🟠 Notificaciones sin probar con dos teléfonos (hay un solo token registrado)
