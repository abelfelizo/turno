-- UN DESCANSO ES TEMPORAL: NO PUEDE BLOQUEAR LAS CITAS DE LA SEMANA QUE VIENE
--
-- Corrección del piloto: "un descanso es un estado temporal, no puedes bloquear
-- las citas futuras. Tal vez las de ese día. Si está inactivo es otra cosa."
--
-- Tiene razón, y al ir a comprobarlo el estado de las cosas era peor en las DOS
-- direcciones a la vez:
--
--   · EN LA APP, DEMASIADO: dos pantallas del cliente filtran la lista de
--     barberos por `estado_actual = 'disponible'`, y esa misma lista sirve
--     tanto para entrar a la fila como para reservar una cita. O sea que
--     ponerse "en descanso" un rato te borraba también de las reservas de
--     dentro de diez días.
--   · EN LA BASE, NADA: ni turno_entrar_a_cola, ni turno_agendar_cita, ni
--     turno_slots_disponibles miraban el estado. La única barrera era la lista,
--     así que cualquiera con la pantalla ya abierta seguía pudiendo reservar.
--
-- La regla que faltaba, con los dos estados significando cosas distintas:
--
--                    fila (ahora)   citas de HOY   citas de días futuros
--   disponible            sí             sí                sí
--   descanso              NO             NO                SÍ
--   inactivo              NO             NO                NO
--
-- El descanso es "ahora no": corta lo de hoy y deja intacta la agenda. El
-- inactivo es una ausencia larga y sí cierra la agenda entera — para eso son
-- dos estados y no uno.

create or replace function turno_perfil_acepta(p_perfil uuid, p_fecha date default null)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_est text; v_tz text; v_hoy date;
begin
  if p_perfil is null then return true; end if;   -- "el que esté libre": no es de nadie
  select coalesce(pr.estado_actual, 'disponible'), coalesce(n.tz, 'America/Santo_Domingo')
    into v_est, v_tz
    from turno_perfiles pr join turno_negocios n on n.id = pr.negocio_id
   where pr.id = p_perfil and pr.activo and pr.aprobado;

  -- Sin fila: perfil inexistente, dado de baja o todavía sin aprobar.
  if v_est is null then return false; end if;
  if v_est = 'inactivo' then return false; end if;
  if v_est <> 'descanso' then return true; end if;

  -- Descanso: solo afecta a hoy. p_fecha null significa "ahora mismo".
  v_hoy := (now() at time zone v_tz)::date;
  return p_fecha is not null and p_fecha > v_hoy;
end $$;

-- ── LA FILA ES DE AHORA ─────────────────────────────────────────────────────
create or replace function turno_entrar_a_cola(p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_doble boolean; v_row public.turno_cola;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  -- Entrar a la fila es para AHORA, así que un descanso sí la corta.
  if not public.turno_perfil_acepta(p_perfil, null) then
    raise exception 'ese barbero no está tomando clientes ahora mismo';
  end if;

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_doble := coalesce(v_doble, true);

  -- Ojo con el alcance: la comprobación va SIN filtrar por negocio, porque el
  -- índice único que la respalda —turno_cola_un_turno_activo_tipo sobre
  -- (cliente_id, tipo_servicio)— es global.
  if v_doble then
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente and tipo_servicio = v_tipo
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo de este tipo de servicio';
    end if;
  else
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino','atendiendo');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;

  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

-- ── LA AGENDA MIRA LA FECHA, NO SOLO EL ESTADO ──────────────────────────────
create or replace function turno_agendar_cita(p_perfil uuid, p_servicio uuid, p_fecha date, p_hora time)
returns turno_citas language plpgsql security definer set search_path to 'public' as $$
declare
  v_cli uuid := public.turno_uid(); v_neg uuid; v_dur int; v_fin time;
  v_tz text; v_ahora timestamp; v_ant int; v_row public.turno_citas;
begin
  if v_cli is null then raise exception 'no autenticado'; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then raise exception 'perfil invalido'; end if;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;

  -- Con la FECHA: un descanso de hoy no impide reservar para el jueves.
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

-- Y que no se ofrezcan huecos que la reserva va a rechazar: hoy no hay, los
-- días siguientes sí.
create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_paso interval; v_abre timestamp; v_cierra timestamp;
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

-- El panel del barbero necesita distinguir las dos cosas: "no tomo gente ahora"
-- y "tengo la agenda cerrada". Antes `acepta` las mezclaba en un solo booleano.
create or replace function turno_estado_barbero(p_perfil uuid)
returns table(
  estado text, acepta boolean, cliente text, hasta time, en_cola int,
  acepta_citas boolean          -- ¿se puede reservar para más adelante?
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
  v_staff boolean;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_en_mis_negocios(p_perfil) then
    raise exception 'ese barbero no es de un local tuyo';
  end if;
  v_staff := public.turno_es_mi_perfil(p_perfil) or public.turno_perfil_admin(p_perfil);

  select p.negocio_id, coalesce(p.estado_actual, 'disponible'),
         coalesce(n.tz, 'America/Santo_Domingo')
    into v_neg, v_decision, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then return; end if;
  v_ahora := (now() at time zone v_tz);

  select u.nombre into v_cliente
    from turno_cola q left join turno_usuarios u on u.id = q.cliente_id
   where q.perfil_id = p_perfil and q.estado in ('llamado','en_camino','atendiendo')
   order by q.llamado_at desc nulls last limit 1;
  if v_cliente is not null then v_ocupado := true; end if;

  select b.hora_fin into v_hasta
    from turno_bloqueos b
   where b.perfil_id = p_perfil and b.fecha = v_ahora::date
     and b.hora_inicio <= v_ahora::time and b.hora_fin > v_ahora::time
   order by b.hora_fin desc limit 1;
  if v_hasta is not null then v_ocupado := true; end if;

  select count(*)::int into v_cola
    from turno_cola q
   where q.perfil_id = p_perfil and q.estado = 'en_fila';

  return query select
    case
      when v_decision = 'inactivo' then 'inactivo'
      when v_decision = 'descanso' then 'descanso'
      when v_ocupado then 'atendiendo'
      else 'libre'
    end,
    -- Ocupado NO es cerrado: quien está cortando sigue aceptando gente en su
    -- fila, que es justo para lo que existe la fila.
    v_decision not in ('inactivo', 'descanso'),
    case when v_staff then v_cliente else null end,
    v_hasta, coalesce(v_cola, 0),
    -- El descanso deja la agenda abierta; el inactivo no.
    v_decision <> 'inactivo';
end $$;

grant execute on function turno_perfil_acepta(uuid, date) to authenticated;
grant execute on function turno_estado_barbero(uuid)      to authenticated;
