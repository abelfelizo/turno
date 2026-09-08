-- Estado "atendiendo": faltaba el tramo en que el cliente está en la silla.
-- Antes se saltaba de en_camino a atendido, así que nadie sabía quién se está
-- cortando ahora ni cuánto lleva. Detectado usando la app en el piloto.
--
-- Al añadir un estado activo hay que revisarlo TODO: el índice único de R1 y
-- cada función que enumera los estados activos. Si no, R1 deja de proteger
-- mientras el cliente está en la silla y las posiciones se reciclan otra vez.

alter table turno_cola drop constraint if exists turno_cola_estado_check;
alter table turno_cola add constraint turno_cola_estado_check
  check (estado = any (array['en_fila','llamado','en_camino','atendiendo','atendido','expirado','reinsertado','abandonado']));

alter table turno_cola add column if not exists atendiendo_at timestamptz;

drop index if exists turno_cola_un_turno_activo_tipo;
create unique index turno_cola_un_turno_activo_tipo
  on turno_cola (cliente_id, tipo_servicio)
  where estado = any (array['en_fila','llamado','en_camino','atendiendo']);

create or replace function turno_iniciar_atencion(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_neg uuid;
begin
  select * into v from turno_cola where id = p_cola;
  if v.id is null then raise exception 'turno inexistente'; end if;
  v_neg := v.negocio_id;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
  if v.perfil_id is not null and not public.turno_es_mi_perfil(v.perfil_id)
     and not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'no puedes operar este turno';
  end if;
  if v.estado not in ('en_fila','llamado','en_camino') then
    raise exception 'ese turno no está esperando';
  end if;
  update turno_cola set estado = 'atendiendo', atendiendo_at = now()
   where id = p_cola returning * into v;
  return v;
end $$;

create or replace function turno_entrar_a_cola(p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_row public.turno_cola;
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
  if exists(select 1 from turno_cola
            where cliente_id = v_cliente and tipo_servicio = v_tipo
              and estado in ('en_fila','llamado','en_camino','atendiendo')) then
    raise exception 'ya tienes un turno activo de este tipo de servicio';
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
    from turno_cola where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino','atendiendo');
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

create or replace function turno_registrar_fisico(p_negocio uuid, p_perfil uuid, p_servicio uuid, p_nombre text, p_telefono text)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v_cli uuid; v_pos int; v_tipo text; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
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
    from turno_cola where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino','atendiendo');
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo, 3, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

-- Las bajas deben soltar también a quien está en la silla.
create or replace function turno_salir_local(p_negocio uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid();
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  update turno_membresias set activo = false
   where usuario_id = v_uid and negocio_id = p_negocio and rol = 'cliente';
  update turno_cola set estado = 'abandonado'
   where cliente_id = v_uid and negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino','atendiendo');
end $$;

create or replace function turno_dejar_local(p_perfil uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid(); v_neg uuid;
begin
  select negocio_id into v_neg from turno_perfiles where id = p_perfil and usuario_id = v_uid;
  if v_neg is null then raise exception 'no es tu perfil'; end if;
  update turno_perfiles set activo = false where id = p_perfil;
  update turno_citas set estado = 'cancelada', cancelada_by = 'barbero'
   where perfil_id = p_perfil and estado in ('creada','confirmada','no_confirmada')
     and (fecha + hora_inicio) > now();
  update turno_cola set estado = 'abandonado'
   where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino','atendiendo');
  update turno_membresias set activo = false
   where usuario_id = v_uid and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

create or replace function turno_desvincular_barbero(p_perfil uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid; v_barbero uuid;
begin
  select negocio_id, usuario_id into v_neg, v_barbero from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if not (v_neg in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;
  update turno_perfiles set activo = false where id = p_perfil;
  update turno_citas set estado = 'cancelada', cancelada_by = 'sistema'
   where perfil_id = p_perfil and estado in ('creada','confirmada','no_confirmada')
     and (fecha + hora_inicio) > now();
  update turno_cola set estado = 'abandonado'
   where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino','atendiendo');
  update turno_membresias set activo = false
   where usuario_id = v_barbero and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

create or replace function turno_cerrar_local(p_negocio uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;
  update turno_negocios set activo = false where id = p_negocio;
  update turno_perfiles set activo = false where negocio_id = p_negocio;
  update turno_citas set estado = 'cancelada', cancelada_by = 'sistema'
   where negocio_id = p_negocio and estado in ('creada','confirmada','no_confirmada')
     and (fecha + hora_inicio) > now();
  update turno_cola set estado = 'abandonado'
   where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino','atendiendo');
end $$;

create or replace function turno_eliminar_cuenta()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid();
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  update turno_membresias set activo = false where usuario_id = v_uid;
  update turno_perfiles set activo = false where usuario_id = v_uid;
  update turno_citas set estado = 'cancelada', cancelada_by = 'cliente'
   where cliente_id = v_uid and estado in ('creada','confirmada','no_confirmada')
     and (fecha + hora_inicio) > now();
  update turno_cola set estado = 'abandonado'
   where cliente_id = v_uid and estado in ('en_fila','llamado','en_camino','atendiendo');
  delete from turno_push_tokens where usuario_id = v_uid;
  update turno_usuarios
     set nombre = 'Cuenta eliminada', telefono = '', email = null, auth_id = null,
         codigo_barbero = null, foto_url = null, bio = null, especialidad = null,
         instagram = null, whatsapp = null
   where id = v_uid;
end $$;
