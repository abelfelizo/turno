-- EL ESTADO DEL BARBERO SE DEDUCE, NO SE MANTIENE A MANO
--
-- Reportado en el piloto: "hay unas opciones de estado del barbero que no hacen
-- nada" y "debe haber un panel de estado que diga si el barbero está libre, si
-- está atendiendo un cliente, y si hay cola y quiénes".
--
-- Lo que pasaba de verdad es peor que "no hacen nada":
--
--   · turno_perfiles.estado_actual SÍ se leía — las pantallas del cliente solo
--     muestran barberos con estado_actual = 'disponible'. Marcar "en descanso"
--     te BORRA de la lista, en silencio, y nada te devuelve nunca a
--     'disponible'. Un barbero que lo tocó una vez desaparece para siempre.
--   · Y a la vez el campo no reflejaba la realidad: atender a alguien sin cita
--     o tener un cliente en la silla no lo cambiaba, así que el cliente veía
--     "disponible" a alguien que llevaba media hora ocupado.
--
-- Un estado que hay que acordarse de actualizar siempre miente: el barbero está
-- cortando pelo, no tocando la app. Así que se parte en dos ideas distintas que
-- estaban mezcladas en un solo campo:
--
--   ¿ACEPTA CLIENTES?  → decisión del barbero. Eso sí es estado_actual.
--   ¿ESTÁ OCUPADO?     → hecho observable. Se deduce de la silla y los bloqueos.
--
-- Nadie tiene que mantener el segundo, y el primero deja de significar dos
-- cosas a la vez.

create or replace function turno_estado_barbero(p_perfil uuid)
returns table(
  estado text,           -- 'libre' | 'atendiendo' | 'descanso' | 'inactivo'
  acepta boolean,        -- si el cliente puede pedirle turno
  cliente text,          -- a quién atiende ahora, si atiende
  hasta time,            -- hasta cuándo está tomada la silla, si se sabe
  en_cola int            -- cuántos esperan por él
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
begin
  select p.negocio_id, coalesce(p.estado_actual, 'disponible'),
         coalesce(n.tz, 'America/Santo_Domingo')
    into v_neg, v_decision, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then return; end if;
  v_ahora := (now() at time zone v_tz);

  -- Cliente en la silla (turno de la app).
  select u.nombre into v_cliente
    from turno_cola q left join turno_usuarios u on u.id = q.cliente_id
   where q.perfil_id = p_perfil and q.estado in ('llamado','en_camino','atendiendo')
   order by q.llamado_at desc nulls last limit 1;
  if v_cliente is not null then v_ocupado := true; end if;

  -- Silla tomada por un bloqueo vigente: así es como entra el cliente sin cita.
  select b.hora_fin into v_hasta
    from turno_bloqueos b
   where b.perfil_id = p_perfil and b.fecha = v_ahora::date
     and b.hora_inicio <= v_ahora::time and b.hora_fin > v_ahora::time
   order by b.hora_fin desc limit 1;
  if v_hasta is not null then v_ocupado := true; end if;

  select count(*)::int into v_cola
    from turno_cola q
   where q.perfil_id = p_perfil and q.estado = 'en_fila';

  return query select
    case
      when v_decision = 'inactivo' then 'inactivo'
      when v_decision = 'descanso' then 'descanso'
      when v_ocupado then 'atendiendo'
      else 'libre'
    end,
    -- Ocupado NO es lo mismo que cerrado: quien está cortando sigue aceptando
    -- gente en su fila, que es justo para lo que existe la fila.
    v_decision not in ('inactivo', 'descanso'),
    v_cliente, v_hasta, coalesce(v_cola, 0);
end $$;

-- El mismo estado para todo el local, de una sola consulta: es lo que necesita
-- el panel del dueño y el selector de barbero del cliente.
create or replace function turno_estado_local(p_negocio uuid)
returns table(
  perfil_id uuid, barbero text, tipo_servicio text,
  estado text, acepta boolean, cliente text, hasta time, en_cola int
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  return query
  select p.id, u.nombre, p.tipo_servicio, e.estado, e.acepta, e.cliente, e.hasta, e.en_cola
    from turno_perfiles p
    join turno_usuarios u on u.id = p.usuario_id
    cross join lateral public.turno_estado_barbero(p.id) e
   where p.negocio_id = p_negocio and p.activo and p.aprobado
   order by e.acepta desc, e.en_cola asc, u.nombre;
end $$;

grant execute on function turno_estado_barbero(uuid) to authenticated;
grant execute on function turno_estado_local(uuid)   to authenticated;
