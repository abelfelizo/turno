-- LA FILA SE COME LA AGENDA, Y LA AGENDA TIENE QUE ENTERARSE
--
-- Del piloto: "si en la fila hay 5 personas y son 3 horas de espera, el sistema
-- no debe permitir hacer una cita aunque esté configurado 1 hora previa".
--
-- Es el mismo error de siempre visto desde otro lado: dos partes del sistema que
-- por separado dicen la verdad y juntas mienten. La agenda calculaba el primer
-- hueco así:
--
--     v_desde := ahora + anticipacion_minima_horas;
--
-- y la fila no aparecía por ningún lado. Con cinco esperando, la app ofrecía una
-- cita para dentro de una hora y a esa hora el barbero seguía con el tercero. El
-- cliente llegaba puntual a una cita imposible, y el barbero quedaba mal por una
-- promesa que hizo la app.
--
-- LA CARGA DE LA FILA es el tiempo que falta para que la fila viva se agote: lo
-- que queda del que está en la silla, más lo que dura cada uno de los que
-- esperan, más el respiro entre clientes. Con eso, el primer hueco de HOY es el
-- más tardío de los dos suelos: la antelación mínima y el final de la fila.
--
-- SOLO HOY. Mañana no hay fila que valga: la de hoy se habrá vaciado o se habrá
-- perdido, y arrastrarla sería cerrar la agenda de toda la semana por una tarde
-- ocupada.
--
-- Y VA EN LOS DOS SITIOS. La lista de huecos deja de ofrecerlos, y turno_agendar_cita
-- los rechaza. Poner esto solo en la lista sería otra regla que vive en la
-- interfaz: quien llame a la RPC directamente —o con la pantalla abierta desde
-- hace media hora, que es mucho más probable— reservaría igual.

-- ── CUÁNTO FALTA PARA QUE LA FILA SE VACÍE ──────────────────────────────────
create or replace function turno_carga_de_fila(p_perfil uuid)
returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare v_gap int; v_espera int; v_dow int; v_tz text;
begin
  if p_perfil is null then return 0; end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  v_dow := extract(dow from (now() at time zone coalesce(v_tz, 'America/Santo_Domingo')));

  -- El respiro es del día que toca (migración 54): el sábado no se trabaja como
  -- el martes, y un min() sobre la semana traía de vuelta aquel error.
  select coalesce(tiempo_entre_clientes, 0) into v_gap
    from turno_horarios
   where perfil_id = p_perfil and dia_semana = v_dow and activo
   order by hora_inicio limit 1;
  v_gap := coalesce(v_gap, 0);

  select coalesce(sum(coalesce(s.duracion_min, 30) + v_gap), 0)::int into v_espera
    from turno_cola q
    left join turno_servicios s on s.id = q.servicio_id
   where q.perfil_id = p_perfil and q.estado = 'en_fila';

  -- turno_min_ocupada ya cubre al que está en la silla y los bloqueos vivos.
  return greatest(0, coalesce(public.turno_min_ocupada(p_perfil), 0) + coalesce(v_espera, 0));
end $$;

grant execute on function turno_carga_de_fila(uuid) to authenticated;
revoke execute on function turno_carga_de_fila(uuid) from public, anon;

-- ── LOS HUECOS DE HOY EMPIEZAN DESPUÉS DE LA FILA ───────────────────────────
create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time without time zone
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_paso interval; v_abre timestamp; v_cierra timestamp; v_carga int;
begin
  if not public.turno_perfil_acepta(p_perfil, p_fecha) then return; end if;

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

  -- LO NUEVO. Si la fila de hoy dura más que la antelación, manda la fila.
  if p_fecha = v_ahora::date then
    v_carga := coalesce(public.turno_carga_de_fila(p_perfil), 0);
    if v_carga > 0 then
      v_desde := greatest(v_desde, v_ahora + make_interval(mins => v_carga));
    end if;
  end if;

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

-- ── Y LA RESERVA LO COMPRUEBA TAMBIÉN ───────────────────────────────────────
create or replace function turno_agendar_cita(p_perfil uuid, p_servicio uuid, p_fecha date, p_hora time without time zone)
returns turno_citas
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cli uuid := public.turno_uid(); v_neg uuid; v_dur int; v_fin time;
  v_tz text; v_ahora timestamp; v_ant int; v_row public.turno_citas; v_carga int;
begin
  if v_cli is null then raise exception 'no autenticado'; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then raise exception 'perfil invalido'; end if;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;

  if not public.turno_perfil_acepta(p_perfil, p_fecha) then
    raise exception 'ese barbero no está aceptando citas para esa fecha';
  end if;

  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null then raise exception 'servicio invalido'; end if;
  v_fin := (p_hora + make_interval(mins => v_dur))::time;

  v_ahora := (now() at time zone v_tz);
  v_ant := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  if (p_fecha + p_hora) < v_ahora + make_interval(hours => v_ant) then
    raise exception 'hay que reservar con al menos % horas de antelación', v_ant;
  end if;

  -- La fila de hoy manda sobre la antelación cuando dura más. Sin esto, con
  -- cinco esperando se podía coger cita para dentro de una hora y llegar a
  -- encontrarse al barbero por el tercero.
  if p_fecha = v_ahora::date then
    v_carga := coalesce(public.turno_carga_de_fila(p_perfil), 0);
    if v_carga > 0 and (p_fecha + p_hora) < v_ahora + make_interval(mins => v_carga) then
      raise exception 'con la fila de ahora ese barbero no llega a esa hora: prueba a partir de las %',
        to_char(v_ahora + make_interval(mins => v_carga), 'HH24:MI');
    end if;
  end if;

  if exists (select 1 from turno_citas c
       where c.perfil_id = p_perfil and c.fecha = p_fecha
         and c.estado in ('creada','confirmada','en_camino')
         and c.hora_inicio < v_fin and c.hora_fin > p_hora) then
    raise exception 'ese horario ya no esta disponible';
  end if;
  if exists (select 1 from turno_bloqueos b
       where b.perfil_id = p_perfil and b.fecha = p_fecha
         and b.hora_inicio < v_fin and b.hora_fin > p_hora) then
    raise exception 'ese horario ya no esta disponible';
  end if;

  insert into turno_citas(perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_perfil, v_cli, v_neg, p_servicio, p_fecha, p_hora, v_fin, 'creada')
  returning * into v_row;
  return v_row;
end $$;
