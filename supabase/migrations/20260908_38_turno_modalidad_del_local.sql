-- LA MODALIDAD LA PONE LA BARBERÍA, NO EL BARBERO
--
-- Aclaración de producto (sep-2026): hay dos modalidades de local, y es el
-- LOCAL el que está en una o en otra.
--
--   · `empleados`         → la barbería es el jefe: pone horarios, turnos y precios.
--   · `espacios_rentados` → agrupa barberos que pagan su asiento; cada uno pone
--                           sus horarios, sus precios y sus reglas.
--
-- `turno_negocios.tipo` ya guardaba esto desde el principio, pero nadie lo
-- consultaba: turno_unirse_profesional aceptaba el rol que le mandaba el
-- cliente. Es decir, quien entraba **se declaraba a sí mismo** empleado o
-- rentado. En una barbería de empleados bastaba con elegir "rento espacio"
-- para volverse autónomo y saltarse la regla R11 entera — precios y horario
-- propios en un local donde manda el dueño.
--
-- Ahora el rol se deriva del tipo del local y el parámetro p_rol se ignora (se
-- conserva en la firma para no romper a quien la llame).

create or replace function turno_unirse_profesional(p_codigo text, p_tipo_servicio text, p_rol text, p_nombre text, p_telefono text)
returns turno_perfiles language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_neg uuid; v_tipo text; v_rol text; v_perfil public.turno_perfiles;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  select id, tipo into v_neg, v_tipo from turno_negocios where codigo_acceso = upper(p_codigo) and activo;
  if v_neg is null then raise exception 'codigo invalido'; end if;

  -- La modalidad del local manda. p_rol se ignora a propósito.
  v_rol := case when v_tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end;

  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre,p_telefono,'profesional',auth.jwt()->>'email')
  on conflict(auth_id) do update
    set nombre=excluded.nombre, telefono=excluded.telefono,
        tipo_usuario='profesional', updated_at=now()
  returning id into v_uid;

  -- Si ya había membresía profesional, se corrige a la modalidad del local en
  -- vez de crear una segunda: dos roles a la vez dejarían la autonomía a suerte
  -- de cuál lea primero cada consulta.
  update turno_membresias set rol = v_rol, activo = true
   where usuario_id = v_uid and negocio_id = v_neg and rol in ('empleado','barbero_renta');
  if not found then
    insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg,v_rol,true);
  end if;

  select * into v_perfil from turno_perfiles where usuario_id=v_uid and negocio_id=v_neg;
  if v_perfil.id is null then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,estado_actual)
    values(v_uid,v_neg,coalesce(p_tipo_servicio,'barbero'),true,false,'disponible')
    returning * into v_perfil;
  end if;
  return v_perfil;
end $$;

-- Excepción para los locales mixtos: una barbería de empleados que además
-- alquila un asiento. Lo decide el DUEÑO, persona a persona — nunca el barbero
-- sobre sí mismo, que es justo el agujero que esto cierra.
create or replace function turno_cambiar_modalidad(p_perfil uuid, p_rol text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_u uuid; v_neg uuid;
begin
  if p_rol not in ('empleado','barbero_renta') then raise exception 'modalidad invalida'; end if;
  select usuario_id, negocio_id into v_u, v_neg from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if not (v_neg in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;
  if exists(select 1 from turno_membresias
             where usuario_id = v_u and negocio_id = v_neg and rol = 'dueno' and activo) then
    raise exception 'el dueño del local no cambia de modalidad';
  end if;
  update turno_membresias set rol = p_rol
   where usuario_id = v_u and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

grant execute on function turno_cambiar_modalidad(uuid, text) to authenticated;
