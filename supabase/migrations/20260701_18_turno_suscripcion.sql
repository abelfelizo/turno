-- =====================================================================
-- TURNO · Migración 18: cálculo de asientos para la suscripción
-- Modelo "por asiento con tope": el dueño cubre a sus empleados (y a sí
-- mismo si atiende). Los independientes (barbero_renta) pagan aparte.
-- Esta función solo CUENTA asientos; el monto se calcula en la app con
-- los precios de constants.SUSCRIPCION (o, en producción, el producto IAP).
-- =====================================================================

create or replace function public.turno_asientos_negocio(p_negocio uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare v_empleados int; v_duenos_atienden int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'sin acceso al negocio';
  end if;

  -- Empleados activos que el dueño cubre.
  select count(*) into v_empleados
    from turno_membresias
   where negocio_id = p_negocio and rol = 'empleado' and activo;

  -- Dueños que además atienden (tienen perfil aprobado/activo) = asiento propio.
  select count(distinct m.usuario_id) into v_duenos_atienden
    from turno_membresias m
    join turno_perfiles p
      on p.usuario_id = m.usuario_id and p.negocio_id = m.negocio_id
   where m.negocio_id = p_negocio and m.rol = 'dueno' and m.activo
     and p.activo and p.aprobado;

  return coalesce(v_empleados, 0) + coalesce(v_duenos_atienden, 0);
end $$;

grant execute on function public.turno_asientos_negocio(uuid) to authenticated;
revoke execute on function public.turno_asientos_negocio(uuid) from public, anon;
