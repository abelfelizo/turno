-- EL BARBERO QUE RENTA PONE SUS PROPIAS REGLAS DE TIEMPO
--
-- La regla R11 ya daba al barbero autónomo sus servicios, precios y horarios.
-- Pero las REGLAS DE TIEMPO seguían siendo del local y solo del local:
--
--   anticipacion_minima_horas · con cuánta antelación se puede reservar
--   ventana_llegada_min       · cuánto se espera a un llamado antes de expirar
--   gracia_cita_min           · margen de tolerancia de una cita
--   umbral_confirmacion       · a cuántos de distancia se habilita "voy en camino"
--
-- Vivían solo en turno_configuracion_negocio, así que el dueño se las imponía
-- a alguien que le está PAGANDO un asiento y trabaja con sus reglas. Reportado
-- en el piloto: "si el barbero es alquilado él pone las reglas de tiempo y
-- funciones del local, el dueño solo puede controlar lo de su silla".
--
-- Solución: columnas de excepción en turno_perfiles, todas NULL por defecto.
-- NULL significa "lo que diga el local", que es lo correcto para un empleado y
-- un arranque sensato para el rentado. Si el barbero autónomo pone un valor,
-- ese manda sobre su silla.
--
-- Se usan columnas anulables en vez de una tabla aparte a propósito: sin fila
-- que crear, sin JOIN que olvidar, y "heredo del local" es el estado natural.

alter table turno_perfiles
  add column if not exists anticipacion_minima_horas int,
  add column if not exists ventana_llegada_min       int,
  add column if not exists gracia_cita_min           int,
  add column if not exists umbral_confirmacion       int;

comment on column turno_perfiles.anticipacion_minima_horas is
  'Excepción del barbero autónomo. NULL = hereda del local.';

-- Resolutor único: la regla del perfil si existe y el perfil es autónomo; si
-- no, la del local. Que un EMPLEADO tenga un valor guardado no debe saltarse
-- al dueño, así que la autonomía se comprueba aquí y no al escribir.
create or replace function turno_regla_tiempo(p_perfil uuid, p_negocio uuid, p_regla text)
returns int language plpgsql stable security definer set search_path to 'public' as $$
declare v_perfil int; v_local int;
begin
  if p_regla not in ('anticipacion_minima_horas','ventana_llegada_min','gracia_cita_min','umbral_confirmacion') then
    raise exception 'regla desconocida: %', p_regla;
  end if;

  if p_perfil is not null and public.turno_perfil_autonomo(p_perfil) then
    execute format('select %I from turno_perfiles where id = $1', p_regla)
      into v_perfil using p_perfil;
  end if;

  execute format('select %I from turno_configuracion_negocio where negocio_id = $1', p_regla)
    into v_local using p_negocio;

  return coalesce(v_perfil, v_local,
    case p_regla
      when 'anticipacion_minima_horas' then 2
      when 'ventana_llegada_min' then 10
      when 'gracia_cita_min' then 5
      else 2
    end);
end $$;

