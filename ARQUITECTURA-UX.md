# ARQUITECTURA UX · Turno

> Auditoría de exposición + rediseño de la arquitectura de navegación + especificación
> pantalla por pantalla. **Este documento es el brief para la propuesta visual (Claude
> Design): nada de lo listado aquí puede quedarse fuera.**
> Fuente: piloto real en Android (hallazgos del dueño del producto) + auditoría de código
> y BD (2026-07-03). Sistema visual: NAVAJA (ver CONTEXT.md).

---

## 1. Decisiones de producto (reglas que cambian)

Estas reglas gobiernan el rediseño. Las pantallas de la sección 4 las asumen.

| # | Regla | Hoy | Debe ser |
|---|-------|-----|----------|
| R1 | **Turnos simultáneos** | 1 turno activo por cliente, global (índice único sobre `cliente_id`): no puedes tener barbero Y manicurista | 1 turno activo **por tipo de servicio** (`barbero` / `manicuri_pedicuri`). Barbero + manicure a la vez = válido. Dos barberos a la vez = bloqueado |
| R2 | **Confirmar "voy en camino"** | Disponible desde el segundo 1, sin considerar cercanía del turno | **Bloqueado hasta que el turno esté cerca**: se habilita cuando quedan ≤ N personas delante o ETA ≤ M min (config del negocio; default N=2). En ese momento la app manda push "Prepárate, casi te toca — ¿vas en camino?" con acción de confirmar |
| R3 | **Entrar a la fila** | Un toque = adentro, sin información previa | **Hoja de confirmación** previa: barbero, servicio, precio, duración, personas delante, espera estimada, ventana de llegada. Bloquear barberos en descanso/inactivo |
| R4 | **Citas múltiples** | Solo la próxima cita es visible; la segunda queda invisible e incancelable | Todas las citas futuras visibles, cada una con cancelar y **reprogramar** |
| R5 | **Reservas grupales** | No existen (aunque `grupo_id` existe en BD) | "¿Para cuántas personas?" en cita y fila. La app reserva N espacios consecutivos (mismo barbero, duración×N) o paralelos (barberos distintos), enlazados por `grupo_id`. Caso 20 de reglas.ts |
| R6 | **Puntos por barbero independiente** | Sistema de puntos solo a nivel de negocio (lo decide el dueño) | El `barbero_renta` decide si acepta puntos y configura su beneficio (puntos por visita, visitas para premio). Para empleados sigue mandando el negocio |
| R7 | **Re-engagement** | No existe | La app detecta clientes sin visitar hace X días (X configurable por barbero), les manda push de recordatorio, y el barbero ve la lista de "clientes por recuperar" para dar seguimiento |
| R8 | **Unirse a un local** | Escribes el código y te une a ciegas | Al escribir el código se muestra el local ("Te vas a unir a **Barbería Demo**") y confirmas |
| R9 | **Turno expirado** | Desaparece en silencio ("no tienes turno activo") | Estado visible "Tu turno expiró" + push + opción de reentrar |
| R10 | **Reglas del barbero** | Límite de fila + buffer + horarios + estado | Panel amplio: anticipación propia de citas, días de descanso/vacaciones por rango, recordatorio de re-visita (R7), puntos propios (R6), domicilio, límite de fila, buffer |

## 2. Auditoría de exposición (existe vs. visible)

### 🔴 Existe en backend pero NO está expuesto (o mal expuesto)

