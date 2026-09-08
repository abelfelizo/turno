-- LA SILLA OCUPADA (el "sin cita" deja de ser un cliente fantasma)
--
-- Antes, atender a alguien sin cita creaba un usuario falso + membresía + una
-- entrada en la fila. Eso ensuciaba la base y, sobre todo, mentía: el que llega
-- caminando no está esperando, está SENTADO. Lo que el resto del sistema
-- necesita saber no es su nombre, es cuánto tiempo la silla está tomada.
--
-- Ahora "atender sin cita" es un bloqueo de tiempo desde ahora hasta ahora +
-- duración del servicio + el respiro entre clientes. Con eso:
--
--   · turno_slots_disponibles ya lo respetaba → deja de ofrecer esas horas.
--   · turno_eta lo suma → el que está en la cola digital ve la espera real.
--
-- Y no queda basura en turno_usuarios.
--
-- turno_registrar_fisico sigue existiendo (no se rompe nada que lo llame), pero
-- la app ya no lo usa.

-- Minutos que faltan para que se libere la silla: bloqueo vigente y/o cliente
-- que ya está sentado. Es la pieza que le faltaba al ETA.
create or replace function turno_min_ocupada(p_perfil uuid)
returns int language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tz text; v_ahora timestamp; v_hoy date; v_bloq int := 0; v_silla int := 0;
begin
  if p_perfil is null then return 0; end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  v_ahora := (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'));
  v_hoy := v_ahora::date;

  select coalesce(max(ceil(extract(epoch from ((v_hoy + b.hora_fin) - v_ahora)) / 60)), 0)::int
    into v_bloq
    from turno_bloqueos b
   where b.perfil_id = p_perfil and b.fecha = v_hoy
     and b.hora_inicio <= v_ahora::time and b.hora_fin > v_ahora::time;

  select coalesce(max(ceil(extract(epoch from (
           coalesce(q.atendiendo_at, q.llamado_at, q.created_at)
             + make_interval(mins => coalesce(s.duracion_min, 30)) - now())) / 60)), 0)::int
    into v_silla
    from turno_cola q left join turno_servicios s on s.id = q.servicio_id
   where q.perfil_id = p_perfil and q.estado in ('llamado','en_camino','atendiendo');

  -- El mayor de los dos, no la suma: son la misma silla.
  return greatest(0, greatest(v_bloq, v_silla));
end $$;

-- ETA = lo que falta de la silla + todo lo que hay delante en la fila.
create or replace function turno_eta(p_cola uuid)
returns int language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_cola; v_min int; v_gap int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where perfil_id = v_row.perfil_id and activo;
  v_gap := coalesce(v_gap, 10);
  select coalesce(sum(s.duracion_min), 0) + count(*) * v_gap into v_min
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));
  -- La silla que tiene por delante: sin esto el "faltan 20 min" ignoraba al que
  -- ya está sentado y el cliente llegaba a esperar de pie.
  return coalesce(v_min, 0) + public.turno_min_ocupada(v_row.perfil_id);
end $$;

-- Atender a alguien sin cita = tomar la silla desde ahora.
create or replace function turno_ocupar_ahora(p_perfil uuid, p_servicio uuid, p_motivo text default null)
returns turno_bloqueos language plpgsql security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_fin timestamp; v_dur int; v_gap int;
  v_hora_fin time; v_row public.turno_bloqueos;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if not public.turno_es_mi_perfil(p_perfil)
     and not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'no puedes ocupar esta silla';
  end if;

  select duracion_min into v_dur from turno_servicios where id = p_servicio and perfil_id = p_perfil;
  if v_dur is null then raise exception 'ese servicio no es tuyo'; end if;
  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where perfil_id = p_perfil and activo;
  v_gap := coalesce(v_gap, 10);

  v_ahora := (now() at time zone v_tz);
  v_fin := v_ahora + make_interval(mins => v_dur + v_gap);
  -- Si el corte cruza la medianoche, el bloqueo se corta a las 23:59: un
  -- hora_fin menor que hora_inicio no lo encuentra ninguna consulta de solapes.
  v_hora_fin := case when v_fin::date > v_ahora::date then time '23:59' else v_fin::time end;

  insert into turno_bloqueos(perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_perfil, v_ahora::date, v_ahora::time, v_hora_fin,
          coalesce(nullif(trim(p_motivo), ''), 'Cliente sin cita'))
  returning * into v_row;
  return v_row;
end $$;

-- Terminó antes de lo previsto: se libera el resto del tiempo.
create or replace function turno_liberar_ahora(p_bloqueo uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_bloqueos; v_neg uuid; v_tz text; v_ahora timestamp;
begin
  select * into v from turno_bloqueos where id = p_bloqueo;
  if v.id is null then raise exception 'bloqueo inexistente'; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = v.perfil_id;
  if not public.turno_es_mi_perfil(v.perfil_id)
     and not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'no puedes liberar esta silla';
  end if;
  v_ahora := (now() at time zone v_tz);
  -- hora_fin nunca por debajo del inicio: un bloqueo invertido no lo filtra
  -- ninguna consulta y quedaría vivo para siempre.
  update turno_bloqueos
     set hora_fin = greatest(v.hora_inicio + interval '1 minute', v_ahora::time)::time
   where id = p_bloqueo;
end $$;

grant execute on function turno_min_ocupada(uuid)              to authenticated;
grant execute on function turno_ocupar_ahora(uuid,uuid,text)   to authenticated;
grant execute on function turno_liberar_ahora(uuid)            to authenticated;
