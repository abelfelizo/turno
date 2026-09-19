-- NEGARSE EN VOZ ALTA, NO DEVOLVER VACÍO
--
-- Encontrado en la comprobación previa a publicar la primera OTA buena. No es
-- una fuga: es la cerradura que falta detrás de una que sí está echada.
--
-- turno_clientes_del_local (migración 59) pone su portero en el WHERE:
--
--     and p_negocio in (select public.turno_mis_negocios())
--
-- Ejecutada como `anon` eso da cero filas, así que hoy no se escapa nada. Pero
-- la diferencia entre "se niega" y "devuelve vacío" importa por lo que pasa
-- MAÑANA: el portero es una línea más de una consulta de siete tablas, y basta
-- reordenar un join o añadir un OR para desactivarlo sin que nada falle, sin
-- error en ningún log y sin que ninguna prueba se ponga roja. Un `raise` no se
-- desactiva por accidente al tocar otra cosa.
--
-- Es el mismo patrón del resto del PR —una regla que solo vive en un sitio
-- blando no es una regla— aplicado a la capa de abajo. Las otras tres funciones
-- nuevas (60, 61, 62) ya se niegan porque su portero es un `raise` propio; esta
-- se quedó atrás por ser `language sql`, que no puede lanzar.
--
-- Se pasa a plpgsql para poder negarse, y se mantiene `stable` para no perder
-- el cacheo del planificador dentro de la misma consulta.

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
language plpgsql stable security definer set search_path to 'public' as $$
begin
  -- El portero, ahora explícito y en su propia línea. Antes vivía dentro del
  -- WHERE de abajo, donde no se distinguía de un filtro cualquiera.
  if public.turno_uid() is null then
    raise exception 'no autenticado';
  end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

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
         and h.perfil_id in (select pr.id from turno_perfiles pr
                              where pr.usuario_id = public.turno_uid())
    ) v on true
   where m.negocio_id = p_negocio
     and m.rol = 'cliente'
     and m.activo
   order by v.ultima desc nulls last, m.created_at desc;
end $$;

grant execute on function turno_clientes_del_local(uuid) to authenticated;
