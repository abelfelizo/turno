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

## Estado actual
- ✅ Base de datos completa en Supabase
- ✅ Tipos TypeScript completos
- ✅ Lógica de negocio en lib/reglas.ts
- ✅ Realtime configurado
- ✅ Pantalla de agenda del barbero funcional
- ⏳ Onboarding pendiente (11 pantallas)
- ⏳ Dashboard dueño pendiente
- ⏳ Flujo cliente pendiente