| Capacidad | Estado en UI | Dónde debe vivir |
|---|---|---|
| **Asignación por dueño** (`asignacion_por_dueno`) | El cliente cae en pool general, pero el dueño **no tiene ninguna UI para asignar** — el flujo está roto de punta a punta | Dashboard dueño: cola con lista y botón "Asignar a…" por entrada |
| **Cola con nombres (dueño)** | Dashboard muestra solo 4 números | Lista viva: quién, servicio, tipo (cita/digital/físico), con quién, hace cuánto espera |
| **Canje de puntos** | El cliente ve su progreso, pero cuando llega a la meta **no existe flujo de canje** (ni para él ni para el barbero que cobra) | Cliente: botón "Canjear" al llegar a la meta → genera vale visible; Barbero: al cobrar, ve el vale y lo aplica |
| **Doble servicio** (`doble_servicio_activo`) | Toggle en config del dueño, pero **ningún flujo cliente lo usa** (relacionado con R1) | Flujo de reserva: permitir combinar corte + manicure |
| **Confiabilidad del cliente** (`no_shows`, `llegadas_tarde`, `abandonos`) | Se consultan en `getCitasHoy` pero **no se muestran nunca** al barbero | Ficha del cliente (agenda) y lista de clientes: indicador de confiabilidad |
| **Reseñas (lado barbero)** | El cliente califica; el barbero **jamás ve su rating ni los comentarios** | Stats del barbero: rating promedio + últimas reseñas |
| **Código del barbero** | Enterrado dentro de Config | Header de la agenda del barbero + botón compartir (como el código del local en el dashboard del dueño); visible al cliente en el perfil del barbero |
| **Multi-local del barbero** | Un `barbero_renta` en 2+ locales no tiene selector — la sesión queda clavada en uno | Selector de local en el panel del barbero (como el del cliente) |
| **Bloqueos** | Solo "bloquear hora de HOY"; sin ver/borrar bloqueos ni rangos (vacaciones) | Calendario del barbero: bloqueos por rango, lista, eliminar |
| **Deep link de notificaciones** | Tocar una push no lleva a ningún lado | Toda push abre la pantalla pertinente (Mi turno, agenda, etc.) |
| **Domicilio** (`domicilio_activo`) | El cliente ve la etiqueta "· Domicilio" pero no puede pedirlo | Ficha/reserva: opción "a domicilio" cuando el barbero lo ofrece (definir alcance V2) |

### 🟠 Expuesto pero con proceso deficiente (hallazgos del piloto)

| Proceso | Problema | Corrección (regla) |
|---|---|---|
| Entrar a la fila | Sin info previa, un toque te compromete | R3 |
| "Pedir turno" en Mi turno vacío | Te expulsa al home | Pedir desde esa misma pantalla (abre la hoja R3) |
| Confirmar "voy en camino" | Disponible al instante | R2 |
| Turno barbero + manicurista | "Ya tienes un turno activo" | R1 |
| Cita para varias personas | Imposible | R5 |
| Segunda cita futura | Invisible | R4 |
| Reprogramar cita | No existe | R4 |
| Unirse con código | A ciegas | R8 |
| Barbero pendiente de aprobación | Limbo con botón manual | Realtime + push al aprobar |
| Días cerrados en agendar | Se ofrecen igual | Deshabilitar días sin horario |
| Estadísticas | Totales de siempre, sin períodos | Períodos 7d/30d/todo + desgloses (sección 4) |

## 3. Arquitectura de navegación

### CLIENTE — 4 tabs + modales
```
[Inicio]   [Reservar]   [Mis turnos]   [Perfil]
```
- **Inicio** — marca del local (logo/eslogan/dirección), selector de locales (+ buscar barbero por código), estado vivo del local (cuánta fila hay), barberos con foto/especialidad/estado/rating, accesos a reservar.
- **Reservar** (flujo unificado, reemplaza la dualidad home-fila/agendar):
  1. ¿Fila ahora o cita programada?  2. ¿Cuántas personas? (R5)  3. Barbero(s)  4. Servicio(s)  5. (cita) día/hora con días cerrados deshabilitados  6. **Hoja resumen** (R3) → confirmar.
- **Mis turnos** — segmentos: **Activo** (fila en vivo: posición, ETA, botón "voy en camino" con gating R2, salir) · **Próximas** (todas las citas, cancelar/reprogramar R4) · **Historial** (visitas + calificar). Estado expirado visible (R9).
- **Perfil** — datos, preferencias, fidelidad (progreso + **canje**), locales, cerrar sesión.
- Modales: hoja de confirmación de reserva, buscar barbero, detalle de cita, reseña, canje.

