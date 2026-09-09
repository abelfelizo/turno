-- LOS CLIENTES QUE SE UNIERON, NO SOLO LOS QUE YA VINIERON
--
-- Pedido del piloto: "la pantalla clientes… que muestre el listado de los que se
-- han unido y con algún filtro o sistema de ordenamiento".
--
-- Ahí había una diferencia que no era de pantalla sino de origen de los datos.
-- `turno_mis_clientes` se construye ENTERA desde turno_historial_visitas:
--
--   from turno_historial_visitas h join turno_usuarios u on u.id = h.cliente_id
--
-- O sea que alguien que entró al local con el código y todavía no ha venido no
-- aparecía en ningún sitio de la app. Y son justo los que más falta hace ver:
-- descargaron la app, se unieron, y nadie les ha dicho nada. Es la lista de
-- gente a la que llamar, y estaba invisible.
--
-- Esta función parte de la MEMBRESÍA —quién se unió— y le pega las visitas por
-- la izquierda, así que quien tiene cero sale igual, con visitas 0 y sin última
-- fecha. Se añade `desde`, la fecha en que se unió, que es lo único que se sabe
-- de quien aún no ha pisado el local.
--
-- Las visitas que cuenta son las de QUIEN PREGUNTA, no las del local: en una
-- barbería de asientos alquilados cada barbero tiene su propia clientela, y
-- mezclarlas le daría al uno los números del otro. La lista de personas es del
-- local; los números son tuyos.

create or replace function turno_clientes_del_local(p_negocio uuid)
returns table(
  cliente_id uuid,
  nombre text,
  telefono text,
  visitas int,
  total numeric,
  ultima date,
  desde date          -- cuándo se unió al local
)
language sql stable security definer set search_path to 'public' as $$
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
         and h.perfil_id in (select pr.id from turno_perfiles pr
                              where pr.usuario_id = public.turno_uid())
    ) v on true
   where m.negocio_id = p_negocio
     and m.rol = 'cliente'
     and m.activo
     and p_negocio in (select public.turno_mis_negocios())
   order by v.ultima desc nulls last, m.created_at desc
$$;

grant execute on function turno_clientes_del_local(uuid) to authenticated;
