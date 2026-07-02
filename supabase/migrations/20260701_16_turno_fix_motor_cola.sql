-- =====================================================================
-- TURNO · Migración 16: correcciones del motor de cola
-- 1) turno_llamar_siguiente: una cita confirmada bloquea la cola SOLO
--    mientras está en su ventana horaria (no todo el día).
-- 2) turno_expirar_llamados: solo marca no_confirmada citas FUTURAS.
-- =====================================================================

create or replace function public.turno_llamar_siguiente(
  p_negocio uuid, p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare v_ventana int; v_gracia int; v_row public.turno_cola;
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

  -- Caso 1: cita confirmada EN CURSO bloquea la cola de ese perfil.
  -- "En curso" = ahora está entre (inicio − ventana) y (fin + gracia).
  -- Fuera de esa franja el barbero puede seguir trabajando su fila.
  if p_perfil is not null and exists(
       select 1 from turno_citas
        where perfil_id = p_perfil and fecha = current_date and estado = 'confirmada'
          and now()::timestamp between (fecha + hora_inicio) - make_interval(mins => v_ventana)
                                   and (fecha + hora_fin)    + make_interval(mins => v_gracia)) then
    return null;
  end if;

  -- Casos 3,4,8: por prioridad y luego posición.
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

create or replace function public.turno_expirar_llamados()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update turno_cola set estado = 'expirado'
   where estado = 'llamado' and expira_at is not null and expira_at < now();
  get diagnostics v_count = row_count;

  -- Caso 13: cita 'creada' que entra en la ventana de anticipación sin
  -- confirmarse pasa a no_confirmada. Solo citas aún FUTURAS.
  update turno_citas c set estado = 'no_confirmada'
    from turno_configuracion_negocio cfg
   where cfg.negocio_id = c.negocio_id
     and c.estado = 'creada'
     and (c.fecha + c.hora_inicio) > now()::timestamp
     and ((c.fecha + c.hora_inicio) - now()::timestamp)
         < make_interval(hours => cfg.anticipacion_minima_horas);
  return v_count;
end $$;

grant execute on function public.turno_llamar_siguiente(uuid,uuid) to authenticated;
revoke execute on function public.turno_llamar_siguiente(uuid,uuid) from public, anon;
revoke execute on function public.turno_expirar_llamados() from public, anon, authenticated;