### BARBERO — 5 tabs
```
[Agenda]   [Calendario]   [Clientes]   [Stats]   [Perfil]
```
- **Agenda (hoy)** — header con **su código compartible**; cola en vivo como **lista con nombres** (servicio, tipo, espera, ficha con confiabilidad); llamado actual + siguiente; citas de hoy; walk-in; selector de local si trabaja en varios.
- **Calendario** (nueva) — semana/mes: citas futuras, bloqueos por rango (vacaciones), gestión de horarios semanales (se muda desde Config).
- **Clientes** — segmentos: **Todos** (agregado por persona, con confiabilidad) · **Por recuperar** (R7: sin visitar hace X días, con WhatsApp/push de seguimiento). Ficha + nota privada.
- **Stats** — selector de período (**Hoy / 7 días / 30 días / Todo**): ingresos (+comparación vs. período anterior), visitas, clientes nuevos vs. recurrentes, ticket promedio, desglose por servicio y por origen (cita/fila/walk-in), horas pico, **su rating y últimas reseñas**, no-shows recibidos.
- **Perfil** — identidad pública (foto, bio, especialidad, contactos, código), **Mis reglas** (R10: límite fila, buffer, anticipación, re-visita, puntos propios si es renta R6, domicilio), estado (disponible/descanso), suscripción, cuenta.

### BARBERÍA (rol interno `dueno`) — 4 tabs + conmutador de modo
```
Header: [Barbería | Mi silla]  ← conmutador, solo si el dueño atiende
[Dashboard]   [Equipo]   [Stats]   [Config]
```
"Mi silla" cambia al **panel Barbero completo** (5 tabs de barbero). Así el
dueño-barbero tiene todas las opciones de ambos roles, no un recorte.
- **Dashboard** — código del local compartible; hoy en números; **cola del local como lista viva con nombres** (quién, con quién, servicio, espera) y, si `asignacion_por_dueno`, botón **Asignar a…** por entrada; alertas (solicitudes pendientes, barberos en descanso).
- **Equipo** (nueva, se separa del dashboard) — botón **"Agregar barbero"** (invitación con código por WhatsApp, pre-etiquetada empleado/renta); solicitudes de ingreso (aprobar/rechazar); lista de barberos (tipo empleado/renta, estado, ocupación de hoy, rating, WhatsApp, **desvincular**).
- **Stats** — mismos períodos que barbero + ranking por barbero, ocupación de sillas, ingresos del local.
- **Config** — marca y contacto, funciones del local (puntos, asignación, doble servicio), tiempos, suscripción (asientos/monto), cuenta.

### Terminología: el panel se llama "Barbería"

En toda la UI, donde hoy dice "Dueño" debe decir **"Barbería"** (el panel
representa al negocio, no un título personal): "Panel de la barbería", botón
dev "Barbería", etc. El rol interno en BD sigue siendo `dueno` (no se migra).

### El panel Barbería, escenario por escenario

La app resuelve el panel según dos datos: la membresía `dueno` y si tiene perfil
propio (`perfil_id` ⇒ atiende).

**Regla del dueño-barbero: tiene TODO lo de ambos roles.** No basta con
incrustarle "Mi agenda": debe tener el panel Barbería completo **y** el panel
Barbero completo (agenda, calendario, clientes con seguimiento, stats de su
silla, su perfil público con código). Solución de navegación: **conmutador de
modo** en el header — `[Barbería | Mi silla]` — que alterna entre los dos
juegos de pestañas sin cerrar sesión. Quien no atiende, no ve el conmutador.

| | Dueño-barbero (atiende) | Solo empleados | Solo rentas | Mixto |
|---|---|---|---|---|
| **Modo Barbería** | Completo (5 tabs) | Completo | Completo | Completo |
| **Modo Mi silla** | ✅ Panel barbero COMPLETO (Agenda, Calendario, Clientes, Stats de silla, Perfil con su código) | ❌ Sin conmutador | ❌ Sin conmutador | Según atienda |
| **Stats (modo Barbería)** | El local | El local (ingresos = suyos) | El local **separando**: volumen de rentas (informativo, NO es su ingreso) | Ingresos de empleados (suyos) + volumen de rentas (informativo) |
| **Config → Suscripción** | mínimo × (1 + empleados), tope | mínimo × empleados, tope | **mínimo** (cuota de gestión) | mínimo × (él + empleados), tope; rentas aparte |

### Agregar barbero / agregar barbería (altas activas, no solo pasivas)

Hoy el alta es 100% pasiva: el barbero debe conseguir el código y la barbería
solo espera la solicitud. Deben existir las dos direcciones:
- **Barbería → Equipo → "Agregar barbero":** comparte el código/link de
  invitación por WhatsApp ("Únete a mi barbería en Turno con el código X"),
  indicando si será empleado o renta. La solicitud entrante llega pre-etiquetada.
