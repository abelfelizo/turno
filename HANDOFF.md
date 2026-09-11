# HANDOFF · Turno

> Dónde se quedó el proyecto y qué sigue. Estado completo en `CONTEXT.md`;
> checklist de release en `PRODUCCION.md`.
> Última actualización: **2026-09-11** · migración **86** · rama `claude/app-status-2o0mdy`.

## TL;DR

App de **citas + fila digital para barberías** (Expo/RN + Supabase, sistema NAVAJA). Los
cuatro roles funcionan y el producto está **completo para un piloto cerrado**: lo que falta
no son pantallas, es infraestructura de lanzamiento (correo verificado y cobro).

Desde la última entrega el trabajo ha venido de **probar la app en el teléfono y corregir
lo que aparecía**, migración a migración, con el mismo método cada vez:

> reproducir el fallo contra la base real → arreglarlo → verificarlo → dejar los casos en
> una suite permanente.

Ese último paso es el que importa. Sin él, cada corrección se puede volver a romper sin que
nada avise, y ya pasó dos veces.

## Lo último que se cerró

- **Migraciones 66–86.** El sin cita es un cliente (cuenta como dinero), la fila se come la
  agenda, "te toca y el reloj corre", cómo te llega el trabajo (`modo_atencion`), la puerta
  y el letrero, la silla es de quien atiende, el que está en la silla no hace fila, los
  cuatro relojes del servicio, dónde queda el local (país + moneda), suspender no es echar,
  las reseñas se leen, mi barbero, devolver vacío no es negarse, una barbería nace abierta,
  y la prueba gratis existe de verdad.
- **Once suites de base, todas verdes** contra la BD real: cola 31, autonomía 16, fidelidad
  6, viaje 17, obstáculos 28, puertas 30, horarios 26, sin cita 21 (+1 declarado sin
  evaluar), modo 21, confianza 27, suscripción 10.

## Los tres fallos que más enseñaron

Van aquí porque el que retome esto los va a volver a encontrar si no los conoce.

1. **La puerta cerrada en la pantalla y abierta en el API.** Apareció tres veces. Las
   políticas RLS estaban bien; el agujero estaba en las funciones `SECURITY DEFINER`, que se
   saltan RLS por definición. La red de `puertas.test.sql` **llama** a cada función
   alcanzable por un anónimo en vez de leer el código, porque leerlo ya falló. Toda función
   nueva entra en esa red el mismo día que se escribe.

2. **Devolver vacío no es negarse** (migración 84). Cuatro funciones no tenían portero
   ninguno: contestaban `null` al desconocido. No se escapaba nada — hasta el día que
   alguien toque ese `where` y la función siga contestando, ahora con datos, sin que nada se
   ponga rojo.

3. **El cron corre sin sesión.** La migración 73 metió un trigger que exigía ser del equipo,
   y con eso tumbó el mantenimiento nocturno entero (vencer llamados, cerrar olvidados y
   cerrar citas viejas iban en la misma transacción). Arreglado en la 75. Cualquier trigger
   nuevo tiene que decidir explícitamente qué hace cuando `turno_uid()` es null.

## Qué sigue, en orden

### 🔴 Sin esto no hay piloto de verdad
1. **Comprar el dominio y verificar el subdominio en Brevo (SPF/DKIM).** Hoy el correo de
   OTP cae en spam: la gente no puede ni entrar. Es el único bloqueo duro.
2. **Rotar la clave SMTP** que se pegó en un chat, y actualizarla en Supabase.

### 🟠 Después
3. **Probar las notificaciones con dos teléfonos.** Hay **un solo token** en
   `turno_push_tokens`. El envío es peer-to-peer (la base no puede hacer HTTP), así que si
   el teléfono que recibe nunca registró el suyo, el push no llega **y no da error**. No se
   puede dar por bueno hasta ver dos tokens y un aviso recibido.
4. **Cobro y suscripciones.** El estado ya existe (migración 86): el local nace con 30 días
   de prueba y la pantalla dice cuántos quedan. Falta la pasarela entera, y antes que ella
   **la decisión de qué pasa cuando alguien no paga** — hoy no pasa nada, a propósito.
5. **Rediseño del panel del cliente**, rehecho contra esta rama.

## Constraint de infraestructura (CRÍTICO)

Supabase `pphnaasmirbnuilgzfeo` está **compartido con otro proyecto en producción con datos
reales**. **Tocar SOLO objetos `turno_`.** `auth.users` y el SMTP también son compartidos.
Los errores `rls_disabled` del linter son de `libro_*`, otra app, fuera de alcance.

## Mapa de archivos

- Diseño y piezas: `constants/index.ts`, `components/ui.tsx`, `components/hoja.tsx`,
  `components/tabs.tsx`
- Compartido clave: `components/agenda-trabajo.tsx` (barbero y dueño-barbero)
- Lógica: `lib/db.ts`, `lib/atencion.ts`, `lib/format.ts`, `lib/notificaciones.ts`,
  `lib/paises.ts`, `lib/pricing.ts`, `lib/whatsapp.ts`
- Pantallas: `app/(app)/{cliente,barbero,dueno}/`, `app/(auth)/`
- Backend: `supabase/migrations/` (01–86), `supabase/functions/turno-enviar-push/`
- Pruebas: `supabase/tests/` (11 suites) y su `README.md`
- Docs: `CONTEXT.md` (estado), `PRODUCCION.md` (release), `ARQUITECTURA-UX.md` (el brief de
  julio), este `HANDOFF.md`
