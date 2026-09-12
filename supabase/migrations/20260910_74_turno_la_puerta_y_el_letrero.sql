-- LA PUERTA Y EL LETRERO TIENEN QUE DECIR LO MISMO
--
-- La migración 72 puso el horario a decidir quién entra a la fila, pero solo
-- dentro de turno_entrar_a_cola. El estado que LEE la pantalla —
-- turno_estado_barbero.acepta_fila, y el modo_atencion que lee la lista de
-- barberos— no se enteró. Reproducido contra la base antes de arreglarlo, con
-- un barbero cuyo horario de hoy es de 22:00 a 23:00, a las 07:08 de la mañana:
--
--   estado_barbero.acepta_fila = true
--   entrar_a_cola             -> 'ahora está cerrado: su fila abre de 22:00 a 23:00'
--
-- Es el patrón de siempre girado del revés: antes la regla vivía solo en la
-- interfaz, ahora vive solo en el servidor y la interfaz promete lo que la
-- puerta rechaza. Para el cliente las dos cosas son el mismo error: el botón
-- está encendido y al tocarlo da error.
--
-- LA REGLA SE MUDA A UNA SOLA FUNCIÓN. turno_fila_abierta responde "¿puede
-- alguien entrar a esta fila AHORA MISMO?" y devuelve el MOTIVO cuando no —
-- null significa abierta. La usan los dos lados:
--
--   · turno_entrar_a_cola  la usa para negarse, y lanza ese mismo motivo.
--   · turno_estado_barbero y turno_filas_abiertas la usan para que la pantalla
--     apague el botón ANTES, y pueda decir por qué.
--
-- Así el mensaje que ve el cliente en la tarjeta es literalmente el que le
-- daría la puerta. Una regla escrita dos veces se corrige una.
--
-- Ojo con lo que NO hace: acepta_fila se queda como está (modo y estado del
-- barbero), porque el panel del BARBERO está montado sobre eso. Su fila no deja
-- de existir a las 7 de la mañana, solo está cerrada; si acepta_fila se apagara
-- con el horario, al barbero le desaparecería media pantalla antes de abrir.

create or replace function turno_fila_abierta(p_perfil uuid, p_negocio uuid default null)
returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_dow int;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
  v_est text; v_modo text;
