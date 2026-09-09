-- EL DUEÑO NO VE EL DINERO DE QUIEN LE RENTA
--
-- Reportado en el piloto: "¿por qué el dueño ve las ganancias de los que
-- rentan?". Tiene razón, y el problema era peor de lo que se veía en pantalla:
--
--   · turno_estadisticas_negocio devolvía `ingresos_renta`, la facturación de
--     los barberos rentados, y la app la pintaba como "volumen de rentas".
--   · turno_stats_periodo_negocio era peor: sumaba precio_cobrado de TODO el
--     local sin mirar el rol. Los "ingresos" del dueño por período incluían el
--     dinero de los rentados mezclado con el suyo. No era solo una fuga de
--     privacidad: era un número falso, inflado.
--
-- Un barbero que paga su asiento es un negocio independiente. Su facturación
-- no es asunto de su casero, igual que el dueño de un local comercial no ve la
-- caja de su inquilino.
--
-- Lo que el dueño SÍ necesita saber es si el asiento se está usando, para
-- decidir si le renta. Eso son VISITAS, no pesos. Se cambia el importe por el
-- conteo: informa lo mismo para su decisión y no expone lo que no le toca.

create or replace function turno_estadisticas_negocio(p_negocio uuid)
returns table(ingresos_propios numeric, visitas_renta integer, atendidos_hoy integer,
              ingresos_hoy numeric, total_visitas integer, clientes_unicos integer)
language plpgsql security definer set search_path to 'public' as $$
declare v_hoy date;
begin
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  v_hoy := (now() at time zone coalesce(
    (select tz from turno_negocios where id = p_negocio), 'America/Santo_Domingo'))::date;

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
    -- Conteo, no importe: le dice al dueño que el asiento se usa.
    coalesce(count(*) filter (where rol = 'barbero_renta')::int, 0),
    coalesce(count(*) filter (where fecha = v_hoy)::int, 0),
    coalesce(sum(precio_cobrado) filter (where rol <> 'barbero_renta' and fecha = v_hoy), 0),
    coalesce(count(*)::int, 0),
    coalesce(count(distinct cliente_id)::int, 0)
  from v;
end $$;

-- Aquí estaba el número falso: sin filtro de rol, "tus ingresos" incluían los
-- de los rentados.
create or replace function turno_stats_periodo_negocio(p_negocio uuid, p_desde date, p_hasta date)
returns table(ingresos numeric, visitas integer, clientes integer, ticket numeric, visitas_renta integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  return query
  with v as (
    select hv.precio_cobrado, hv.cliente_id,
           coalesce(m.rol, 'empleado') as rol
      from turno_historial_visitas hv
      left join turno_perfiles pf on pf.id = hv.perfil_id
      left join turno_membresias m on m.usuario_id = pf.usuario_id
             and m.negocio_id = hv.negocio_id and m.activo = true
     where hv.negocio_id = p_negocio and hv.fecha between p_desde and p_hasta
  )
  select
    coalesce(sum(precio_cobrado) filter (where rol <> 'barbero_renta'), 0),
    coalesce(count(*) filter (where rol <> 'barbero_renta')::int, 0),
    coalesce(count(distinct cliente_id) filter (where rol <> 'barbero_renta')::int, 0),
    coalesce(avg(precio_cobrado) filter (where rol <> 'barbero_renta'), 0),
    coalesce(count(*) filter (where rol = 'barbero_renta')::int, 0)
  from v;
end $$;
