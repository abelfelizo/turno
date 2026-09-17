-- LA CARTERA DEL LOCAL NO SE LA LLEVA EL BARBERO
--
-- Regla de producto, dicha en el chat: «si son empleados no son sus clientes,
-- son del negocio; si se va no se los lleva».
--
-- La parte de QUIÉN es cliente de quién ya estaba bien: un cliente se une a un
-- LOCAL (`turno_membresias`), no a una persona, y el barbero de confianza
-- apunta a la SILLA, que muere cuando el barbero se va. Lo que estaba abierto
-- era otra cosa, y es la que de verdad se puede uno llevar:
--
--   `turno_clientes_del_local` le devolvía a CUALQUIER miembro la agenda
--   telefónica entera del local. Un empleado abría su pestaña «Clientes» y veía
--   nombre y teléfono de todos los clientes de la barbería, incluidos los que
--   nunca había atendido.
--
-- ── POR QUÉ SE CIERRA ESTO Y NO LA PUERTA DE AL LADO ────────────────────────
-- Lo que se evaluó primero fue impedir que un empleado se monte su propio
-- espacio desde la misma cuenta. Se descartó, y conviene dejar escrito por qué:
--
--   · No impide nada. Se da de alta con otro correo en treinta segundos.
--   · Y deja ciego al sistema: con una sola cuenta la app SABE que esa persona
--     trabaja en los dos sitios; obligándole al segundo correo son dos
--     desconocidos. Cerrar esa puerta no reduce el riesgo, lo esconde.
--   · Y choca con lo que el producto defiende desde la 92: si el local puede
--     dejar de emplearlo cuando quiera, quitarle a él la salida desequilibra
--     el trato.
--
-- El riesgo no estaba en la cuenta. Estaba en lo que se puede llevar.
--
-- ── LA REGLA ────────────────────────────────────────────────────────────────
--   · Quien ADMINISTRA el local ve la lista entera: son sus clientes.
--   · Un barbero —empleado o de alquiler, da igual— ve solo a los que ÉL ha
--     atendido en ESE local.
--
-- Al barbero autónomo no le cambia nada: en su propio espacio él administra, y
-- la lista entera sigue siendo suya.
--
-- Y las cuentas se atan también al local. Antes `visitas` y `total` sumaban lo
-- que el que llama le había cobrado a ese cliente en CUALQUIER sitio; en una
-- pantalla que se titula con el nombre de un local, el único número que
-- significa algo es el de ese local.

create or replace function public.turno_clientes_del_local(p_negocio uuid)
returns table(cliente_id uuid, nombre text, telefono text,
              visitas int, total numeric, ultima date, desde date)
language plpgsql stable security definer set search_path = public as $$
declare v_manda boolean;
begin
  if public.turno_uid() is null then
    raise exception 'no autenticado';
  end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  -- El que manda en el local ve la cartera entera. Cualquier otro, solo la
  -- suya. Se pregunta en positivo: si no consta que administra, no se abre.
  v_manda := p_negocio in (select public.turno_negocios_admin());

  return query
  select u.id, u.nombre, u.telefono,
         coalesce(v.visitas, 0)::int,
         coalesce(v.total, 0)::numeric,
         v.ultima,
         m.created_at::date
    from turno_membresias m
    join turno_usuarios u on u.id = m.usuario_id
    left join lateral (
      select count(*)::int as visitas,
             coalesce(sum(h.precio_cobrado), 0)::numeric as total,
             max(h.fecha) as ultima
        from turno_historial_visitas h
       where h.cliente_id = u.id
         and h.negocio_id = p_negocio
         and h.perfil_id in (select pr.id from turno_perfiles pr
                              where pr.usuario_id = public.turno_uid())
    ) v on true
   where m.negocio_id = p_negocio
     and m.rol = 'cliente'
     and m.activo
     and u.auth_id is not null
     -- Aquí está el cierre: sin ser quien administra, solo salen los que has
     -- atendido tú. El teléfono de los demás deja de estar a un toque.
     and (v_manda or coalesce(v.visitas, 0) > 0)
   order by v.ultima desc nulls last, m.created_at desc;
end $$;

revoke execute on function public.turno_clientes_del_local(uuid) from public, anon;
grant  execute on function public.turno_clientes_del_local(uuid) to authenticated;
