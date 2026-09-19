-- LA CARTERA ES DE QUIEN PUEDE VOLVER
--
-- Del piloto, mirando la pantalla de Clientes: "el botón de whatsapp para
-- walk-in no es necesario, ni siquiera deben estar ahí aquellos clientes sin
-- perfil".
--
-- Tiene razón, y la causa está aquí abajo. turno_registrar_fisico —el barbero
-- apuntando a quien tiene delante— crea una fila en turno_usuarios SIN auth_id
-- y le añade membresía de cliente:
--
--     insert into turno_usuarios(nombre, telefono, tipo_usuario) ...
--     insert into turno_membresias(usuario_id, negocio_id, 'cliente', true)
--
-- Como turno_clientes_del_local parte de las membresías, cada walk-in acababa
-- en la cartera del local. Y con el teléfono en '-' cuando el barbero no lo
-- pidió, que es casi siempre: no vas a pedirle el número a alguien que solo
-- quiere sentarse.
--
-- Esas filas no son clientes en ningún sentido útil. No pueden entrar a la app,
-- no reciben avisos, no reservan y no vuelven solas — son el apunte de que
-- alguien se sentó un martes. Mezcladas con la gente que sí se unió con el
-- código, ensucian la única lista que sirve para trabajar la clientela: la de
-- a quién puedes escribir.
--
-- Lo que NO cambia: sus visitas siguen contando. El dinero y las estadísticas
-- salen de turno_historial_visitas, que no se toca. Lo que desaparece es una
-- ficha de contacto de alguien a quien no se puede contactar.
--
-- El filtro es `auth_id is not null`, y no `telefono <> '-'`, a propósito: lo
-- que decide no es si dejó un número, es si existe como usuario. Alguien que se
-- unió de verdad y no puso teléfono sigue siendo su cliente.

create or replace function turno_clientes_del_local(p_negocio uuid)
returns table(
  cliente_id uuid,
  nombre text,
  telefono text,
  visitas int,        -- CONTIGO, no en el local (ver abajo)
  total numeric,
  ultima date,
  desde date
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
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
    -- OJO al leer esto: las visitas se cuentan solo con MIS perfiles, así que
    -- `visitas = 0` significa "nunca ha venido CONMIGO", no "nunca ha venido".
    -- La pantalla decía "Nunca ha venido" y justo debajo enseñaba el historial
    -- del local con el nombre de otro barbero. El dato estaba bien; la etiqueta
    -- mentía. Se arregla en la app, pero se anota aquí porque es donde nace.
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
     -- Solo quien puede volver por su cuenta. Los walk-ins que apunta el
     -- barbero no tienen auth_id: no son una ficha de contacto, son un apunte.
     and u.auth_id is not null
   order by v.ultima desc nulls last, m.created_at desc;
end $$;

grant execute on function turno_clientes_del_local(uuid) to authenticated;