begin
  -- SIN BARBERO ELEGIDO ("cualquiera disponible"): abre si hay al menos una
  -- silla abierta ahora mismo. Sin negocio no hay nada que mirar.
  if p_perfil is null then
    if p_negocio is null then return null; end if;
    select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
    v_ahora := (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'));
    v_dow := extract(dow from v_ahora);
    select exists(
      select 1 from turno_perfiles p
        join turno_horarios h on h.perfil_id = p.id
       where p.negocio_id = p_negocio and p.activo and p.aprobado
         and h.dia_semana = v_dow and h.activo
         and v_ahora::time >= h.hora_inicio and v_ahora::time < h.hora_fin
         and public.turno_perfil_acepta(p.id, null)
    ) into v_abierto;
    if v_abierto then return null; end if;
    return 'ahora mismo no hay nadie abierto en el local';
  end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo'),
         coalesce(p.estado_actual, 'disponible'), coalesce(p.modo_atencion, 'ambos')
    into v_neg, v_tz, v_est, v_modo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil and p.activo and p.aprobado;
  if v_neg is null then return 'no está disponible'; end if;

  -- Primero lo que decidió el barbero, porque es lo que mejor se explica.
  --
  -- Los textos NO dicen "ese barbero": el mismo motivo sale por dos sitios —el
  -- error de la puerta y el letrero dentro de la tarjeta del barbero— y en la
  -- tarjeta hablar de él en tercera persona queda raro. Escritos así valen para
  -- los dos, que es la condición para que haya un solo texto.
  if not public.turno_perfil_acepta(p_perfil, null) then
    if v_est = 'inactivo' then return 'no está trabajando ahora mismo'; end if;
    if v_est = 'descanso' then return 'está en descanso'; end if;
    if v_modo = 'solo_citas' then return 'solo trabaja con cita'; end if;
    return 'no está tomando clientes ahora mismo';
  end if;

  -- Y después el reloj. Los textos son los de la migración 72 PALABRA POR
  -- PALABRA: son los que ya prueban horarios.test.sql y modo_atencion.test.sql,
  -- y ahora además son los que se enseñan en pantalla.
  v_ahora := (now() at time zone v_tz);
  v_dow := extract(dow from v_ahora);

  select exists(select 1 from turno_horarios where perfil_id = p_perfil) into v_tiene_horario;
  if not v_tiene_horario then
    return 'todavía no ha puesto su horario, así que su fila no está abierta';
  end if;

  select hora_inicio, hora_fin into v_ini, v_fin
    from turno_horarios
   where perfil_id = p_perfil and dia_semana = v_dow and activo
   order by hora_inicio limit 1;

  if v_ini is null then return 'hoy no trabaja: su fila abre los días que tiene marcados'; end if;
  if v_ahora::time < v_ini or v_ahora::time >= v_fin then
    return 'ahora está cerrado: su fila abre de ' || to_char(v_ini, 'HH24:MI')
        || ' a ' || to_char(v_fin, 'HH24:MI');
  end if;

  return null;
end $$;

comment on function turno_fila_abierta is
  'MOTIVO por el que no se puede entrar a esta fila ahora mismo; null = abierta. '
  'Única fuente: la usa turno_entrar_a_cola para negarse y la pantalla para '
  'apagar el botón antes de que el cliente lo toque.';

grant execute on function turno_fila_abierta(uuid, uuid) to authenticated;

-- ── LA PUERTA ────────────────────────────────────────────────────────────────
-- Mismo comportamiento que en la 72; lo que cambia es que ya no lleva la regla
-- escrita dentro, la pregunta.
create or replace function turno_entrar_a_cola(
  p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_doble boolean; v_row public.turno_cola; v_espera int;
  v_motivo text;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  v_motivo := public.turno_fila_abierta(p_perfil, p_negocio);
  if v_motivo is not null then raise exception '%', v_motivo; end if;

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_doble := coalesce(v_doble, true);

  if v_doble then
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente and tipo_servicio = v_tipo
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo de este tipo de servicio';
    end if;
  else
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino','atendiendo');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;

  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  select coalesce(sum(s.duracion_min), 0)::int into v_espera
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = p_negocio and q.estado = 'en_fila'
     and (q.prioridad < v_prioridad or (q.prioridad = v_prioridad and q.posicion < v_pos));
  v_espera := coalesce(v_espera, 0) + coalesce(public.turno_min_ocupada(p_perfil), 0);

  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio,
                         prioridad, posicion, estado, eta_avisada_at)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo,
          v_prioridad, v_pos, 'en_fila', now() + make_interval(mins => v_espera))
  returning * into v_row;
  return v_row;
end $$;

-- ── EL LETRERO ───────────────────────────────────────────────────────────────
-- Dos columnas nuevas: si la fila admite gente AHORA y por qué no.
drop function if exists turno_estado_barbero(uuid);

create function turno_estado_barbero(p_perfil uuid)
returns table (
  estado text, acepta boolean, cliente text, hasta time, en_cola int,
  acepta_citas boolean, acepta_fila boolean, modo text,
  fila_abierta boolean, fila_motivo text
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_decision text;
  v_cliente text; v_hasta time; v_cola int; v_ocupado boolean := false;
  v_staff boolean; v_modo text; v_motivo text;
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
    v_motivo;
end $$;

grant execute on function turno_estado_barbero(uuid) to authenticated;

-- El listado del cliente son N barberos, y turno_estado_barbero es de uno en
-- uno. Sin esto la pantalla tendría que llamar N veces o volver a adivinar.
create or replace function turno_filas_abiertas(p_negocio uuid)
returns table (perfil_id uuid, abierta boolean, motivo text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  return query
    select p.id, public.turno_fila_abierta(p.id, p_negocio) is null,
           public.turno_fila_abierta(p.id, p_negocio)
      from turno_perfiles p
     where p.negocio_id = p_negocio and p.activo and p.aprobado;
end $$;

comment on function turno_filas_abiertas is
  'Una fila por barbero del local: si su fila admite gente ahora y, si no, el '
  'motivo exacto que daría turno_entrar_a_cola.';

grant execute on function turno_filas_abiertas(uuid) to authenticated;
