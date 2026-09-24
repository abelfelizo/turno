-- EL CASERO NO LE CIERRA EL DÍA AL INQUILINO
--
-- Salió de la auditoría de salud de la base, buscando otra cosa. El linter de
-- rendimiento avisaba de «múltiples políticas permisivas» en siete tablas
-- `turno_`: una `_select` y una `_write` marcada `for all`. Y `for all` también
-- concede SELECT, así que la pregunta no era de rendimiento sino de permisos:
-- **¿alguna `_write` deja LEER más que su `_select`?** Comprobadas las siete:
-- ninguna. Pero al leerlas en fila apareció otra cosa.
--
-- `turno_bloqueos_write` decía:
--
--     turno_es_mi_perfil(perfil_id) OR turno_perfil_admin(perfil_id)
--
-- `turno_perfil_admin` es «soy el dueño del local de esa silla», **sin mirar la
-- modalidad**. Comprobado contra la base con un local de asientos alquilados:
--
--     el casero LEE el bloqueo de su inquilino  -> "asunto personal mio"
--     el casero le ESCRIBE un bloqueo de 9 a 6  -> PASÓ
--
-- O sea que el dueño de un local de alquiler puede **cerrarle el día entero** a
-- alguien que solo le paga una silla. Eso no es una fuga, es sabotaje, y es
-- exactamente lo que la migración 92 dejó escrito que no puede pasar:
--
--   > «Si pudieras apagarle la app no serías su casero, serías su jefe — y
--   >  entonces no es un alquiler.»
--
-- La 92 arregló las FUNCIONES —`turno_manda_en_la_silla` nació ahí— y la 101
-- arregló las políticas de cola, citas e historial. Esta política se quedó por
-- el camino, con la versión anterior de la regla. La misma familia, la tercera
-- vez: **una regla que solo se arregla en un sitio no es una regla.**
--
-- FAMILIA ENUMERADA, no supuesta. Buscando en `pg_policies` toda política que
-- nombre `turno_perfil_admin` sin mirar la autonomía, en todo el esquema:
-- **sale exactamente una**, ésta. Las de `turno_horarios`, `turno_jornadas` y
-- `turno_servicios` ya usan R11 entera y están bien.
--
-- ── Y DE PASO, EL MOTIVO ────────────────────────────────────────────────────
-- La lectura era `turno_perfil_en_mis_negocios(perfil_id)`: cualquiera que
-- pertenezca al local, **clientes incluidos**. El `motivo` de un bloqueo lo
-- escribe el barbero a mano, y es suyo:
--
--     un CLIENTE del local lee 1 bloqueo -> "terapia con el psicologo"
--
-- Es la migración 102 otra vez —allí eran las alergias— y la respuesta es la
-- misma: el cliente necesita saber que **ese hueco no está**, y eso ya se lo da
-- `turno_slots_disponibles`, que es SECURITY DEFINER y no pasa por esta
-- política. No necesita la fila, solo el efecto.
--
-- Comprobado antes de cerrar: `getBloqueosFecha` se llama en un único sitio de
-- la app —`components/agenda-trabajo.tsx`— y siempre con `ss.perfil_id`, tu
-- propia silla. Ninguna pantalla de cliente lee esta tabla.
--
-- Las dos quedan con la misma pregunta, que es la que la 92 escribió para esto:
-- **`turno_manda_en_la_silla`** = es mía, O soy su jefe y no es autónoma.

drop policy if exists turno_bloqueos_select on turno_bloqueos;
create policy turno_bloqueos_select on turno_bloqueos
  for select using (public.turno_manda_en_la_silla(perfil_id));

drop policy if exists turno_bloqueos_write on turno_bloqueos;
create policy turno_bloqueos_write on turno_bloqueos
  for all
  using      (public.turno_manda_en_la_silla(perfil_id))
  with check (public.turno_manda_en_la_silla(perfil_id));
