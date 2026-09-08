# Instalar el APK en Android (build en la nube con EAS)

Requiere una cuenta en https://expo.dev (gratis). Todo corre en la nube de
Expo; no necesitas Android Studio. Android **no** requiere cuenta de pago.

## Pasos (en tu máquina, dentro del proyecto)

```bash
# 1. Instala la CLI de EAS
npm install -g eas-cli

# 2. Inicia sesión con tu cuenta de expo.dev
eas login

# 3. Enlaza el proyecto (crea extra.eas.projectId en app.json).
#    Necesario para que funcione el push. Se hace una sola vez.
eas init

# 4. Genera el APK instalable (perfil preview = APK autónomo)
eas build --profile preview --platform android
```

Al terminar, EAS te da un **enlace/QR**. Ábrelo en tu Android, descarga el
`.apk` e instálalo (quizá tengas que permitir "instalar apps de esta fuente").

## Notas
- Las credenciales de Supabase ya van inyectadas en `eas.json` (perfil
  `preview`), así que el APK se conecta solo — no hace falta `.env` para el build.
- La primera vez EAS te ofrece **generar un keystore de Android**: acepta (lo
  gestiona Expo por ti).
- El build tarda ~10-20 min la primera vez.
- `DEV_LOGIN=true` sigue activo: entras en "modo prueba" sin configurar correo.
- El **push "Es tu turno"** funciona en este APK (a diferencia de Expo Go),
  porque `eas init` deja el `projectId` que necesita el registro de token.
- Datos demo listos: barbería `DEM-B9DH`, barbero `CAR-E3DJ`.

## Si prefieres probar sin generar APK
`npm install --legacy-peer-deps` y `npx expo start`, luego abre con **Expo Go**.
Prueba todo menos el push.