- **Barbero → Perfil → Mis locales → "Agregar barbería":** escribe el código del
  local (con preview R8), elige empleado/renta, envía solicitud. (Es la misma
  puerta del 2º local de la sección 3b.)

Correcciones que esto exige (hoy NO se cumplen):
- **Stats del dueño rentista infladas:** `getEstadisticasNegocio` suma TODO el
  historial del local — un dueño que solo renta sillas ve como "ingresos" dinero
  que es de sus rentas. Separar ingresos propios (empleados + su silla) del
  volumen de rentas.
- **El dueño-barbero no ve sus stats personales** de silla por separado (solo las
  del local). Añadir la vista "Mi silla".
- En Equipo, cada barbero debe mostrar su tipo (empleado/renta) porque cambia
  quién paga y de quién es el ingreso.

## 3b. Ciclo de vida: altas y bajas (hoy solo existen las altas, y solo en onboarding)

Auditoría del flujo agregar/quitar en los tres perfiles:

| Actor | Acción | Hoy | Debe existir |
|---|---|---|---|
| Cliente | Agregar barbería | ✅ "+" en Inicio (con R8) | — |
| Cliente | **Salirse de una barbería** | ❌ No existe (la membresía queda para siempre) | Perfil → Mis locales → "Salir de este local" (membresía `activo=false`; historial se conserva) |
| Barbero | Unirse a un local | ⚠️ Solo durante el onboarding | — |
| Barbero | **Unirse a un 2º local** (multi-local) | ❌ No existe ninguna puerta post-onboarding — el multi-local que soporta el código de barbero no tiene entrada | Perfil → Mis locales → "Trabajar en otro local" (código del local → solicitud → aprobación del dueño) |
| Barbero | **Salirse de un local** (renuncia / deja la silla) | ❌ No existe | Perfil → Mis locales → "Dejar este local": perfil `activo=false`; citas futuras se cancelan con aviso a los clientes; historial y clientela lo siguen (ya son por persona) |
| Dueño | Crear barbería | ⚠️ Solo en onboarding | Perfil → "Crear otro local" (multi-local del dueño) + selector de local |
| Dueño | Aprobar/rechazar solicitudes | ✅ Dashboard | Se muda a Equipo |
| Dueño | **Desvincular a un barbero activo** (se fue, lo despidió) | ❌ NO EXISTE — solo se puede rechazar pendientes | Equipo → barbero → "Desvincular": perfil y membresía `activo=false`; citas futuras canceladas + push a clientes; su historial lo acompaña. Confirmación fuerte |
| Dueño | **Cerrar/desactivar el local** | ❌ Sin UI (la columna `activo` existe) | Config → zona peligrosa: "Cerrar local" (avisa a clientes y equipo; los rentas conservan su cuenta/código) |
| Todos | **Eliminar cuenta** | ❌ No existe — **obligatorio para publicar en App Store y Google Play** | Perfil → "Eliminar mi cuenta" (baja lógica + borrado de datos personales) |

Reglas comunes de toda baja: (1) nunca borrar historial — bajas lógicas
(`activo=false`); (2) toda baja con citas/turnos futuros los cancela y notifica;
(3) la identidad y clientela del barbero le pertenecen y lo siguen (código de
barbero); (4) confirmación explícita con consecuencias enumeradas.

### Convenciones de estados (aplican a TODAS las pantallas)

Cada pantalla del rediseño debe definir sus 5 estados — el diseño visual debe
entregarlos todos, no solo el "camino feliz":
1. **Cargando** — skeleton/spinner con la estructura de la pantalla.
2. **Vacío** — mensaje humano + acción sugerida (ej. "No tienes turnos → Reservar").
3. **Error** — qué pasó + reintentar (nunca pantalla en blanco; ErrorBoundary es el último recurso).
4. **Contenido** — el estado normal.
5. **Tiempo real** — qué se actualiza solo (cola, estados de barbero, citas) y cómo se
   nota (sin saltos bruscos; los cambios de posición en fila deben animarse/señalizarse).

Inventario de modales/hojas: confirmación de reserva (R3), detalle de cita
(cancelar/reprogramar), reseña, canje de puntos, walk-in (barbero), bloqueo de
horario, asignar cliente (dueño), buscar barbero, compartir código.

## 4. Matriz de notificaciones (push)

