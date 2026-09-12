-- EL QUE LLEGA SIN CITA TAMBIÉN ES UN CLIENTE
--
-- Del piloto: "al atender un walk-in se crea una entrada de bloqueo de hora, al
-- terminar se mantiene. Ni siquiera creo que deba aparecer ese bloqueo como si
-- lo hubiera puesto el barbero: debe funcionar igual que si atiendo una cita o
-- uno de la fila."
--
-- Correcto, y el bloqueo fantasma era solo la parte que se veía.
--
-- LO QUE HACÍA. `turno_ocupar_ahora` no tocaba turno_cola en absoluto: metía una
-- fila en turno_bloqueos con motivo 'Cliente sin cita'. Y `turno_liberar_ahora`
-- no la borra, solo le acorta la hora de fin hasta ahora — por eso al terminar
-- seguía ahí, y en cuanto dejaba de cubrir el momento actual reaparecía en
-- "HORAS BLOQUEADAS" como si el barbero se hubiera cogido ese rato libre.
--
-- LO QUE NO SE VEÍA, Y ES PEOR. Las visitas se registran en un trigger sobre
-- turno_cola:
--
--     IF NEW.estado = 'atendido' AND OLD.estado != 'atendido' THEN
--       INSERT INTO turno_historial_visitas(...)
--
-- Un walk-in atendido por la vía del bloqueo NUNCA pasa por turno_cola, así que
-- NUNCA genera esa fila. Traducido: ese corte no contaba como dinero, no sumaba
-- en las estadísticas y no daba punto de fidelidad. El barbero cobraba y el
-- sistema no se enteraba. En la base del piloto hay dos así.
--
-- LO QUE HACE AHORA. Exactamente lo que pide: el mismo camino que cualquiera.
-- Se crea el turno en la cola —física, que es la que dice "esta persona está
-- aquí"— y ya nace sentado en la silla, porque el barbero lo tiene delante y no
-- tiene sentido llamarlo. A partir de ahí es un turno normal: al terminar pasa
-- a 'atendido', el trigger registra la visita, y no queda nada colgando.
--
-- Y RESPETA EL ORDEN (migración 58). Antes esto se podía hacer con cinco
-- personas esperando, porque un bloqueo no mira la fila: era la puerta trasera
-- que la 58 cerró por delante. Ahora se niega si hay alguien esperando. Si el
-- que toca no aparece, para eso están turno_no_esta y turno_sustituir_ausente,
-- que sí dejan constancia de lo que pasó.

create or replace function turno_atender_sin_cita(
  p_negocio uuid, p_perfil uuid, p_servicio uuid,
  p_nombre text default null, p_telefono text default null
)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cli uuid; v_pos int; v_dur int; v_tipo text; v_row public.turno_cola; v_esperando int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
  end if;

  -- Sirve de comprobación de propiedad: si el servicio no es de este perfil, no
  -- devuelve fila y v_dur queda NULL.
  select s.duracion_min, (select pf.tipo_servicio from turno_perfiles pf where pf.id = s.perfil_id)
    into v_dur, v_tipo
    from turno_servicios s where s.id = p_servicio and s.perfil_id = p_perfil;
  if v_dur is null then raise exception 'ese servicio no es tuyo'; end if;
  v_tipo := coalesce(v_tipo, 'barbero');

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));

  -- El orden es una regla. Con gente esperando, el de la calle no entra: eso es
  -- lo que la fila le promete a quien ya está en ella.
  select count(*) into v_esperando
    from turno_cola q
   where q.negocio_id = p_negocio
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (q.perfil_id is null or q.perfil_id = p_perfil);
  if v_esperando > 0 then
    raise exception 'hay % esperando: llama al siguiente, o marca ausente a quien no llegó', v_esperando;
  end if;

  -- Ni dos en la misma silla.
  if exists (select 1 from turno_cola q
              where q.perfil_id = p_perfil and q.estado = 'atendiendo') then
    raise exception 'ya tienes a alguien en la silla';
  end if;

  -- Persona sin cuenta: existe para que el corte tenga dueño en el historial.
  -- No entra en la cartera de clientes — eso lo filtra la migración 64 por
  -- auth_id, que aquí es NULL a propósito.
  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (coalesce(nullif(trim(p_nombre), ''), 'Cliente sin cita'),
          coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo)
  values (v_cli, p_negocio, 'cliente', true);

  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  -- Nace en la silla: el barbero lo tiene delante, llamarlo sería teatro.
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio,
                         prioridad, posicion, estado, llamado_at, atendiendo_at)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo,
          3, v_pos, 'atendiendo', now(), now())
  returning * into v_row;

  return v_row;
end $$;

grant execute on function turno_atender_sin_cita(uuid, uuid, uuid, text, text) to authenticated;
revoke execute on function turno_atender_sin_cita(uuid, uuid, uuid, text, text) from public, anon;

-- ── LIMPIEZA DE LOS FANTASMAS QUE YA EXISTEN ────────────────────────────────
-- 'Cliente sin cita' no lo escribió nadie: lo generaba la función. Son rastros
-- de un camino roto, no horas que el barbero decidiera cerrar, así que borrarlos
-- no pierde nada que él pusiera. Lo que cobró ese día ya estaba perdido de otra
-- forma —nunca llegó a turno_historial_visitas— y eso no se puede inventar
-- ahora: no hay forma de saber qué servicio fue ni cuánto cobró.
delete from turno_bloqueos where motivo = 'Cliente sin cita';

-- ── LA PUERTA VIEJA SE CIERRA ───────────────────────────────────────────────
-- Se deja la función para no romper llamadas antiguas de una app sin actualizar,
-- pero se niega: seguir creando bloqueos fantasma "por compatibilidad" es como
-- no haber arreglado nada. El mensaje dice qué usar.
create or replace function turno_ocupar_ahora(p_perfil uuid, p_servicio uuid, p_motivo text default null)
returns turno_bloqueos
language plpgsql security definer set search_path to 'public' as $$
begin
  raise exception 'esta versión de la app está desactualizada: atender sin cita ahora pasa por la fila';
end $$;

revoke execute on function turno_ocupar_ahora(uuid, uuid, text) from public, anon;
