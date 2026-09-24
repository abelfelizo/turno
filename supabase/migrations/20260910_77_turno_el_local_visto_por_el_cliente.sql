-- EL LOCAL, VISTO POR EL CLIENTE
--
-- turno_estado_local existe desde hace tiempo y devuelve, silla por silla, el
-- estado deducido: libre, atendiendo, descanso, inactivo, y cuánta gente
-- espera. Lo usaba solo el panel del dueño.
--
-- Al cliente le hace falta lo mismo y le falta lo de siempre: si PUEDE ENTRAR
-- ahora y, si no, por qué. La migración 74 puso esa respuesta en
-- turno_fila_abierta y la sacó por turno_estado_barbero, pero turno_estado_local
-- selecciona columnas una a una, así que se quedó fuera. Es el mismo patrón que
-- vengo persiguiendo todo el PR —la regla existe pero no llega a la pantalla—
-- solo que aquí en su versión más tonta: una lista de columnas desactualizada.
--
-- Se añaden las tres que ya calcula la función de abajo: el modo (para poder
-- decir "solo con cita" en vez de esconder al barbero), si su fila admite gente
-- ahora, y el motivo exacto cuando no. Con esto el cliente puede tener el mismo
-- cuadro de estado que el barbero y el dueño, y las tres pantallas cuentan lo
-- mismo porque leen lo mismo.

drop function if exists turno_estado_local(uuid);

create function turno_estado_local(p_negocio uuid)
returns table (
  perfil_id uuid, barbero text, tipo_servicio text, estado text, acepta boolean,
  cliente text, hasta time, en_cola int,
  acepta_citas boolean, acepta_fila boolean, modo text,
  fila_abierta boolean, fila_motivo text
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  return query
  select p.id, u.nombre, p.tipo_servicio, e.estado, e.acepta, e.cliente, e.hasta, e.en_cola,
         e.acepta_citas, e.acepta_fila, e.modo, e.fila_abierta, e.fila_motivo
    from turno_perfiles p
    join turno_usuarios u on u.id = p.usuario_id
    cross join lateral public.turno_estado_barbero(p.id) e
   where p.negocio_id = p_negocio and p.activo and p.aprobado
   order by e.acepta desc, e.en_cola asc, u.nombre;
end $$;

comment on function turno_estado_local is
  'El local silla por silla: estado, cola, modo y si su fila admite gente ahora '
  'con el motivo cuando no. Lo leen los tres paneles —cliente, barbero y '
  'dueño— para que los tres cuenten lo mismo.';

grant execute on function turno_estado_local(uuid) to authenticated;