| Evento | A quién | Cuándo | Acción al tocar |
|---|---|---|---|
| Quedan ≤N delante (R2) | Cliente | Al cruzar el umbral | Mi turno → botón "voy en camino" habilitado |
| "Es tu turno" | Cliente | Al llamarlo (existe) | Mi turno |
| Turno por expirar / expirado (R9) | Cliente | T-2 min / al expirar | Mi turno (reentrar) |
| Recordatorio de cita | Cliente | T-24h y T-2h | Detalle de cita (confirmar) |
| Cita por confirmar (caso 13) | Cliente | Al entrar en ventana de anticipación | Detalle de cita |
| Cita cancelada/reprogramada | Barbero | Al ocurrir | Agenda |
| Nueva cita agendada | Barbero | Al ocurrir | Agenda |
| Nuevo cliente en su fila | Barbero (opcional) | Al ocurrir | Agenda |
| Solicitud aprobada | Barbero | Al aprobar | Su agenda |
| Nueva solicitud de barbero | Dueño | Al ocurrir | Equipo |
| "Hace X días que no vienes" (R7) | Cliente | Cron diario | Reservar |
| Meta de fidelidad alcanzada | Cliente | Al ocurrir | Canje |

Infra: requiere push server-side (trigger/cron → edge function `turno-enviar-push`) y manejo de deep links al tocar la notificación. Los recordatorios programados usan pg_cron.

## 5. Cambios de backend requeridos

1. **R1:** reemplazar índice único `turno_cola_un_turno_activo(cliente_id)` por único sobre `(cliente_id, tipo_servicio)` — denormalizar `tipo_servicio` en `turno_cola` (derivado del servicio) para cubrir el pool sin perfil.
2. **R2:** columna `umbral_confirmacion` en configuración; RPC `turno_confirmar_camino` valida el umbral; cron/trigger que detecta el cruce del umbral y dispara push.
3. **R5:** RPC `turno_reservar_grupo` (citas consecutivas/paralelas con `grupo_id`) y `turno_entrar_a_cola` con `p_cupos`.
4. **R6:** columnas de puntos en `turno_perfiles` (activo, por_visita, meta) que priman sobre el negocio para `barbero_renta`; trigger de puntos las respeta.
5. **R7:** RPC "clientes por recuperar" (última visita > X días) + cron de push + columna `revisita_dias` en perfiles.
6. **Canje:** tabla/RPC de vales (`turno_canjes`): emitir al llegar a meta, aplicar al cobrar.
7. **Asignación por dueño:** RPC `turno_asignar_cola(cola_id, perfil_id)` (dueño only).
8. **R4:** RPC/flujo reprogramar (cancela + crea atómico, conserva historial).
9. **Stats por período:** RPCs con `desde/hasta` + desgloses (servicio, origen, hora) para barbero y negocio; rating propio del barbero.
10. **Ciclo de vida (3b):** RPCs `turno_salir_local` (cliente), `turno_dejar_local` (barbero: desactiva perfil + cancela citas futuras + notifica), `turno_desvincular_barbero` (dueño, mismo efecto), `turno_cerrar_local` (dueño), `turno_eliminar_cuenta` (baja lógica + limpieza de datos personales; requisito de tiendas). Reusar `turno_unirse_profesional` para el 2º local (ya es idempotente por negocio) con pantalla post-onboarding.
11. **Stats del dueño separadas:** `getEstadisticasNegocio` debe separar ingresos propios (empleados + silla del dueño) del volumen de rentas (join membresías por rol), y añadir la vista "mi silla" para el dueño-barbero.
12. Pendientes ya detectados en la revisión de código: **tipo_usuario no se promueve a 'profesional'** en upserts (bloquea el código de barbero), **zona horaria del negocio** (todas las comparaciones de ventanas/fechas deben usar la TZ del local, no UTC), normalización de códigos server-side, limpieza de columnas/funciones muertas.

## 6. Fases de implementación sugeridas

