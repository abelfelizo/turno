# Checklist de producción · Turno

> Lo que falta para pasar del piloto a una app instalable con gente de verdad.
> Última actualización: **2026-09-11** · migración **85**.
> Estado general en `CONTEXT.md`.

## 0. 🔴 EL BLOQUEO REAL: el correo

Todo lo demás puede esperar; esto no. La app entra con **código OTP por email**, y hoy ese
correo **cae en spam**. Un piloto en el que la gente no puede ni iniciar sesión no es un
piloto.

- [ ] **Comprar un dominio.**
- [ ] **Verificar el subdominio en Brevo: SPF y DKIM.** Es lo único que saca el correo de
      spam de forma fiable.
- [ ] Apuntar el SMTP de Supabase Auth a ese remitente ya verificado.
- [ ] Probar el alta desde un teléfono que nunca haya usado la app, con Gmail y con
      Hotmail — no desde el correo de siempre, que ya tiene el remitente "aprendido".

- [ ] 🔴 **Rotar la clave SMTP** que se pegó en un chat y actualizarla en Supabase. Mientras
      no se haga, esa clave hay que darla por comprometida.

## 1. Notificaciones push — probarlas de verdad

Todo el código está desplegado y el `projectId` de EAS ya está en `app.json`. Lo que **no**
está hecho es comprobar que funcionan, y hay una razón concreta para dudarlo:

> En `turno_push_tokens` hay **un solo token**, de un solo usuario.

El envío es **peer-to-peer**: lo dispara la app del barbero, porque la base de datos de este
proyecto **no puede hacer llamadas HTTP** (no hay `pg_net`). Si el teléfono que tiene que
recibir nunca registró su token, el push no va a ninguna parte **y no da ningún error**. Por
eso "no me llegan las notificaciones" no tiene por qué ser un fallo del envío.

- [ ] Instalar el build en **dos** teléfonos y entrar con dos cuentas distintas.
- [ ] Confirmar en `turno_push_tokens` que hay **dos** filas.
- [ ] Como barbero, "Llamar siguiente" → el otro teléfono recibe "Es tu turno".
- [ ] Si no llega con los dos tokens presentes, entonces sí: mirar los logs de la edge
      function `turno-enviar-push`.

### Qué ya está hecho (no rehacer)
- Tabla `turno_push_tokens` + RPC `turno_guardar_push_token` (upsert por token). RLS: cada
  quien gestiona el suyo.
- Edge function `turno-enviar-push`, desplegada y ACTIVE (`verify_jwt=true`); lee tokens con
  service role y postea a `https://exp.host/--/api/v2/push/send`.
- `lib/notificaciones.ts`: `registrarPush()` al iniciar sesión y `enviarPush()` al llamar al
  siguiente. `estadoAvisos()` dice si hay permiso y si el token quedó registrado, que es
  justo lo que hacía falta para no diagnosticar a ciegas.
- `app.json`: plugin `expo-notifications`, `UIBackgroundModes: remote-notification`,
  `android.package`, `extra.eas.projectId`.

### Por qué NO es server-side
Un trigger en `turno_cola` que llamara a la edge function necesitaría `pg_net`, es decir
**HTTP desde dentro de una base compartida con otro proyecto en producción**. No se hace.

## 2. Cobro y suscripciones — el cimiento está, el cobro no

**Lo que ya hay** (migración 86): cada local tiene una fila en `turno_suscripciones` y
**nace con 30 días de prueba** contados desde que se creó. `turno_suscripcion(negocio)`
devuelve el estado ya resuelto —`prueba` / `activa` / `vencida` / `cortesia`—, hasta qué día
y cuántos quedan, y la pantalla del dueño lo dice ("Prueba gratis · te quedan 18 días") en
vez de enseñar un precio que nadie cobra. Cubierto por `supabase/tests/suscripcion.test.sql`.

Eso hace real la promesa de `constants.SUSCRIPCION.dias_prueba`, que llevaba meses en el
repo **sin que la leyera nadie**. `lib/pricing.ts` sigue calculando cuánto tocaría pagar
(modelo *por asiento, con piso y tope*: cliente gratis, independiente paga el mínimo, al
empleado lo cubre el dueño, el dueño paga `clamp(mínimo×asientos, mínimo, máximo)`).

**Lo que NO hay, y es deliberado: nada corta el servicio.** Ninguna función mira `al_dia`.
Un local con la suscripción vencida sigue funcionando igual, y hay un caso en la suite que
se pone rojo si alguien mete una comprobación de pago sin querer.

- [ ] **Decidir qué pasa cuando alguien no paga.** Es la decisión que bloquea todo lo demás,
      y es de producto, no técnica: ¿se cierra la fila? ¿se deja leer pero no atender? ¿hay
      días de gracia? ¿se avisa antes, y con cuánto? Cortarle el local a un barbero un
      sábado por la mañana por una regla que se coló sin pensarla es mucho peor que tardar
      en cobrar.
- [ ] Decidir la vía de cobro: compra dentro de la app (IAP + RevenueCat) o pasarela local.
      **Ojo:** un SDK de pagos es código nativo, así que **no entra por OTA** — hace falta un
      build nuevo.
- [ ] Cuentas de tienda y, si es IAP, productos dados de alta.
- [ ] Conectar la pasarela a `turno_suscripciones.pagada_hasta`. Hoy **nadie** escribe esa
      columna desde la app: la tabla no tiene política de escritura a propósito, para que ese
      día se revise quién puede tocarla en vez de heredarlo por descuido.

## 3. Build de tienda

- [ ] `assets/`: `icon.png` (1024×1024) y splash reales, referenciados en `app.json`. Hoy
      no existe la carpeta y el build usa los de por defecto.
- [ ] `eas build --profile production --platform ios` / `--platform android`.
- [ ] `eas submit` (requiere cuentas de desarrollador: Apple US$99/año, Play pago único).

## 4. Publicar una actualización OTA (lo del día a día)

GitHub → **Actions** → `actualizar.yml` → **Run workflow**, y ahí:
- **Use workflow from:** `claude/app-status-2o0mdy`
- **canal:** `preview`
- **desde:** vacío

> **Ojo:** el `env` de los perfiles de `eas.json` lo aplica `eas build`, **no** `eas update`.
> Por eso el workflow inyecta las variables a mano. Si se quitan de ahí, la OTA sale sin
> claves de Supabase y la app arranca en blanco.

## Recordatorio de infraestructura

La BD Supabase `pphnaasmirbnuilgzfeo` está **compartida con otro proyecto en producción con
datos reales**. Tocar **solo** objetos `turno_`. `auth.users` y la configuración SMTP
también son compartidas: cambiarlas afecta a la otra app.
