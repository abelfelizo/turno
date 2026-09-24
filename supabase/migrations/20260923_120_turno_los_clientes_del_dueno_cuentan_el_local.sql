-- ═══════════════════════════════════════════════════════════════════════════
-- 120 · LOS CLIENTES DEL DUEÑO CUENTAN EL LOCAL, NO SOLO SU SILLA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PREPARADA el 23 sep, SIN APLICAR. Se aplica solo con visto bueno.
-- Solo AÑADE una función: no cambia ni borra nada de lo que ya existe.
-- Vuelta atrás: supabase/rollback_120_los_clientes_del_dueno.sql
--
-- LO QUE SE ENCONTRÓ (23 sep, preparando el panel del dueño):
--
-- `turno_clientes_del_local` (117) le enseña al administrador la lista ENTERA
-- del local —correcto: son sus clientes—, pero las cifras de cada uno salen de
--
--     h.perfil_id in (perfiles de quien pregunta)
--
-- o sea, SOLO las visitas de la silla del propio dueño. En un local de
-- empleados, un cliente que viene cada semana con un empleado le sale al dueño
-- con 0 visitas y sin última fecha. La pestaña Clientes del dueño, con su
-- «Por recuperar», marcaría como perdidos a los mejores clientes del local.
--
-- La 117 lo hizo así a propósito, y para el BARBERO está bien: su pestaña dice
-- «contigo» y el único número que le importa es el suyo. Por eso NO se toca:
-- el dueño que también atiende sigue viendo en Mi silla sus números. Lo que
-- falta es la otra mitad, para el panel de la barbería.
--
-- LO QUE HACE: una función nueva, solo para quien administra el local, que
-- cuenta las visitas de las sillas que MANDA —las mismas que ya puede leer
-- por la política de turno_historial_visitas (turno_manda_en_la_silla)—:
--
--   · los empleados y su propia silla, con dinero;
--   · NO las sillas que se alquilan: el negocio de quien renta es suyo, igual
--     que en turno_estadisticas_negocio. El cliente sale en la lista (se unió
--     al local), pero lo que hizo con el inquilino no se le cuenta al casero.
--
-- Y una columna que la ficha calculaba a mano con el historial: con quién se
-- corta normalmente (`barbero`), el más repetido de esas visitas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.turno_clientes_del_local_admin(p_negocio uuid)
returns table(cliente_id uuid, nombre text, telefono text,
              visitas int, total numeric, ultima date, desde date, barbero text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.turno_uid() is null then
    raise exception 'no autenticado';
  end if;
  -- En positivo: si no consta que administra, no se abre.
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;

  return query
  with v as (
    -- Las visitas de las sillas que manda: la suya y las que no son autónomas.
    select h.cliente_id, h.fecha, h.precio_cobrado, pr.usuario_id as barbero_id
      from turno_historial_visitas h
      join turno_perfiles pr on pr.id = h.perfil_id
     where h.negocio_id = p_negocio
       and (pr.usuario_id = public.turno_uid()
            or not public.turno_perfil_autonomo(pr.id))
  ),
  agg as (
    select v.cliente_id,
           count(*)::int                              as visitas,
           coalesce(sum(v.precio_cobrado), 0)::numeric as total,
           max(v.fecha)                               as ultima
      from v group by v.cliente_id
  ),
  fav as (
    select distinct on (x.cliente_id) x.cliente_id, x.barbero_id
      from (select v.cliente_id, v.barbero_id, count(*) as n, max(v.fecha) as ult
              from v group by v.cliente_id, v.barbero_id) x
     order by x.cliente_id, x.n desc, x.ult desc
  )
  select u.id, u.nombre, u.telefono,
         coalesce(a.visitas, 0), coalesce(a.total, 0::numeric), a.ultima,
         m.created_at::date,
         ub.nombre
    from turno_membresias m
    join turno_usuarios u on u.id = m.usuario_id
    left join agg a on a.cliente_id = u.id
    left join fav f on f.cliente_id = u.id
    left join turno_usuarios ub on ub.id = f.barbero_id
   where m.negocio_id = p_negocio
     and m.rol = 'cliente'
     and m.activo
     and u.auth_id is not null
   order by a.ultima desc nulls last, m.created_at desc;
end $$;

revoke execute on function public.turno_clientes_del_local_admin(uuid) from public, anon;
grant  execute on function public.turno_clientes_del_local_admin(uuid) to authenticated;
