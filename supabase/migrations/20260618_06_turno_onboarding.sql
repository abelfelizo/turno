-- =====================================================================
-- TURNO · Fase 2 · Migración 6: RPC de onboarding (atómicos)
-- Crear negocio / unirse como profesional / unirse como cliente.
-- SECURITY DEFINER: evitan el problema huevo-gallina del RLS
-- (config requiere ser dueño, que se define al crear la membresía).
-- =====================================================================

-- Generador de código de acceso único (6 chars A-Z0-9).
-- Usa random() (sin pgcrypto: gen_random_bytes vive en el esquema extensions).
create or replace function public.turno_gen_codigo()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_code text; v_exists boolean; i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    select exists(select 1 from turno_negocios where codigo_acceso = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end $$;

-- ------------------------------------------------ CREAR NEGOCIO (dueño)
create or replace function public.turno_crear_negocio(
  p_nombre_negocio text, p_tipo text, p_moneda text,
  p_atiende boolean, p_tipo_servicio text,
  p_nombre_dueno text, p_telefono text,
  p_anticipacion int default 2, p_ventana int default 10, p_gracia int default 5,
  p_puntos_activos boolean default false, p_puntos_por_visita int default null,
  p_visitas_gratis int default null, p_asignacion_dueno boolean default false,
  p_doble_servicio boolean default false
) returns public.turno_negocios
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_neg public.turno_negocios; v_codigo text;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_tipo not in ('espacios_rentados','empleados') then raise exception 'tipo invalido'; end if;
  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre_dueno,p_telefono,'profesional',auth.jwt()->>'email')
  on conflict(auth_id) do update set nombre=excluded.nombre, telefono=excluded.telefono, updated_at=now()
  returning id into v_uid;
  v_codigo := public.turno_gen_codigo();
  insert into turno_negocios(nombre,tipo,codigo_acceso,moneda)
  values(p_nombre_negocio,p_tipo,v_codigo,coalesce(p_moneda,'RD$'))
  returning * into v_neg;
  insert into turno_configuracion_negocio(
    negocio_id,anticipacion_minima_horas,ventana_llegada_min,gracia_cita_min,
    puntos_activos,puntos_por_visita,visitas_para_gratis,asignacion_por_dueno,doble_servicio_activo)
  values(v_neg.id,p_anticipacion,p_ventana,p_gracia,
    p_puntos_activos,p_puntos_por_visita,p_visitas_gratis,p_asignacion_dueno,p_doble_servicio);
  insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg.id,'dueno',true);
  if p_atiende then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,estado_actual)
    values(v_uid,v_neg.id,coalesce(p_tipo_servicio,'barbero'),true,true,'disponible');
  end if;
  return v_neg;
end $$;

-- -------------------------------------- UNIRSE COMO PROFESIONAL (barbero)
create or replace function public.turno_unirse_profesional(
  p_codigo text, p_tipo_servicio text, p_rol text, p_nombre text, p_telefono text
) returns public.turno_perfiles
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_neg uuid; v_perfil public.turno_perfiles;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_rol not in ('empleado','barbero_renta') then raise exception 'rol invalido'; end if;
  select id into v_neg from turno_negocios where codigo_acceso = upper(p_codigo) and activo;
  if v_neg is null then raise exception 'codigo invalido'; end if;
  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre,p_telefono,'profesional',auth.jwt()->>'email')
  on conflict(auth_id) do update set nombre=excluded.nombre, telefono=excluded.telefono, updated_at=now()
  returning id into v_uid;
  if not exists(select 1 from turno_membresias where usuario_id=v_uid and negocio_id=v_neg and rol=p_rol) then
    insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg,p_rol,true);
  end if;
  select * into v_perfil from turno_perfiles where usuario_id=v_uid and negocio_id=v_neg;
  if v_perfil.id is null then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,estado_actual)
    values(v_uid,v_neg,coalesce(p_tipo_servicio,'barbero'),true,false,'disponible')
    returning * into v_perfil;
  end if;
  return v_perfil;
end $$;

-- ------------------------------------------------ UNIRSE COMO CLIENTE
create or replace function public.turno_unirse_cliente(
  p_codigo text, p_nombre text, p_telefono text
) returns public.turno_negocios
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_neg public.turno_negocios;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  select * into v_neg from turno_negocios where codigo_acceso = upper(p_codigo) and activo;
  if v_neg.id is null then raise exception 'codigo invalido'; end if;
  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre,p_telefono,'cliente',auth.jwt()->>'email')
  on conflict(auth_id) do update set nombre=excluded.nombre, telefono=excluded.telefono, updated_at=now()
  returning id into v_uid;
  if not exists(select 1 from turno_membresias where usuario_id=v_uid and negocio_id=v_neg.id and rol='cliente') then
    insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg.id,'cliente',true);
  end if;
  return v_neg;
end $$;

-- Permisos
grant execute on function public.turno_crear_negocio(text,text,text,boolean,text,text,text,int,int,int,boolean,int,int,boolean,boolean) to authenticated;
grant execute on function public.turno_unirse_profesional(text,text,text,text,text) to authenticated;
grant execute on function public.turno_unirse_cliente(text,text,text) to authenticated;
revoke execute on function public.turno_gen_codigo() from public, anon, authenticated;
revoke execute on function public.turno_crear_negocio(text,text,text,boolean,text,text,text,int,int,int,boolean,int,int,boolean,boolean) from public, anon;
revoke execute on function public.turno_unirse_profesional(text,text,text,text,text) from public, anon;
revoke execute on function public.turno_unirse_cliente(text,text,text) from public, anon;
