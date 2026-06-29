# Checklist de producción · Turno

Pasos para pasar del piloto en Expo Go a una app instalable con push reales.
Marca cada uno al completarlo.

## 1. Notificaciones push (requiere dev build — NO funcionan en Expo Go)
El código ya está implementado y desplegado. Falta solo la infraestructura EAS:

- [ ] `npm i -g eas-cli` y `eas login` (cuenta Expo).
- [ ] `eas init` en la raíz del proyecto → crea el proyecto EAS y escribe `extra.eas.projectId` en `app.json`. **Sin este projectId, `getExpoPushTokenAsync` no devuelve token** (el código lo maneja y no crashea, simplemente no registra).
- [ ] Apple: cuenta de Apple Developer (US$99/año) para push en iOS. Android no requiere cuenta para push vía Expo (FCM lo gestiona Expo).
- [ ] Pasar las claves públicas al build (no se leen del `.env` en build de nube): definir como variables EAS
      `eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url> --environment production`
      y lo mismo con `EXPO_PUBLIC_SUPABASE_ANON_KEY`. (o llenarlas en `eas.json > build.production.env`).
- [ ] Build de desarrollo para probar: `eas build --profile development --platform ios` (corre en simulador) o `--platform android`.
- [ ] Instalar el dev build, abrir la app, iniciar sesión → debe pedir permiso de notificaciones y guardar el token en `turno_push_tokens`.
- [ ] Probar el flujo "es tu turno": como barbero, "Llamar siguiente" → el cliente recibe push. (lo dispara `enviarPush` → edge function `turno-enviar-push`).

### Qué quedó hecho (no tocar, ya está)
- Tabla `turno_push_tokens` + RPC `turno_guardar_push_token` (migración `14_push_tokens.sql`, aplicada). RLS: cada quien gestiona su token.
- Edge function `turno-enviar-push` (desplegada, ACTIVE, `verify_jwt=true`). Lee tokens con service role y postea a `https://exp.host/--/api/v2/push/send`.
- Cliente: `lib/notificaciones.ts` (`registrarPush` al iniciar sesión en `app/index.tsx`; `enviarPush` en `components/agenda-trabajo.tsx` al llamar al siguiente).
- `app.json`: plugin `expo-notifications` con color de marca, `UIBackgroundModes: remote-notification`, `android.package`.

### Mejora opcional (post-piloto)
Hoy el push "es tu turno" lo dispara la **app del barbero** al pulsar "Llamar siguiente". Para que sea 100% server-side (no depende de que la app del barbero esté online), añadir un trigger en `turno_cola` al pasar a `llamado` que invoque la edge function vía `pg_net`. No incluido para no añadir HTTP-en-trigger en la BD compartida sin probarlo a fondo.

## 2. Endurecer para producción
- [ ] `constants/index.ts`: `DEV_LOGIN = false`. Esto: (a) deja de arrancar siempre como cliente, (b) oculta los botones "Barbero (dev)" / "Dueño (dev)" en `cliente/perfil.tsx`, (c) reactiva el ruteo real por rol.
- [ ] Reactivar verificación de correo / OTP si se había relajado para preview (revisar `lib/auth.ts` y Supabase Auth).
- [ ] Borrar/9 deshabilitar la cuenta demo `dev@turno.test` y el seed de demo en producción (`supabase/seed.sql` es solo para desarrollo).
- [ ] Moneda por país: hoy se asume RD$. Definir `moneda` por negocio (la columna existe) y mostrarla consistentemente en precios.
- [ ] Revisar que no queden `console.log` ruidosos en caliente.

## 3. Build de tienda
- [ ] `eas build --profile production --platform ios` / `--platform android`.
- [ ] `eas submit` a App Store / Play Store (requiere cuentas de desarrollador).
- [ ] Iconos y splash reales: crear carpeta `assets/` con `icon.png` (1024×1024) y splash, y referenciarlos en `app.json`. (Hoy no hay `assets/`; el build usa defaults.)

## Recordatorio de infraestructura
La BD Supabase `pphnaasmirbnuilgzfeo` es **compartida con Prestalo (producción) y libro_***. Tocar **solo** tablas `turno_`. Ver `CONTEXT.md`.
