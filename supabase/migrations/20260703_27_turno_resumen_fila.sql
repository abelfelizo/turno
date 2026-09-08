-- =====================================================================
-- TURNO · Migración 27 · Resumen de fila para la hoja de confirmación (R3)
-- Antes de entrar a la cola, el cliente ve cuántos hay delante y la espera
-- estimada. Calcula sobre la cola actual del barbero (o del local si es pool).
-- =====================================================================

create or replace function public.turno_resumen_fila(p_negocio uuid, p_perfil uuid default null)
returns table(delante int, espera_min int)
language plpgsql stable security definer set search_path = public as $$
declare v_gap int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where p_perfil is not null and perfil_id = p_perfil and activo;
  v_gap := coalesce(v_gap, 10);
  return query
  with q as (
    select coalesce(s.duracion_min, 20) as dur
      from turno_cola c
      left join turno_servicios s on s.id = c.servicio_id
     where c.negocio_id = p_negocio and c.estado = 'en_fila'
       and (p_perfil is null or c.perfil_id is null or c.perfil_id = p_perfil)
  )
  select count(*)::int,
         (coalesce(sum(q.dur), 0) + count(*) * v_gap)::int
    from q;
end $$;

grant execute on function public.turno_resumen_fila(uuid, uuid) to authenticated;
revoke execute on function public.turno_resumen_fila(uuid, uuid) from public, anon;
