-- UN BARBERO SIN APROBAR PODÍA OPERAR LA FILA
--
-- Encontrado recorriendo el viaje completo de alta: el dueño comparte el código
-- del local por WhatsApp, alguien se une con él y queda `aprobado = false`. La
-- app lo manda a la pantalla "pendiente de aprobación"… y ahí acababa el
-- control. Las funciones del motor comprobaban `turno_es_mi_perfil`, que es
-- cierto desde el segundo en que se crea el perfil, pero NUNCA `aprobado`.
--
-- O sea: cualquiera con el código podía llamar a los clientes de una barbería
-- que no lo ha aceptado, marcarlos atendidos y ensuciarle el historial. La
-- puerta estaba cerrada en la pantalla y abierta en el API.
--
-- Es el mismo patrón que veníamos viendo, en su versión peligrosa: una regla
-- que solo vive en la interfaz no es una regla.

-- Poder operar una silla exige tres cosas, no una: que el perfil esté vivo, que
-- el local lo haya aceptado, y que seas tú (o el dueño del local).
create or replace function turno_perfil_operable(p_perfil uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p_perfil
       and pr.activo and pr.aprobado
       and (pr.usuario_id = public.turno_uid()
            or pr.negocio_id in (select public.turno_negocios_admin()))
  )
$$;

-- Puerta de entrada de todas las acciones sobre un turno concreto (mover,
-- llamar a uno, sacar, devolver, cambiar servicio).
create or replace function turno_cola_operable(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select * into v from turno_cola where id = p_cola;
  if v.id is null then raise exception 'turno inexistente'; end if;
  if not (v.negocio_id in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if v.perfil_id is not null and not public.turno_perfil_operable(v.perfil_id) then
    raise exception 'no puedes operar este turno';
  end if;
  return v;
end $$;

create or replace function turno_llamar_siguiente(p_negocio uuid, p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v_ventana int; v_gracia int; v_tz text; v_ahora timestamp; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if p_perfil is not null and not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
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
     set estado = 'llamado', perfil_id = coalesce(perfil_id, p_perfil),
         llamado_at = now(), expira_at = now() + make_interval(mins => v_ventana)
   where id = v_row.id
   returning * into v_row;
  return v_row;
end $$;

create or replace function turno_iniciar_atencion(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('en_fila','llamado','en_camino') then
    raise exception 'ese turno no está esperando';
  end if;
  update turno_cola set estado = 'atendiendo', atendiendo_at = now()
   where id = p_cola returning * into v;
  return v;
end $$;

-- Ocupar la silla y registrar a alguien sin cita también son operar.
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
  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where perfil_id = p_perfil and activo;
  v_gap := coalesce(v_gap, 10);

  v_ahora := (now() at time zone v_tz);
  v_fin := v_ahora + make_interval(mins => v_dur + v_gap);
  v_hora_fin := case when v_fin::date > v_ahora::date then time '23:59' else v_fin::time end;

  insert into turno_bloqueos(perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_perfil, v_ahora::date, v_ahora::time, v_hora_fin,
          coalesce(nullif(trim(p_motivo), ''), 'Cliente sin cita'))
  returning * into v_row;
  return v_row;
end $$;

create or replace function turno_registrar_fisico(p_negocio uuid, p_perfil uuid, p_servicio uuid, p_nombre text, p_telefono text)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v_cli uuid; v_pos int; v_tipo text; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
  if p_perfil is not null and not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
  end if;

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (p_nombre, coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo) values (v_cli, p_negocio, 'cliente', true);
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo, 3, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

grant execute on function turno_perfil_operable(uuid) to authenticated;
