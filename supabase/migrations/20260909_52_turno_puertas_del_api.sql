-- LA LISTA DE CLIENTES ESTABA ABIERTA A CUALQUIERA
--
-- Salió revisando qué controla cada rol. Las políticas RLS y el motor de la
-- fila estaban bien; el agujero estaba en las funciones SECURITY DEFINER, que
-- por definición se saltan RLS y por tanto tienen que comprobar por su cuenta
-- quién llama. Cuatro no comprobaban nada.
--
-- Probado contra la base real, no leído: un usuario recién creado, sin una sola
-- membresía, y también `anon` —la llave que viaja DENTRO del APK, o sea
-- cualquiera que lo instale— obtuvieron esto:
--
--   clientes_por_recuperar(perfil ajeno) -> 2 clientes CON TELÉFONO
--                                           ejemplo: Pedro Martínez / +1809…
--   como ANON, cerrar_olvidados()        -> EJECUTÓ
--
-- Es decir: la cartera de clientes de un barbero —nombre y teléfono, lo más
-- valioso que tiene una barbería— se la llevaba quien pasara un uuid de perfil.
-- Y dos funciones de mantenimiento que cierran turnos y citas de TODOS los
-- locales estaban al alcance de un anónimo.
--
-- Mismo patrón que veníamos arrastrando —la puerta cerrada en la pantalla y
-- abierta en el API— pero al revés de las veces anteriores: aquí la pantalla
-- nunca fue el problema. La app siempre llamó con el perfil propio. El agujero
-- solo existía para quien no usara la app.

-- ── 1. LA CARTERA ES DE QUIEN LA TRABAJA ────────────────────────────────────
-- Tuya, o del dueño del local si eres su empleado. De nadie más.
create or replace function turno_clientes_por_recuperar(p_perfil uuid)
returns table(cliente_id uuid, nombre text, telefono text, ultima date, dias integer)
language plpgsql security definer set search_path to 'public' as $$
declare v_usuario uuid; v_dias int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (public.turno_es_mi_perfil(p_perfil) or public.turno_perfil_admin(p_perfil)) then
    raise exception 'esa cartera de clientes no es tuya';
  end if;

  select usuario_id, coalesce(revisita_dias, 30) into v_usuario, v_dias
    from turno_perfiles where id = p_perfil;
  if v_usuario is null then return; end if;
  return query
    with u as (
      select hv.cliente_id, max(hv.fecha) as ultima
        from turno_historial_visitas hv
       where hv.perfil_id in (select id from turno_perfiles where usuario_id = v_usuario)
       group by hv.cliente_id
    )
    select u.cliente_id, us.nombre, us.telefono, u.ultima, (current_date - u.ultima)::int
      from u join turno_usuarios us on us.id = u.cliente_id
     where (current_date - u.ultima) >= v_dias
     order by u.ultima asc;
end $$;

-- ── 2. QUIÉN ESTÁ EN LA SILLA ES INFORMACIÓN DEL LOCAL ──────────────────────
-- El estado en sí (libre / atendiendo / en_cola) es justo lo que el cliente
-- necesita para elegir barbero, así que sigue abierto a quien pertenezca al
-- local. El NOMBRE de quien está sentado, no: eso solo lo ve el propio barbero
-- o el dueño. Se enmascara en vez de negar la llamada entera, porque negarla
-- rompería el selector de barbero del cliente para arreglar un dato que sobra.
create or replace function turno_estado_barbero(p_perfil uuid)
returns table(
  estado text, acepta boolean, cliente text, hasta time, en_cola int
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
  v_staff boolean;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_en_mis_negocios(p_perfil) then
    raise exception 'ese barbero no es de un local tuyo';
  end if;
  v_staff := public.turno_es_mi_perfil(p_perfil) or public.turno_perfil_admin(p_perfil);

  select p.negocio_id, coalesce(p.estado_actual, 'disponible'),
         coalesce(n.tz, 'America/Santo_Domingo')
    into v_neg, v_decision, v_tz
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
    v_hasta, coalesce(v_cola, 0);
end $$;

-- ── 3. EL ETA ES DE TU TURNO, NO DE UNO CUALQUIERA ──────────────────────────
-- Devuelve NULL en vez de fallar: un ETA es una pista en pantalla, y romper la
-- vista del cliente por un turno que no le toca sería peor que no decir nada.
create or replace function turno_eta(p_cola uuid)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_cola; v_min int; v_gap int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  if not (v_row.cliente_id = public.turno_uid()
          or v_row.negocio_id in (select public.turno_mis_negocios())) then
    return null;
  end if;

  select coalesce(min(tiempo_entre_clientes), 10) into v_gap
    from turno_horarios where perfil_id = v_row.perfil_id and activo;
  v_gap := coalesce(v_gap, 10);
  select coalesce(sum(s.duracion_min), 0) + count(*) * v_gap into v_min
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));
  return coalesce(v_min, 0) + public.turno_min_ocupada(v_row.perfil_id);
end $$;

-- ── 4. LAS FUNCIONES DE MANTENIMIENTO SON DEL CRON ──────────────────────────
-- Cierran turnos y citas de TODOS los locales. Solo las llama
-- turno_expirar_llamados, que es SECURITY DEFINER y corre como su dueño, así
-- que quitarles el permiso al público no las afecta. turno_expirar_llamados ya
-- estaba bien; estas dos se colaron con el GRANT por defecto.
revoke all on function turno_cerrar_olvidados()    from public, anon, authenticated;
revoke all on function turno_cerrar_citas_viejas() from public, anon, authenticated;

-- Ayudante interno del ETA: nadie lo llama desde fuera.
revoke all on function turno_min_ocupada(uuid) from public, anon;

-- Dos lecturas de configuración (meta y premio de la tarjeta, minutos de las
-- reglas) que un anónimo podía consultar de cualquier local. No hay datos
-- personales ahí, pero tampoco hay motivo para que estén abiertas.
--
-- OJO con el alcance de estos revokes: los ayudantes que aparecen dentro de las
-- POLÍTICAS RLS —turno_es_mi_perfil, turno_perfil_admin, turno_perfil_autonomo,
-- turno_perfil_en_mis_negocios, turno_mis_negocios, turno_negocios_admin— se
-- evalúan con el rol de quien consulta. Quitarles el permiso a anon no lo
-- dejaría fuera: haría que la política reventara con "permission denied" en vez
-- de devolver false. Por eso se quedan como están. Estas dos no salen en
-- ninguna política, y dentro de otras funciones SECURITY DEFINER se llaman como
-- el dueño de la función, así que el revoke no las afecta.
revoke all on function turno_fidelidad(uuid, uuid)          from public, anon;
revoke all on function turno_regla_tiempo(uuid, uuid, text)  from public, anon;
grant execute on function turno_fidelidad(uuid, uuid)         to authenticated;
grant execute on function turno_regla_tiempo(uuid, uuid, text) to authenticated;

grant execute on function turno_clientes_por_recuperar(uuid) to authenticated;
grant execute on function turno_estado_barbero(uuid)         to authenticated;
grant execute on function turno_eta(uuid)                    to authenticated;