- **F1 · Núcleo del dolor del piloto ✅ HECHO:** R3 (hoja de confirmación) + R1 (turno por tipo) + pedir desde Mi turno + lista con nombres en dashboard dueño + R4 (citas visibles/reprogramar) + R9 (expirado visible) + fixes de tipo_usuario y timezone. _(migraciones 26–27)_
- **F2 · Vivo y proactivo ✅ HECHO (con salvedad):** R2 (gating de "voy en camino" server-side) + push en eventos (llamar, aprobar) + aprobación de barbero en vivo (realtime) + deep links. **Salvedad:** el push _programado_ desde la BD (recordatorios por cron) requiere `pg_net`, ausente en este proyecto compartido; los recordatorios de cita quedan pendientes de esa infra (o de disparo desde un servicio externo). _(migración 28)_
- **F2b · Ciclo de vida ✅ HECHO:** bajas en los tres perfiles (salir de local, dejar local, desvincular barbero, cerrar local), eliminar cuenta (requisito de tiendas) y stats del dueño separadas (propias vs. rentas). _Pendiente menor:_ unirse/crear 2º local post-onboarding y el conmutador "Mi silla" del dueño-barbero. _(migración 28)_
- **F3 · Crecimiento ✅ HECHO:** R7 (re-engagement) + R6 (puntos por renta) + canje (emitir/aplicar) + asignación por dueño + stats por período + código del barbero expuesto (header de agenda). _(migraciones 29–30)_
- **F3b · Extras post-F3 ✅ HECHO:**
  - **R5 citas grupales:** reserva de N espacios seguidos con el mismo barbero (padre + hijos), enlazados por `grupo_id`. Sólo aplica a **citas** — la parte de **cola** sigue fuera porque choca con el índice único `(cliente_id, tipo_servicio)` de R1 y necesita rediseño de la invariante. _(migración 31)_
  - **Recordatorios de cita:** locales, agendados por el dispositivo (T-24h/T-2h) — no necesitan `pg_net`.
  - **Barbero multi-local:** selector de local activo + "Trabajar en otro local" (reusa `unirse_profesional`).
- **F4 · Propuesta visual (Claude Design)** sobre esta arquitectura, pantalla por pantalla. _(pendiente — único bloque restante)_

## 7. Riesgos de producción (revisión de julio)

| # | Riesgo | Estado |
|---|--------|--------|
| P1 | **Backdoor de desarrollo**: `entrarModoPrueba()` daba acceso de **dueño** a cualquiera con el APK, con la credencial en texto plano y commiteada. F2b había ampliado el daño posible (cerrar local, desvincular, eliminar cuenta). | ✅ Cerrado: función eliminada, `DEV_LOGIN` fuera, contraseña rotada |
| P2 | **Cero pruebas automatizadas** sobre un motor de cola concurrente con invariantes reales. Todo se validaba con `tsc` (tipos) + prueba manual. | ✅ `supabase/tests/motor_cola.test.sql`, 12 casos, 12/12 verde |
| P3 | **Entrega de correo del OTP.** El login de producción es correo + código. El SMTP interno de Supabase está **fuertemente limitado** (pocos envíos/hora) y en muchos proyectos solo entrega a miembros del equipo. Si es el caso, un cliente real **no recibe el código y no puede entrar**: la app muere en la pantalla de login. | ⚠️ **Verificar antes del piloto** — configurar SMTP propio (Resend/SendGrid) en Auth → SMTP Settings |
| P4 | **Fricción del correo en RD.** Los clientes de barbería usan más WhatsApp que correo. El OTP por email puede frenar la adopción aunque funcione técnicamente. | 📌 Anotado: decidir OTP por teléfono/WhatsApp (requiere proveedor SMS, coste) antes de abrir a clientes |
| P5 | **Pagos / suscripción**: el modelo está diseñado (`lib/pricing.ts`, asientos con tope) pero **no hay cobro implementado**. No se puede monetizar el piloto. | 📌 Pendiente de decisión de negocio |

**Regla que deja P2:** cualquier cambio a `turno_entrar_a_cola`,
`turno_llamar_siguiente`, `turno_confirmar_camino`, `turno_expirar_llamados` o
`turno_agendar_grupo` debe correr la suite antes de darse por bueno. La primera
corrida ya encontró un bug de producción (reserva grupal rota por una FK).

**Pendientes menores conocidos (no bloquean F4):** dueño "crear otro local" (reusar onboarding), conmutador `[Barbería | Mi silla]` (el dueño ya tiene pestaña "Mi agenda"), calendario/bloqueos por rango, y recordatorios de re-visita/otros push **programados** desde servidor (requieren `pg_net`, ausente en la BD compartida).
