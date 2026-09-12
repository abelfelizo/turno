-- ¿A QUÉ HORA QUEDA LIBRE ESA SILLA?
--
-- Pedido desde el teléfono: el estado del barbero debería decir cuándo empezó,
-- cuánto lleva, cuánto le falta y a qué hora termina. Y no es adorno: es la
-- única forma de contestar la pregunta que se hacen los tres —barbero, dueño y
-- cliente— mirando la misma silla, que es "¿a qué hora le toca al siguiente?".
--
-- Los datos ya estaban todos en la base y no salía ninguno. El turno sentado
-- guarda `atendiendo_at`, el servicio guarda `duracion_min`, y turno_min_ocupada
-- ya calculaba los minutos que faltan para el ETA de la fila. Lo que no existía
-- era la forma de PREGUNTARLO: turno_estado_barbero devolvía "atendiendo" y el
-- nombre del cliente, y el resto se quedaba dentro.
--
-- Dos columnas, que es lo mínimo del que se deduce todo lo demás:
--
--   desde        cuándo se sentó   -> hora de inicio, y restando, lo que lleva
--   fin_estimado cuándo debería terminar -> lo que falta, y la hora de salida
--
-- Se calculan en el servidor y no en la app A PROPÓSITO: la hora que importa es
-- la del local, y tres pantallas restando por su cuenta con el reloj de tres
-- teléfonos es la forma segura de que digan tres cosas distintas.
--
-- fin_estimado sale de la duración del servicio, así que es una ESTIMACIÓN y no
-- una promesa: si el barbero se pasa, la hora queda atrás y eso mismo es la
-- señal de que ese corte está tardando más de la cuenta.

drop function if exists turno_estado_barbero(uuid);

create function turno_estado_barbero(p_perfil uuid)
returns table (
  estado text, acepta boolean, cliente text, hasta time, en_cola int,
  acepta_citas boolean, acepta_fila boolean, modo text,
  fila_abierta boolean, fila_motivo text,
  desde timestamptz, fin_estimado timestamptz
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
  v_staff boolean; v_modo text; v_motivo text;
  v_desde timestamptz; v_fin timestamptz;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_en_mis_negocios(p_perfil) then
    raise exception 'ese barbero no es de un local tuyo';
  end if;
  v_staff := public.turno_es_mi_perfil(p_perfil) or public.turno_perfil_admin(p_perfil);

  select p.negocio_id, coalesce(p.estado_actual, 'disponible'),
         coalesce(n.tz, 'America/Santo_Domingo'), coalesce(p.modo_atencion, 'ambos')
    into v_neg, v_decision, v_tz, v_modo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then return; end if;
  v_ahora := (now() at time zone v_tz);

  -- El que está en la silla, con sus dos relojes. `atendiendo_at` es cuándo se
  -- sentó de verdad; si falta (turnos viejos) se cae al momento de la llamada.
  select u.nombre,
         coalesce(q.atendiendo_at, q.llamado_at, q.created_at),
         coalesce(q.atendiendo_at, q.llamado_at, q.created_at)
           + make_interval(mins => coalesce(s.duracion_min, 30))
    into v_cliente, v_desde, v_fin
    from turno_cola q
    left join turno_usuarios u on u.id = q.cliente_id
    left join turno_servicios s on s.id = q.servicio_id
   where q.perfil_id = p_perfil and q.estado in ('llamado','en_camino','atendiendo')
   order by q.llamado_at desc nulls last limit 1;
  if v_cliente is not null then v_ocupado := true; end if;

  select b.hora_fin into v_hasta
    from turno_bloqueos b
   where b.perfil_id = p_perfil and b.fecha = v_ahora::date
     and b.hora_inicio <= v_ahora::time and b.hora_fin > v_ahora::time
   order by b.hora_fin desc limit 1;
  if v_hasta is not null then v_ocupado := true; end if;

  select count(*)::int into v_cola
    from turno_cola q
   where q.perfil_id = p_perfil and q.estado = 'en_fila';

  v_motivo := public.turno_fila_abierta(p_perfil, v_neg);

  return query select
    case
      when v_decision = 'inactivo' then 'inactivo'
      when v_decision = 'descanso' then 'descanso'
      when v_ocupado then 'atendiendo'
      else 'libre'
    end,
    v_decision not in ('inactivo', 'descanso'),
    case when v_staff then v_cliente else null end,
    v_hasta,
    coalesce(v_cola, 0),
    public.turno_perfil_acepta(p_perfil, (v_ahora + interval '1 day')::date),
    public.turno_perfil_acepta(p_perfil, null),
    v_modo,
    v_motivo is null,
    v_motivo,
    -- Los relojes de la silla NO son información privada: la hora a la que
    -- queda libre es justo lo que el cliente necesita para decidir si espera.
    -- El nombre de quien está sentado sigue siendo solo para el equipo.
    v_desde,
    v_fin;
end $$;

grant execute on function turno_estado_barbero(uuid) to authenticated;

drop function if exists turno_estado_local(uuid);

create function turno_estado_local(p_negocio uuid)
returns table (
  perfil_id uuid, barbero text, tipo_servicio text, estado text, acepta boolean,
  cliente text, hasta time, en_cola int,
  acepta_citas boolean, acepta_fila boolean, modo text,
  fila_abierta boolean, fila_motivo text,
  desde timestamptz, fin_estimado timestamptz
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  return query
  select p.id, u.nombre, p.tipo_servicio, e.estado, e.acepta, e.cliente, e.hasta, e.en_cola,
         e.acepta_citas, e.acepta_fila, e.modo, e.fila_abierta, e.fila_motivo,
         e.desde, e.fin_estimado
    from turno_perfiles p
    join turno_usuarios u on u.id = p.usuario_id
    cross join lateral public.turno_estado_barbero(p.id) e
   where p.negocio_id = p_negocio and p.activo and p.aprobado
   order by e.acepta desc, e.en_cola asc, u.nombre;
end $$;

comment on function turno_estado_local is
  'El local silla por silla: estado, cola, modo, si su fila admite gente ahora '
  'y a qué hora debería quedar libre. Lo leen los tres paneles.';

grant execute on function turno_estado_local(uuid) to authenticated;
