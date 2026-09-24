-- EL ESTADO TIENE QUE DECIR TAMBIÉN POR DÓNDE
--
-- Deuda de la migración 70, encontrada al ir a adaptar la interfaz a los modos.
-- turno_estado_barbero devuelve una columna `acepta_citas` que se calculaba así:
--
--     v_decision <> 'inactivo'
--
-- Es decir, solo miraba el estado. En cuanto existió modo_atencion esa columna
-- pasó a mentir: un barbero 'solo_fila' —que no acepta ni una cita— seguía
-- diciendo `acepta_citas = true`. Nadie la consumía todavía en la app, así que
-- no rompió nada visible; pero una función que devuelve un dato falso es una
-- trampa esperando a que alguien lo use, y la interfaz que hay que adaptar
-- ahora es exactamente quien lo iba a usar.
--
-- Se añade `acepta_fila` y `modo`, para que la pantalla del barbero tenga las
-- dos respuestas de una llamada que ya hacía. Se responden delegando en
-- turno_perfil_acepta, y no repitiendo la lógica aquí: dos sitios calculando lo
-- mismo es la forma de que un día digan cosas distintas. Se le pasa una fecha
-- FUTURA para preguntar por la agenda —hoy podría estar en descanso, que cierra
-- la fila pero no la agenda— y null para preguntar por la fila de ahora.
--
-- LO QUE NO CAMBIA, y conviene dejarlo escrito porque es contraintuitivo: un
-- barbero 'solo_citas' PUEDE TENER FILA. turno_cita_a_cola_prioritaria mete en
-- la cola a quien no llegó a su cita, con prioridad 1, y no consulta el modo —
-- correctamente, porque esa persona ya tenía hora y lo que se le está dando es
-- una segunda oportunidad, no una vía de entrada. Así que la interfaz NO debe
-- esconder la fila en ese modo: escondería clientes de verdad.

drop function if exists turno_estado_barbero(uuid);

create function turno_estado_barbero(p_perfil uuid)
returns table(
  estado text,
  acepta boolean,          -- ¿entra gente a su fila AHORA?
  cliente text,            -- quién está en la silla (solo para el local)
  hasta time without time zone,
  en_cola integer,
  acepta_citas boolean,    -- ¿se le puede reservar hora?
  acepta_fila boolean,     -- ¿se puede uno meter en su fila desde el teléfono?
  modo text                -- ambos | solo_citas | solo_fila
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
  v_staff boolean; v_modo text;
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

  select u.nombre into v_cliente
    from turno_cola q left join turno_usuarios u on u.id = q.cliente_id
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
    -- Mañana, no hoy: el descanso cierra la fila de hoy pero deja la agenda
    -- abierta, y lo que se pregunta aquí es si se le puede reservar.
    public.turno_perfil_acepta(p_perfil, (v_ahora + interval '1 day')::date),
    public.turno_perfil_acepta(p_perfil, null),
    v_modo;
end $$;

grant execute on function turno_estado_barbero(uuid) to authenticated;
revoke execute on function turno_estado_barbero(uuid) from public, anon;