-- El barbero autónomo edita sus propias reglas; nadie más las suyas.
create or replace function turno_guardar_reglas_barbero(
  p_perfil uuid,
  p_anticipacion int default null,
  p_ventana int default null,
  p_gracia int default null,
  p_umbral int default null
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.turno_es_mi_perfil(p_perfil) then raise exception 'no es tu perfil'; end if;
  if not public.turno_perfil_autonomo(p_perfil) then
    raise exception 'las reglas de tiempo las pone la barbería';
  end if;
  update turno_perfiles
     set anticipacion_minima_horas = p_anticipacion,
         ventana_llegada_min       = p_ventana,
         gracia_cita_min           = p_gracia,
         umbral_confirmacion       = p_umbral
   where id = p_perfil;
end $$;

-- ── Los motores pasan a preguntar por el resolutor ────────────────────────────

-- Llamar al siguiente: la ventana de llegada y la gracia son del barbero que
-- llama, no del local, cuando ese barbero es autónomo.
create or replace function turno_llamar_siguiente(p_negocio uuid, p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v_ventana int; v_gracia int; v_tz text; v_ahora timestamp; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if p_perfil is not null
     and not public.turno_es_mi_perfil(p_perfil)
     and not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no puedes operar este perfil';
  end if;

  v_ventana := public.turno_regla_tiempo(p_perfil, p_negocio, 'ventana_llegada_min');
  v_gracia  := public.turno_regla_tiempo(p_perfil, p_negocio, 'gracia_cita_min');
  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  v_ahora := (now() at time zone v_tz);

  if p_perfil is not null and exists(
       select 1 from turno_citas
        where perfil_id = p_perfil and fecha = v_ahora::date and estado = 'confirmada'
          and v_ahora between (fecha + hora_inicio) - make_interval(mins => v_ventana)
                          and (fecha + hora_fin)    + make_interval(mins => v_gracia)) then
    return null;
  end if;

  select * into v_row from turno_cola
   where negocio_id = p_negocio and estado = 'en_fila'
     and (p_perfil is null or perfil_id is null or perfil_id = p_perfil)
   order by prioridad asc, posicion asc
   for update skip locked
   limit 1;
  if v_row.id is null then return null; end if;
  update turno_cola
     set estado = 'llamado',
         perfil_id = coalesce(perfil_id, p_perfil),
         llamado_at = now(),
         expira_at = now() + make_interval(mins => v_ventana)
   where id = v_row.id
   returning * into v_row;
  return v_row;
end $$;

-- Llamar a alguien concreto: misma ventana.
create or replace function turno_llamar_a(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_ventana int; v_perfil uuid;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'ese turno ya no está esperando'; end if;

  if v.perfil_id is not null and exists(
       select 1 from turno_cola where perfil_id = v.perfil_id
        and estado in ('llamado','en_camino','atendiendo')) then
    raise exception 'ya tienes un cliente en curso: termínalo o devuélvelo a la fila';
  end if;

  v_ventana := public.turno_regla_tiempo(v.perfil_id, v.negocio_id, 'ventana_llegada_min');
  select id into v_perfil from turno_perfiles where usuario_id = public.turno_uid() and negocio_id = v.negocio_id limit 1;

  update turno_cola
     set estado = 'llamado', perfil_id = coalesce(perfil_id, v_perfil),
         llamado_at = now(), expira_at = now() + make_interval(mins => v_ventana)
   where id = p_cola returning * into v;
  return v;
end $$;

grant execute on function turno_regla_tiempo(uuid, uuid, text) to authenticated;
grant execute on function turno_guardar_reglas_barbero(uuid, int, int, int, int) to authenticated;

-- El umbral de "voy en camino" también es del barbero cuando es autónomo.
create or replace function turno_puede_confirmar(p_cola uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_umbral int; v_delante int;
begin
  select * into v from turno_cola where id = p_cola and cliente_id = public.turno_uid();
  if v.id is null then return false; end if;
  if v.estado in ('llamado','en_camino') then return true; end if;
  if v.estado <> 'en_fila' then return false; end if;
  v_umbral := public.turno_regla_tiempo(v.perfil_id, v.negocio_id, 'umbral_confirmacion');
  select count(*) into v_delante from turno_cola c2
   where c2.negocio_id = v.negocio_id and c2.estado = 'en_fila'
     and (v.perfil_id is null or c2.perfil_id is null or c2.perfil_id = v.perfil_id)
     and (c2.prioridad < v.prioridad or (c2.prioridad = v.prioridad and c2.posicion < v.posicion));
  return v_delante <= v_umbral;
end $$;

-- LA ANTELACIÓN MÍNIMA NO SE COMPROBABA EN NINGÚN SITIO.
-- turno_agendar_cita solo rechazaba el pasado, y turno_slots_disponibles
-- ofrecía huecos a cinco minutos vista aunque el local pidiera dos horas. La
-- regla existía en la configuración y no la aplicaba nadie: era decorativa.
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

-- Los huecos ofrecidos y lo que el servidor acepta tienen que ser lo mismo, o
-- el cliente toca una hora y recibe un error sin entender por qué.
create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int; v_slot time; v_step interval;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
begin
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null then return; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return; end if;

  select hora_inicio, hora_fin, coalesce(tiempo_entre_clientes,10)
    into v_ini, v_fin, v_gap
    from turno_horarios where perfil_id = p_perfil and dia_semana = v_dow and activo
    order by hora_inicio limit 1;
  if v_ini is null then return; end if;

  v_ahora := (now() at time zone v_tz);
  v_ant := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  v_desde := v_ahora + make_interval(hours => v_ant);

  v_step := make_interval(mins => v_dur + v_gap);
  v_slot := v_ini;
  while (v_slot + make_interval(mins => v_dur)) <= v_fin loop
    if (p_fecha + v_slot) >= v_desde
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
