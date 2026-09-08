-- =====================================================================
-- TURNO · Migración 21: el cliente encuentra y sigue al barbero por código
-- Dado el código del barbero, listar dónde trabaja y permitir al cliente
-- unirse a ese local para reservarlo.
-- =====================================================================

-- Locales donde el barbero trabaja (perfil activo y aprobado).
create or replace function public.turno_barbero_negocios(p_usuario uuid)
returns table(negocio_id uuid, negocio_nombre text, perfil_id uuid)
language sql stable security definer set search_path = public as $$
  select p.negocio_id, n.nombre, p.id
    from turno_perfiles p
    join turno_negocios n on n.id = p.negocio_id
   where p.usuario_id = p_usuario and p.activo and p.aprobado and n.activo
   order by n.nombre
$$;

-- El cliente autenticado se suma como cliente a un local (idempotente).
create or replace function public.turno_agregar_negocio_cliente(p_negocio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.turno_uid();
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  if not exists(select 1 from turno_negocios where id = p_negocio and activo) then
    raise exception 'negocio invalido';
  end if;
  if not exists(select 1 from turno_membresias where usuario_id = v_uid and negocio_id = p_negocio and rol = 'cliente') then
    insert into turno_membresias(usuario_id, negocio_id, rol, activo) values (v_uid, p_negocio, 'cliente', true);
  end if;
end $$;

grant execute on function public.turno_barbero_negocios(uuid) to authenticated;
grant execute on function public.turno_agregar_negocio_cliente(uuid) to authenticated;
revoke execute on function public.turno_barbero_negocios(uuid) from public, anon;
revoke execute on function public.turno_agregar_negocio_cliente(uuid) from public, anon;
