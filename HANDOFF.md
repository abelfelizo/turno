# HANDOFF · Turno

> Punto de entrega para retomar el proyecto (sesión cerrada 2026-06-29).
> Para el estado completo lee `CONTEXT.md`. Para llevar a producción lee `PRODUCCION.md`.

## TL;DR
App de **citas + cola digital para barberías** (Expo/RN, NAVAJA). **Los 4 roles funcionan** (cliente, barbero, dueño, dueño-barbero) y está **lista para piloto**. Esta sesión cerró: dueño-barbero, disparadores WhatsApp, e **infraestructura de notificaciones push + configuración de producción (EAS)**. `tsc` limpio.

## Qué se hizo en esta sesión
1. **Dueño-barbero** — `components/agenda-trabajo.tsx` es la agenda de trabajo compartida; `barbero/agenda.tsx` la re-exporta y `dueno/agenda.tsx` la usa cuando el dueño atiende (`perfil_id`).
2. **WhatsApp** — `lib/whatsapp.ts`: `avisarTurno`, `recordarCita`, `escribirCliente`, `cobrarPorWhatsApp`, wired en agenda y clientes.
3. **Push (código + backend, desplegado):**
   - BD: tabla `turno_push_tokens` + RPC `turno_guardar_push_token` (migración `supabase/migrations/14_push_tokens.sql`, **aplicada**; RLS + SECURITY DEFINER).
   - Edge function `turno-enviar-push` (`supabase/functions/turno-enviar-push/index.ts`, **desplegada y ACTIVE**, `verify_jwt=true`, postea a Expo Push API).
   - Cliente: `lib/notificaciones.ts` — `registrarPush()` al iniciar sesión (`app/index.tsx`) y `enviarPush()` en "Llamar siguiente" (`components/agenda-trabajo.tsx`) → push **"Es tu turno"** al cliente (`cliente_id`).
4. **Producción:** `eas.json` (perfiles dev/preview/production), `app.json` (splash NAVAJA, plugin notifications, `UIBackgroundModes`, `android.package`), `PRODUCCION.md` (checklist), `tsconfig.json` excluye `supabase/functions` (Deno).

## Estado verificado
- `tsc --noEmit` → limpio.
- BD confirmada por SQL: `turno_push_tokens` (1), RPC (1), policy (1); `turno_llamar_siguiente` retorna fila `turno_cola` con `cliente_id`.
- Edge function ACTIVE.
- ⚠️ **Sin probar en dispositivo real:** el push end-to-end (permiso → token → recepción) **requiere un dev build EAS**; no se puede validar en Expo Go ni simulador. Todo el código está listo para ese momento.

## Próximos pasos (en orden) — ver `PRODUCCION.md`
1. `eas-cli` → `eas login` → `eas init` (escribe `extra.eas.projectId` en `app.json`).
2. Cuenta Apple Developer (iOS) + variables EAS `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. `eas build --profile development` → instalar → probar push "Es tu turno".
4. Endurecer: `DEV_LOGIN=false` en `constants/index.ts` (oculta botones dev, reactiva ruteo real), moneda por país, borrar seed/cuenta demo.
5. `eas build --profile production` + `eas submit`. Crear `assets/` (icon/splash reales).

## Cómo correr ahora (piloto, Expo Go)
`npx expo start` **sin `--clear`** → `xcrun simctl openurl <DEVICE> exp://127.0.0.1:8081`. Capturas: `sips -Z 1200`. Gotcha resuelto: si Metro crashea por `async-limiter`, `npm install async-limiter`.

## ⚠️ Constraint de infraestructura (CRÍTICO)
Supabase `pphnaasmirbnuilgzfeo` está **compartido con Prestalo (producción) y `libro_*`**. **Tocar SOLO tablas `turno_`.** Los 8 errores `rls_disabled` del linter son de `libro_*` (otra app, fuera de scope).

## Mapa de archivos
- Diseño/tokens: `constants/index.ts`, `components/ui.tsx`
- Lógica: `lib/db.ts`, `lib/notificaciones.ts`, `lib/whatsapp.ts`, `lib/format.ts`, `lib/storage.ts`, `lib/realtime.ts`, `lib/auth.ts`
- Pantallas: `app/(app)/{cliente,barbero,dueno}/`, `app/(auth)/` (onboarding)
- Compartido clave: `components/agenda-trabajo.tsx`
- Backend: `supabase/migrations/` (01–14), `supabase/functions/turno-enviar-push/`
- Docs: `CONTEXT.md` (estado), `PRODUCCION.md` (release), este `HANDOFF.md`
