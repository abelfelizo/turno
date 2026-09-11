-- PERTENECER NO ES PODER MIRAR
--
-- Reportado desde el teléfono: «las barberías no deberían ver datos económicos
-- si rentan». Al ir a comprobarlo salió eso y dos cosas más, y las tres por la
-- misma grieta.
--
-- La migración 92 cerró con cuidado las FUNCIONES que le daban al casero la
-- facturación de su inquilino: turno_stats_periodo_perfil y
-- turno_clientes_por_recuperar pasaron a exigir turno_manda_en_la_silla. Lo que
-- nadie miró es que la TABLA estaba abierta. Reproducido contra la base antes
-- de tocar nada, con `set local role authenticated`:
--
--   casero  → select sum(precio_cobrado) from turno_historial_visitas
--             where perfil_id = <su inquilino>   →  3 visitas, 4500.00
--
-- Es el fallo número uno de este repo por quinta vez: **una regla que solo vive
-- en la función no es una regla.** Y esta vez ni siquiera hacía falta una
-- función SECURITY DEFINER de por medio — bastaba con consultar la tabla.
--
-- ── Y LA GRIETA ERA MÁS ANCHA DE LO QUE SE PEDÍA ────────────────────────────
-- Las tres políticas decían lo mismo:
--
--   cliente_id = turno_uid()  OR  negocio_id in (select turno_mis_negocios())
--
-- y `turno_mis_negocios()` DEVUELVE TAMBIÉN LOS LOCALES DONDE ERES SOLO
-- CLIENTE. Eso ya está escrito en este repo desde la migración 73, donde la
-- misma confusión dejó que un cliente marcara su propia cita como atendida. Con
-- ella, comprobado igual:
--
--   un cliente cualquiera  → la facturación ENTERA del local: 4500.00
--   un cliente cualquiera  → las citas de los demás clientes, con nombre y hora
--
-- O sea que cualquiera que se una con el código de la barbería se lleva lo que
-- factura y la agenda de todo el mundo. No hacía falta ser el casero.
--
-- ── LA REGLA, QUE YA EXISTÍA ────────────────────────────────────────────────
-- No hay que inventar nada: `turno_manda_en_la_silla` (migración 92) contesta
-- exactamente la pregunta que hay que hacer aquí —
--
--   es mi silla  OR  (soy el dueño del local  AND  no es autónomo)
--
-- Con eso: el barbero ve lo suyo; el dueño de empleados ve a su equipo; y el
-- que alquila un asiento es un negocio aparte también para leer. Es la misma
-- llave de la 92, puesta ahora en la puerta que faltaba.
--
-- Lo tuyo se sigue viendo siempre: `cliente_id = turno_uid()` va delante, así
-- que el cliente conserva su historial y sus citas.
--
-- ── LA COLA, QUE TIENE UN CASO MÁS ──────────────────────────────────────────
-- En turno_cola hay turnos SIN barbero asignado ("cualquiera disponible"), y el
-- equipo del local tiene que verlos: es a quien el servidor le va a entregar el
-- siguiente cliente, y hay un caso permanente en motor_cola.test.sql que lo fija
-- («RLS le deja ver también al de "cualquiera disponible"»). Para esos se
-- comprueba pertenencia AL EQUIPO —tener un perfil activo en el local—, que no
-- es lo mismo que pertenecer al local. Va en línea y no como función nueva para
-- no meter otra puerta en la red anti-anónimos por una condición de tres líneas.

-- ── LO QUE SE FACTURA ───────────────────────────────────────────────────────
drop policy if exists turno_historial_select on turno_historial_visitas;
create policy turno_historial_select on turno_historial_visitas
  for select using (
    cliente_id = public.turno_uid()
    or public.turno_manda_en_la_silla(perfil_id)
  );

-- ── LA AGENDA ───────────────────────────────────────────────────────────────
drop policy if exists turno_citas_select on turno_citas;
create policy turno_citas_select on turno_citas
  for select using (
    cliente_id = public.turno_uid()
    or public.turno_manda_en_la_silla(perfil_id)
  );

-- ── LA FILA ─────────────────────────────────────────────────────────────────
drop policy if exists turno_cola_select on turno_cola;
create policy turno_cola_select on turno_cola
  for select using (
    cliente_id = public.turno_uid()
    or public.turno_manda_en_la_silla(perfil_id)
    -- El turno que aún no tiene barbero: lo ve el equipo del local, porque es
    -- el que puede acabar atendiéndolo. Pertenecer como CLIENTE no basta.
    or (perfil_id is null and exists (
          select 1 from public.turno_perfiles p2
           where p2.negocio_id = turno_cola.negocio_id
             and p2.usuario_id = public.turno_uid()
             and p2.activo))
  );
