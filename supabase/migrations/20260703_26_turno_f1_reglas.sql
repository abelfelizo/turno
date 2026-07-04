-- =====================================================================
-- TURNO · Migración 26 · Fase 1 del rediseño UX
-- 1) R1: un turno activo POR TIPO DE SERVICIO (barbero + manicure a la vez).
-- 2) Fix: promover tipo_usuario a 'profesional' en los upserts (sin esto,
--    un cliente que luego se une como barbero nunca recibe código).
-- 3) Fix: zona horaria por negocio — las ventanas de cita se comparan en
--    hora local del local, no en UTC.
-- =====================================================================

-- ── 1) R1: tipo de servicio en la cola ────────────────────────────────
alter table public.turno_cola add column if not exists tipo_servicio text;

update public.turno_cola c
   set tipo_servicio = coalesce(
     (select p.tipo_servicio from turno_servicios s
        join turno_perfiles p on p.id = s.perfil_id
       where s.id = c.servicio_id), 'barbero')
 where c.tipo_servicio is null;

drop index if exists public.turno_cola_un_turno_activo;
create unique index if not exists turno_cola_un_turno_activo_tipo
  on public.turno_cola(cliente_id, tipo_servicio)
  where estado in ('en_fila','llamado','en_camino');

-- ── 3) tz por negocio ─────────────────────────────────────────────────
alter table public.turno_negocios
  add column if not exists tz text default 'America/Santo_Domingo';

-- ── entrar a la cola: chequeo por tipo + guarda tipo ──────────────────
create or replace function public.turno_entrar_a_cola(
  p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
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
  -- Caso 18 (ajustado R1): un turno activo por tipo de servicio
  if exists(select 1 from turno_cola
            where cliente_id = v_cliente and tipo_servicio = v_tipo
              and estado in ('en_fila','llamado','en_camino')) then
    raise exception 'ya tienes un turno activo de este tipo de servicio';
  end if;
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;
  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio and estado = 'en_fila';
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) to authenticated;
revoke execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) from public, anon;

-- ── llamar siguiente: ventana en hora LOCAL del negocio ───────────────
create or replace function public.turno_llamar_siguiente(
  p_negocio uuid, p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
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

  select ventana_llegada_min, gracia_cita_min into v_ventana, v_gracia
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_ventana := coalesce(v_ventana, 10);
  v_gracia  := coalesce(v_gracia, 5);
  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  v_ahora := (now() at time zone v_tz);

  -- Caso 1: cita confirmada EN CURSO (en hora local) bloquea la cola del perfil
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

grant execute on function public.turno_llamar_siguiente(uuid,uuid) to authenticated;
revoke execute on function public.turno_llamar_siguiente(uuid,uuid) from public, anon;

-- ── cron: anticipación de citas en hora LOCAL de cada negocio ─────────
create or replace function public.turno_expirar_llamados()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update turno_cola set estado = 'expirado'
   where estado = 'llamado' and expira_at is not null and expira_at < now();
  get diagnostics v_count = row_count;

  update turno_citas c set estado = 'no_confirmada'
    from turno_configuracion_negocio cfg, turno_negocios n
   where cfg.negocio_id = c.negocio_id and n.id = c.negocio_id
     and c.estado = 'creada'
     and (c.fecha + c.hora_inicio) > (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))
     and ((c.fecha + c.hora_inicio) - (now() at time zone coalesce(n.tz, 'America/Santo_Domingo')))
         < make_interval(hours => cfg.anticipacion_minima_horas);
  return v_count;
end $$;

revoke execute on function public.turno_expirar_llamados() from public, anon, authenticated;

-- ── 2) promover tipo_usuario en los upserts profesionales ─────────────
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
  on conflict(auth_id) do update
    set nombre=excluded.nombre, telefono=excluded.telefono,
        tipo_usuario='profesional', updated_at=now()
  returning id into v_uid;
  v_codigo := public.turno_gen_codigo(p_nombre_negocio);
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
  on conflict(auth_id) do update
    set nombre=excluded.nombre, telefono=excluded.telefono,
        tipo_usuario='profesional', updated_at=now()
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
