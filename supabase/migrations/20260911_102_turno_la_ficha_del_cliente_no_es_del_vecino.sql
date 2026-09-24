-- LA FICHA DEL CLIENTE NO ES DEL VECINO
--
-- Continuación directa de la 101, y por la misma grieta. La 101 arrancó el
-- predicado roto de tres tablas —turno_cola, turno_citas y
-- turno_historial_visitas— y no miró la cuarta que lo tenía igual.
--
--   turno_prefs_select:
--     usuario_id = turno_uid()  OR  negocio_id in (select turno_mis_negocios())
--
-- Y `turno_mis_negocios()` DEVUELVE TAMBIÉN LOS LOCALES DONDE ERES SOLO
-- CLIENTE. Es el mismo error que ya tumbó el cron en la 73 y que la 101
-- documentó entero. Reproducido contra la base antes de tocar nada, con
-- `set local role authenticated`:
--
--   un cliente cualquiera del local
--     → select * from turno_preferencias_cliente where usuario_id = <otro>
--     → 1 fila: "alérgico a la lidocaína"
--
-- La ficha lleva tipo_corte, largo, barba, **alergias**, notas y la foto de
-- referencia. Basta con unirse con el código de la barbería —que es público,
-- se comparte por WhatsApp— para leer la de cualquier otro cliente. Las
-- alergias no son una preferencia: son un dato de salud que la persona escribió
-- para que la vea quien le va a pasar la máquina, no la sala de espera.
--
-- ── POR QUÉ NO SIRVE `turno_manda_en_la_silla` AQUÍ ─────────────────────────
-- En la 101 la respuesta fue esa función, porque las tres tablas tienen
-- `perfil_id`: se podía preguntar «¿mandas en ESA silla?». La ficha no cuelga de
-- una silla, cuelga de (cliente, local): es la misma para todo el equipo, y tiene
-- que serlo — si mañana te atiende otro, el aviso de la alergia tiene que estar
-- ahí igual. La pregunta correcta no es «¿mandas en la silla?» sino **«¿tienes
-- silla en este local?»**, que es la misma forma que la 101 ya usó para los
-- turnos sin barbero asignado.
--
-- Con una diferencia deliberada: aquí se exige además `aprobado`. En la 101 la
-- rama de la fila pide solo `activo`, y está bien, porque quien está esperando
-- turno lo tiene que ver cualquiera que pueda recogerlo. Esto no: unirse a un
-- local como profesional es self-service con el código, igual que unirse como
-- cliente; quien todavía no ha sido aceptado por el local no atiende a nadie, y
-- por tanto no necesita saber a qué es alérgico nadie. **Distinta sensibilidad,
-- distinto listón.**
--
-- La política de ESCRITURA no se toca: ya era `usuario_id = turno_uid()`, o sea
-- que la ficha solo la escribe su dueño. Eso está bien y se deja como está.
--
-- Y la comprobación que faltaba en la 101 y aquí se hace desde el principio:
-- turno_notas_barbero (la NOTA PRIVADA, la que escribe el barbero sobre el
-- cliente) se probó también, con un compañero del mismo local, con el propio
-- cliente y con un intento de sobrescribirla. Cerrada por los cuatro lados. El
-- texto que se ve compartido entre barberos es el de la ficha, que es del
-- cliente y es del equipo a propósito.

drop policy if exists turno_prefs_select on turno_preferencias_cliente;

create policy turno_prefs_select on turno_preferencias_cliente
  for select using (
    usuario_id = public.turno_uid()
    or exists (
      select 1 from public.turno_perfiles p
       where p.negocio_id = turno_preferencias_cliente.negocio_id
         and p.usuario_id = public.turno_uid()
         and p.activo and p.aprobado)
  );
