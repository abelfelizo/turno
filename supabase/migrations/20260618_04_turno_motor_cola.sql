-- =====================================================================
-- TURNO · Fase 1 · Migración 4: motor de cola (RPC transaccionales)
-- Complementa los triggers existentes. Resuelve concurrencia entre
-- dispositivos (varios barberos / clientes compitiendo por la cola).
-- =====================================================================

-- Caso 18: un solo turno activo por cliente (enforce en BD)
create unique index if not exists turno_cola_un_turno_activo
  on public.turno_cola(cliente_id)
  where estado in ('en_fila','llamado','en_camino');

-- ---------------------------------------------------------------------
-- Entrar a la cola (cliente digital). Posición atómica + anti-duplicado.
-- ---------------------------------------------------------------------
create or replace function public.turno_entrar_a_cola(
  p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int;
  v_prioridad int;
  v_row public.turno_cola;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  -- Caso 18
  if exists(select 1 from turno_cola
            where cliente_id = v_cliente and estado in ('en_fila','llamado','en_camino')) then
    raise exception 'ya tienes un turno activo';
  end if;
  -- serializar el cálculo de posición por negocio
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio and estado = 'en_fila';
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- Llamar al siguiente (staff). Atómico: FOR UPDATE SKIP LOCKED evita
-- que dos barberos llamen al mismo cliente. Respeta cita confirmada.
-- ---------------------------------------------------------------------
create or replace function public.turno_llamar_siguiente(
  p_negocio uuid, p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare v_ventana int; v_row public.turno_cola;
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
  -- Caso 1: cita confirmada en curso bloquea la cola para ese perfil
  if p_perfil is not null and exists(
       select 1 from turno_citas
       where perfil_id = p_perfil and fecha = current_date and estado = 'confirmada') then
    return null;
  end if;
  select ventana_llegada_min into v_ventana
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_ventana := coalesce(v_ventana, 10);
  -- Casos 3,4,8: por prioridad y luego posición
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

-- ---------------------------------------------------------------------
-- Cliente confirma "voy en camino" (Caso 6)
-- ---------------------------------------------------------------------
create or replace function public.turno_confirmar_camino(p_cola uuid)
returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare v_row public.turno_cola;
begin
  update turno_cola set estado = 'en_camino', en_camino_at = now()
   where id = p_cola and cliente_id = public.turno_uid() and estado in ('llamado','en_fila')
   returning * into v_row;
  if v_row.id is null then raise exception 'no autorizado o estado invalido'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- ETA en minutos (Caso 10): suma duraciones reales delante + gap
-- ---------------------------------------------------------------------
create or replace function public.turno_eta(p_cola uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_row turno_cola; v_min int; v_gap int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where perfil_id = v_row.perfil_id and activo;
  v_gap := coalesce(v_gap, 10);
  select coalesce(sum(s.duracion_min), 0) + count(*) * v_gap into v_min
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));
  return v_min;
end $$;

-- ---------------------------------------------------------------------
-- Cron: expira llamados vencidos (5/15) y citas no confirmadas (13)
-- Pensada para ejecutarse cada minuto (pg_cron / Edge scheduled).
-- ---------------------------------------------------------------------
create or replace function public.turno_expirar_llamados()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update turno_cola set estado = 'expirado'
   where estado = 'llamado' and expira_at is not null and expira_at < now();
  get diagnostics v_count = row_count;

  update turno_citas c set estado = 'no_confirmada'
    from turno_configuracion_negocio cfg
   where cfg.negocio_id = c.negocio_id
     and c.estado = 'creada'
     and ((c.fecha + c.hora_inicio) - now()::timestamp)
         < make_interval(hours => cfg.anticipacion_minima_horas);
  return v_count;
end $$;

-- Permisos
grant execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.turno_llamar_siguiente(uuid,uuid)        to authenticated;
grant execute on function public.turno_confirmar_camino(uuid)             to authenticated;
grant execute on function public.turno_eta(uuid)                          to authenticated;
revoke execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) from public, anon;
revoke execute on function public.turno_llamar_siguiente(uuid,uuid)        from public, anon;
revoke execute on function public.turno_confirmar_camino(uuid)             from public, anon;
revoke execute on function public.turno_eta(uuid)                          from public, anon;
-- cron: solo service_role
revoke execute on function public.turno_expirar_llamados() from public, anon, authenticated;
