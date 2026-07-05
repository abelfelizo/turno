-- Endurece las funciones de stats: sólo el dueño (negocio) o el propio barbero
-- (perfil) pueden leer sus agregados. Antes cualquier autenticado con un id podía.

create or replace function turno_estadisticas_negocio(p_negocio uuid)
returns table(ingresos_propios numeric, ingresos_renta numeric, atendidos_hoy int,
              ingresos_hoy numeric, total_visitas int, clientes_unicos int)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  return query
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
end $$;

create or replace function turno_stats_periodo_negocio(p_negocio uuid, p_desde date, p_hasta date)
returns table(ingresos numeric, visitas int, clientes int, ticket numeric)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  return query
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where negocio_id = p_negocio and fecha between p_desde and p_hasta;
end $$;

create or replace function turno_stats_periodo_perfil(p_perfil uuid, p_desde date, p_hasta date)
returns table(ingresos numeric, visitas int, clientes int, ticket numeric)
language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid; v_dueno uuid;
begin
  select negocio_id, usuario_id into v_neg, v_dueno from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if v_dueno <> public.turno_uid() and not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  return query
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where perfil_id = p_perfil and fecha between p_desde and p_hasta;
end $$;
