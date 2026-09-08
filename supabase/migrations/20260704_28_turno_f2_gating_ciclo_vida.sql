-- F2 · Vivo y proactivo (R2 gating) + F2b · Ciclo de vida (altas/bajas)
-- Solo objetos turno_ (BD compartida). TZ del negocio ya vive en turno_negocios.tz.

-- ── R2: gating de "voy en camino" ────────────────────────────────────────────
alter table turno_configuracion_negocio
  add column if not exists umbral_confirmacion int not null default 2;

comment on column turno_configuracion_negocio.umbral_confirmacion is
  'R2: el cliente solo puede confirmar "voy en camino" cuando quedan <= N delante (o ya fue llamado).';

-- Habilita el botón sólo cuando el turno está cerca (o ya llamado). Lectura barata.
create or replace function turno_puede_confirmar(p_cola uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_umbral int; v_delante int;
begin
  select * into v from turno_cola where id = p_cola and cliente_id = public.turno_uid();
  if v.id is null then return false; end if;
  if v.estado in ('llamado','en_camino') then return true; end if;
  if v.estado <> 'en_fila' then return false; end if;
  select coalesce(umbral_confirmacion, 2) into v_umbral
    from turno_configuracion_negocio where negocio_id = v.negocio_id;
  v_umbral := coalesce(v_umbral, 2);
  select count(*) into v_delante from turno_cola c2
   where c2.negocio_id = v.negocio_id and c2.estado = 'en_fila'
     and (v.perfil_id is null or c2.perfil_id is null or c2.perfil_id = v.perfil_id)
     and (c2.prioridad < v.prioridad or (c2.prioridad = v.prioridad and c2.posicion < v.posicion));
  return v_delante <= v_umbral;
end $$;

-- Confirmar "voy en camino" con gating R2 (server-side, no confiable sólo en UI).
create or replace function turno_confirmar_camino(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_umbral int; v_delante int;
begin
  select * into v from turno_cola where id = p_cola and cliente_id = public.turno_uid();
  if v.id is null then raise exception 'no autorizado'; end if;
  if v.estado not in ('llamado','en_fila') then raise exception 'estado invalido'; end if;

  if v.estado = 'en_fila' then
    select coalesce(umbral_confirmacion, 2) into v_umbral
      from turno_configuracion_negocio where negocio_id = v.negocio_id;
    v_umbral := coalesce(v_umbral, 2);
    select count(*) into v_delante from turno_cola c2
     where c2.negocio_id = v.negocio_id and c2.estado = 'en_fila'
       and (v.perfil_id is null or c2.perfil_id is null or c2.perfil_id = v.perfil_id)
       and (c2.prioridad < v.prioridad or (c2.prioridad = v.prioridad and c2.posicion < v.posicion));
    if v_delante > v_umbral then
      raise exception 'Aún faltan % delante de ti. Podrás confirmar cuando estés más cerca.', v_delante;
    end if;
  end if;

  update turno_cola set estado = 'en_camino', en_camino_at = now()
   where id = p_cola returning * into v;
  return v;
end $$;

-- ── F2b: bajas (siempre lógicas; nunca se borra historial) ────────────────────

-- Cliente sale de una barbería (conserva su historial).
create or replace function turno_salir_local(p_negocio uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid();
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  update turno_membresias set activo = false
   where usuario_id = v_uid and negocio_id = p_negocio and rol = 'cliente';
  update turno_cola set estado = 'abandonado'
   where cliente_id = v_uid and negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino');
end $$;

-- Barbero deja su propia silla: cancela citas/cola futuras y desactiva perfil+membresía.
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
   where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino');
  update turno_membresias set activo = false
   where usuario_id = v_uid and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

-- Dueño desvincula a un barbero de su local (mismo efecto, iniciado por el negocio).
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
   where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino');
  update turno_membresias set activo = false
   where usuario_id = v_barbero and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

-- Dueño cierra el local: baja lógica + cancela lo futuro. Los rentas conservan su cuenta.
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
   where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino');
end $$;

-- Eliminar cuenta (requisito de tiendas): baja lógica + anonimización de datos personales.
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
   where cliente_id = v_uid and estado in ('en_fila','llamado','en_camino');
  delete from turno_push_tokens where usuario_id = v_uid;
  update turno_usuarios
     set nombre = 'Cuenta eliminada', telefono = '', email = null, auth_id = null,
         codigo_barbero = null, foto_url = null, bio = null, especialidad = null,
         instagram = null, whatsapp = null
   where id = v_uid;
end $$;

-- ── Stats del dueño separadas: ingresos propios vs. volumen de rentas ─────────
-- Propio = visitas de empleados + silla del dueño. Renta = volumen informativo.
create or replace function turno_estadisticas_negocio(p_negocio uuid)
returns table(ingresos_propios numeric, ingresos_renta numeric, atendidos_hoy int,
              ingresos_hoy numeric, total_visitas int, clientes_unicos int)
language sql security definer set search_path to 'public' as $$
  with v as (
    select hv.precio_cobrado, hv.cliente_id, hv.fecha,
           coalesce(m.rol, 'empleado') as rol
      from turno_historial_visitas hv
      left join turno_perfiles pf on pf.id = hv.perfil_id
      left join turno_membresias m on m.usuario_id = pf.usuario_id
             and m.negocio_id = hv.negocio_id and m.activo = true
     where hv.negocio_id = p_negocio
  )
  select
    coalesce(sum(precio_cobrado) filter (where rol <> 'barbero_renta'), 0),
    coalesce(sum(precio_cobrado) filter (where rol = 'barbero_renta'), 0),
    coalesce(count(*) filter (where fecha = (now() at time zone
      coalesce((select tz from turno_negocios where id = p_negocio), 'America/Santo_Domingo'))::date)::int, 0),
    coalesce(sum(precio_cobrado) filter (where rol <> 'barbero_renta' and fecha = (now() at time zone
      coalesce((select tz from turno_negocios where id = p_negocio), 'America/Santo_Domingo'))::date), 0),
    coalesce(count(*)::int, 0),
    coalesce(count(distinct cliente_id)::int, 0)
  from v;
$$;
