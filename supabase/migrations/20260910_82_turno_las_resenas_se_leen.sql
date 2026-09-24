-- LAS RESEÑAS SE ESCRIBEN Y NO SE LEEN EN NINGUNA PARTE
--
-- Pedido desde el teléfono: el dueño y los clientes deberían poder ver las
-- calificaciones de cada barbero, con promedio y detalle.
--
-- La tabla existe desde el principio y el cliente puntúa desde su historial.
-- Lo único que salía de ahí era un promedio con estrellitas en la lista de
-- barberos —"★ 4.7 (12)"— y nada más: los comentarios que la gente se tomó el
-- trabajo de escribir no se leían NUNCA, ni el barbero calificado, ni el dueño,
-- ni el cliente que quiere saber por qué ese tiene 4.7.
--
-- Una reseña que nadie puede leer no es una reseña, es un formulario.
--
-- turno_resenas_de trae el detalle. Dos decisiones sobre qué devuelve:
--
--   · EL AUTOR, SOLO EL NOMBRE DE PILA. Las reseñas las va a leer cualquier
--     cliente del local, y el apellido y el teléfono no hacen falta para creerse
--     un comentario. "Juan" basta; "Juan Pérez, 809-555-1234" es la agenda del
--     local puesta a disposición de cualquiera que se una con el código.
--   · LA FECHA SÍ. Un 5 de hace dos años y uno de la semana pasada no dicen lo
--     mismo, y sin fecha no hay forma de distinguirlos.

create or replace function turno_resenas_de(p_perfil uuid, p_limite int default 20)
returns table (id uuid, rating int, comentario text, cuando timestamptz, autor text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_en_mis_negocios(p_perfil) then
    raise exception 'ese barbero no es de un local tuyo';
  end if;

  return query
  select r.id, r.rating::int, r.comentario, r.created_at,
         -- Nombre de pila y nada más. split_part con espacio devuelve el
         -- nombre entero cuando no hay apellido, que es lo que se quiere.
         nullif(split_part(coalesce(u.nombre, ''), ' ', 1), '')
    from turno_resenas r
    left join turno_usuarios u on u.id = r.cliente_id
   where r.perfil_id = p_perfil
   order by r.created_at desc
   limit greatest(1, least(coalesce(p_limite, 20), 100));
end $$;

comment on function turno_resenas_de is
  'Las reseñas de un barbero, con el nombre de pila de quien la escribió y la '
  'fecha. Las lee cualquiera del local: el propio barbero, el dueño y los '
  'clientes que están decidiendo con quién sentarse.';

grant execute on function turno_resenas_de(uuid, int) to authenticated;

-- El reparto de estrellas, que es lo que convierte un 4.7 en algo que se
-- entiende: no es lo mismo diez cincos y dos unos que doce cuatros.
create or replace function turno_resumen_resenas(p_perfil uuid)
returns table (promedio numeric, total int, cinco int, cuatro int, tres int, dos int, una int)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_en_mis_negocios(p_perfil) then
    raise exception 'ese barbero no es de un local tuyo';
  end if;

  return query
  select round(coalesce(avg(r.rating), 0)::numeric, 1),
         count(*)::int,
         count(*) filter (where r.rating = 5)::int,
         count(*) filter (where r.rating = 4)::int,
         count(*) filter (where r.rating = 3)::int,
         count(*) filter (where r.rating = 2)::int,
         count(*) filter (where r.rating = 1)::int
    from turno_resenas r
   where r.perfil_id = p_perfil;
end $$;

comment on function turno_resumen_resenas is
  'Promedio, total y cuántas de cada estrella. El reparto importa: no es lo '
  'mismo diez cincos y dos unos que doce cuatros, y el promedio los iguala.';

grant execute on function turno_resumen_resenas(uuid) to authenticated;
