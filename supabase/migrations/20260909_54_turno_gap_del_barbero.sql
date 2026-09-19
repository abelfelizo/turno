-- EL TIEMPO ENTRE CLIENTES: POR DEFECTO CERO, Y DEL DÍA QUE TOCA
--
-- Aclaración del piloto: "los tiempos serán variables, cada barbero los
-- configura, y normalmente los barberos no usan gap".
--
-- Dos cosas estaban mal, y la segunda es un bug de verdad.
--
-- ── A) EL VALOR POR DEFECTO ERA 10, NO 0 ────────────────────────────────────
--
-- La columna nacía en 10 y todas las funciones caían en `coalesce(..., 10)`.
-- Nadie eligió ese número: se colaba solo. En la base del piloto se ve exacto —
-- el barbero puso su lunes en 0 y los otros seis días seguían en 10, que es el
-- valor que nunca tocó.
--
-- Diez minutos por cliente no es un detalle: en una jornada de nueve horas con
-- cortes de 45 son casi hora y media de silla que el sistema regala.
--
-- ── B) UN SOLO DÍA EN 0 PONÍA TODA LA SEMANA EN 0 ───────────────────────────
--
-- Peor que el default. turno_eta y turno_ocupar_ahora leían así:
--
--   select coalesce(min(tiempo_entre_clientes), 10) into v_gap
--     from turno_horarios where perfil_id = ... and activo;
--
-- `min()` SOBRE TODOS LOS DÍAS. O sea que el barbero del piloto, con el lunes
-- en 0 y el resto en 10, tenía gap 0 también los domingos — y al revés, quien
-- ponga un día en 20 no lo vería aplicado nunca porque otro día tiene menos.
--
-- El horario es por día de la semana precisamente porque el sábado no se
-- trabaja como el martes. Coger el mínimo de la semana tira esa información y
-- da un número que no es el de ningún día en concreto.
--
-- Ahora se lee el gap DEL DÍA que corresponde, como ya hacía
-- turno_slots_disponibles. Y si ese día no tiene horario, 0: sin gap, que es
-- como trabaja la mayoría.

alter table turno_horarios alter column tiempo_entre_clientes set default 0;

-- El ETA de la fila. El gap es el de hoy, no el mínimo de la semana.
create or replace function turno_eta(p_cola uuid)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_cola; v_min int; v_gap int; v_tz text; v_dow int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  if not (v_row.cliente_id = public.turno_uid()
          or v_row.negocio_id in (select public.turno_mis_negocios())) then
    return null;
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_negocios n where n.id = v_row.negocio_id;
  v_dow := extract(dow from (now() at time zone coalesce(v_tz, 'America/Santo_Domingo')));

  select tiempo_entre_clientes into v_gap
    from turno_horarios
   where perfil_id = v_row.perfil_id and dia_semana = v_dow and activo
   order by hora_inicio limit 1;
  v_gap := coalesce(v_gap, 0);

  select coalesce(sum(s.duracion_min), 0) + count(*) * v_gap into v_min
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));
  return coalesce(v_min, 0) + public.turno_min_ocupada(v_row.perfil_id);
end $$;

-- Atender a alguien sin cita ocupa la silla. Mismo criterio: el gap de hoy.
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
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
  end if;

  select duracion_min into v_dur from turno_servicios where id = p_servicio and perfil_id = p_perfil;
  if v_dur is null then raise exception 'ese servicio no es tuyo'; end if;

  v_ahora := (now() at time zone v_tz);
  select tiempo_entre_clientes into v_gap
    from turno_horarios
   where perfil_id = p_perfil and dia_semana = extract(dow from v_ahora) and activo
   order by hora_inicio limit 1;
  v_gap := coalesce(v_gap, 0);

  v_fin := v_ahora + make_interval(mins => v_dur + v_gap);
  v_hora_fin := case when v_fin::date > v_ahora::date then time '23:59' else v_fin::time end;

  insert into turno_bloqueos(perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_perfil, v_ahora::date, v_ahora::time, v_hora_fin,
          coalesce(nullif(trim(p_motivo), ''), 'Cliente sin cita'))
  returning * into v_row;
  return v_row;
end $$;

-- Los huecos de la agenda ya leían el gap del día correcto; solo cambia el
-- valor al que caen cuando no hay ninguno configurado.
create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_paso interval; v_abre timestamp; v_cierra timestamp;
begin
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null or v_dur <= 0 then return; end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return; end if;

  select hora_inicio, hora_fin, coalesce(tiempo_entre_clientes, 0)
    into v_ini, v_fin, v_gap
    from turno_horarios where perfil_id = p_perfil and dia_semana = v_dow and activo
    order by hora_inicio limit 1;
  if v_ini is null then return; end if;

  v_ahora  := (now() at time zone v_tz);
  v_ant    := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  v_desde  := v_ahora + make_interval(hours => v_ant);
  v_paso   := make_interval(mins => v_dur + v_gap);
  v_abre   := p_fecha + v_ini;
  v_cierra := p_fecha + v_fin;

  return query
  with rejilla as (
    select v_abre + (n * v_paso) as t
      from generate_series(
        0,
        greatest(0, floor(extract(epoch from (v_cierra - v_abre))
                          / nullif(extract(epoch from v_paso), 0))::int)
      ) n
  ),
  pegados as (
    select (p_fecha + c.hora_fin) + make_interval(mins => v_gap) as t
      from turno_citas c
     where c.perfil_id = p_perfil and c.fecha = p_fecha
       and c.estado in ('creada','confirmada','en_camino')
    union all
    select (p_fecha + b.hora_fin) + make_interval(mins => v_gap) as t
      from turno_bloqueos b
     where b.perfil_id = p_perfil and b.fecha = p_fecha
  ),
  candidatos as (
    select t from rejilla
    union
    select t from pegados
  )
  select c.t::time
    from candidatos c
   where c.t >= v_abre
     and c.t + make_interval(mins => v_dur) <= v_cierra
     and c.t >= v_desde
     and not exists (
       select 1 from turno_citas x
        where x.perfil_id = p_perfil and x.fecha = p_fecha
          and x.estado in ('creada','confirmada','en_camino')
          and (p_fecha + x.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + x.hora_fin)    > c.t)
     and not exists (
       select 1 from turno_bloqueos b
        where b.perfil_id = p_perfil and b.fecha = p_fecha
          and (p_fecha + b.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + b.hora_fin)    > c.t)
   order by c.t;
end $$;

grant execute on function turno_slots_disponibles(uuid, date, uuid) to authenticated;
grant execute on function turno_eta(uuid) to authenticated;
