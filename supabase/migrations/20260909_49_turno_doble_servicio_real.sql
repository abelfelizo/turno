-- EL INTERRUPTOR "DOBLE SERVICIO" NO HACÍA NADA
--
-- Encontrado en la auditoría cruzando la base contra la app: el dueño tiene un
-- toggle "Doble servicio por visita — permite combinar corte + manicure", y
-- `doble_servicio_activo` solo aparecía en el INSERT que crea la fila de
-- configuración. Ninguna función lo leía.
--
-- Es el cuarto caso del mismo patrón en este piloto (puntos sin configurar,
-- estado del barbero, antelación mínima, y ahora este): un control que se
-- guarda y que nadie consulta. Se ve bien en pantalla y miente.
--
-- Qué debería hacer: R1 permite un turno activo POR TIPO de servicio, o sea
-- que corte + manicure a la vez está permitido siempre, con el toggle encendido
-- o apagado. El interruptor solo tiene sentido como restricción: apagado, el
-- local no quiere que nadie ocupe dos sillas a la vez.
--
--   encendido (o sin configurar) → R1: un turno activo por tipo
--   apagado                      → un turno activo, y punto

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

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_doble := coalesce(v_doble, true);

  -- Ojo con el alcance: la comprobación va SIN filtrar por negocio, porque el
  -- índice único que la respalda —turno_cola_un_turno_activo_tipo sobre
  -- (cliente_id, tipo_servicio)— es global. Acotarla al local dejaría pasar
  -- casos que el índice rechaza después con un error ilegible.
  if v_doble then
    -- R1: uno por tipo. Corte y manicure a la vez es válido.
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente and tipo_servicio = v_tipo
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo de este tipo de servicio';
    end if;
  else
    -- El local no admite dos sillas a la vez para la misma persona.
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
