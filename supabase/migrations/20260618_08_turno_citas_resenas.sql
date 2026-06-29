-- =====================================================================
-- TURNO · Fase 2 · Migración 8: agendar citas + ratings
-- =====================================================================

-- Horarios disponibles de un barbero en una fecha para un servicio dado.
create or replace function public.turno_slots_disponibles(
  p_perfil uuid, p_fecha date, p_servicio uuid
) returns setof time
language plpgsql stable security definer set search_path = public as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int; v_slot time; v_step interval;
begin
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null then return; end if;
  select hora_inicio, hora_fin, coalesce(tiempo_entre_clientes,10)
    into v_ini, v_fin, v_gap
    from turno_horarios where perfil_id = p_perfil and dia_semana = v_dow and activo
    order by hora_inicio limit 1;
  if v_ini is null then return; end if;
  v_step := make_interval(mins => v_dur + v_gap);
  v_slot := v_ini;
  while (v_slot + make_interval(mins => v_dur)) <= v_fin loop
    if not (p_fecha = current_date and (p_fecha + v_slot) < now()::timestamp)
       and not exists (
         select 1 from turno_citas c
         where c.perfil_id = p_perfil and c.fecha = p_fecha
           and c.estado in ('creada','confirmada','en_camino')
           and c.hora_inicio < (v_slot + make_interval(mins => v_dur))::time
           and c.hora_fin > v_slot )
       and not exists (
         select 1 from turno_bloqueos b
         where b.perfil_id = p_perfil and b.fecha = p_fecha
           and b.hora_inicio < (v_slot + make_interval(mins => v_dur))::time
           and b.hora_fin > v_slot )
    then
      return next v_slot;
    end if;
    v_slot := (v_slot + v_step)::time;
  end loop;
end $$;

-- Agendar una cita (valida acceso, pasado y solapamiento).
create or replace function public.turno_agendar_cita(
  p_perfil uuid, p_servicio uuid, p_fecha date, p_hora time
) returns public.turno_citas
language plpgsql security definer set search_path = public as $$
declare v_cli uuid := public.turno_uid(); v_neg uuid; v_dur int; v_fin time; v_row public.turno_citas;
begin
  if v_cli is null then raise exception 'no autenticado'; end if;
  select negocio_id into v_neg from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil invalido'; end if;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null then raise exception 'servicio invalido'; end if;
  v_fin := (p_hora + make_interval(mins => v_dur))::time;
  if (p_fecha + p_hora) < now()::timestamp then raise exception 'horario en el pasado'; end if;
  if exists (select 1 from turno_citas c
       where c.perfil_id = p_perfil and c.fecha = p_fecha
         and c.estado in ('creada','confirmada','en_camino')
         and c.hora_inicio < v_fin and c.hora_fin > p_hora) then
    raise exception 'ese horario ya no esta disponible';
  end if;
  insert into turno_citas(perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_perfil, v_cli, v_neg, p_servicio, p_fecha, p_hora, v_fin, 'creada')
  returning * into v_row;
  return v_row;
end $$;

-- Rating promedio y total de todos los barberos de un negocio.
create or replace function public.turno_ratings_negocio(p_negocio uuid)
returns table(perfil_id uuid, promedio numeric, total bigint)
language sql stable security definer set search_path = public as $$
  select r.perfil_id, round(avg(r.rating)::numeric, 1), count(*)
  from turno_resenas r
  join turno_perfiles p on p.id = r.perfil_id
  where p.negocio_id = p_negocio
  group by r.perfil_id
$$;

grant execute on function public.turno_slots_disponibles(uuid,date,uuid) to authenticated;
grant execute on function public.turno_agendar_cita(uuid,uuid,date,time) to authenticated;
grant execute on function public.turno_ratings_negocio(uuid) to authenticated;
revoke execute on function public.turno_slots_disponibles(uuid,date,uuid) from public, anon;
revoke execute on function public.turno_agendar_cita(uuid,uuid,date,time) from public, anon;
revoke execute on function public.turno_ratings_negocio(uuid) from public, anon;
