-- EL TIEMPO DE ESPERA ES UN APROXIMADO, Y CUANDO CAMBIA HAY QUE AVISAR
--
-- Requisito del piloto, en dos partes y con una corrección importante en medio:
--
--   "debe haber una forma en la que los clientes sepan cuándo su turno se
--    adelanta, así no perderán su turno"
--   "tampoco es una promesa: cuando haces la fila te dice un tiempo aproximado,
--    debes estar pendiente, pero el sistema debe notificarte cuando ese tiempo
--    se actualice por alguna razón."
--
-- LA CORRECCIÓN IMPORTA. La primera versión de esto guardaba la hora estimada
-- como un COMPROMISO y prohibía marcar ausente a nadie antes de ella. Eso ataba
-- al barbero a un número que la app calcula por encima —el de delante puede
-- tardar el doble o la mitad— y le dejaba la silla parada defendiendo una
-- promesa que nadie hizo. El aproximado es del cliente para organizarse, no un
-- contrato contra el local.
--
-- Lo que sí es obligación del sistema: si ese número cambia, decírselo. Quien
-- espera fuera se organizó con "unos 40 minutos"; si pasa a 10 porque los de
-- delante no aparecieron, tiene derecho a enterarse — y entonces sí es cosa suya
-- estar pendiente.
--
-- CÓMO. Se guarda el último tiempo que se le COMUNICÓ (no el que "le toca"), y
-- cuando el real se separa de ese por más de unos minutos, sale en la lista de
-- avisos pendientes y se actualiza. La app del barbero la consulta después de
-- cada cambio en la fila y manda los push: la base no puede hacer llamadas HTTP
-- en este proyecto —no hay pg_net— así que el envío vive donde ya viven los
-- demás avisos.
--
-- Se avisa en las dos direcciones. Que se retrase también es información: quien
-- iba a esperar diez minutos y ahora son cuarenta prefiere saberlo para irse a
-- hacer algo, en vez de descubrirlo de pie en la puerta.

alter table turno_cola add column if not exists eta_avisada_at timestamptz;

comment on column turno_cola.eta_avisada_at is
  'Última hora aproximada COMUNICADA al cliente. No es un compromiso: sirve para '
  'saber cuándo el cálculo real se ha separado de lo que se le dijo y hay que '
  'volver a avisarle. NULL en turnos anteriores a la migración 62.';

-- Al entrar se guarda lo que se le enseñó en pantalla.
create or replace function turno_entrar_a_cola(p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_doble boolean; v_row public.turno_cola; v_espera int;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if not public.turno_perfil_acepta(p_perfil, null) then
    raise exception 'ese barbero no está tomando clientes ahora mismo';
  end if;

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_doble := coalesce(v_doble, true);

  -- Ojo con el alcance: va SIN filtrar por negocio, porque el índice único que
  -- la respalda —(cliente_id, tipo_servicio)— es global.
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

-- turno_no_esta vuelve a lo que era en la migración 60: sin ataduras de tiempo.
-- La protección del cliente es el AVISO, no impedirle trabajar al barbero.
create or replace function turno_no_esta(p_cola uuid)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_primero uuid;
begin
  v := public.turno_cola_operable(p_cola);

  if v.estado not in ('llamado', 'en_camino') then
    raise exception 'primero llámalo: solo se marca ausente a quien ya tuvo su turno';
  end if;

  select q.id into v_primero
    from turno_cola q
   where q.negocio_id = v.negocio_id
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (v.perfil_id is null or q.perfil_id is null or q.perfil_id = v.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;
  if v_primero is distinct from p_cola then
    raise exception 'ese no es el turno que toca ahora';
  end if;

  update turno_cola
     set estado = 'expirado', expira_at = now()
   where id = p_cola
   returning * into v;
  return v;
end $$;

-- ── A QUIÉN HAY QUE AVISAR ──────────────────────────────────────────────────
-- Devuelve los turnos cuya espera real se ha separado de la última comunicada
-- más de `p_umbral_min`, y DEJA CONSTANCIA de que se les avisa (actualiza la
-- hora comunicada). Que la misma llamada devuelva y marque evita el caso feo:
-- consultar, fallar el envío y volver a consultar mandando el aviso dos veces.
--
-- No manda el push: en este proyecto la base no puede hacer llamadas HTTP (no
-- hay pg_net), así que el envío lo hace la app del barbero, que es donde ya
-- viven los demás avisos.
create or replace function turno_avisos_de_espera(p_negocio uuid, p_umbral_min int default 5)
returns table(
  cola_id uuid,
  cliente_id uuid,
  nombre text,
  minutos int,        -- lo que falta ahora, de verdad
  se_adelanto boolean -- para elegir el texto: "se adelantó" o "va para largo"
)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  return query
  with reales as (
    select q.id, q.cliente_id, u.nombre, q.eta_avisada_at,
           public.turno_eta(q.id) as min_real
      from turno_cola q
      join turno_usuarios u on u.id = q.cliente_id
     where q.negocio_id = p_negocio and q.estado = 'en_fila'
  ),
  cambian as (
    select r.*, (now() + make_interval(mins => r.min_real)) as nueva
      from reales r
     where r.min_real is not null
       and r.eta_avisada_at is not null
       and abs(extract(epoch from ((now() + make_interval(mins => r.min_real)) - r.eta_avisada_at)) / 60)
           >= p_umbral_min
  ),
  marcadas as (
    update turno_cola q
       set eta_avisada_at = c.nueva
      from cambian c
     where q.id = c.id
     returning q.id, c.cliente_id, c.nombre, c.min_real, c.nueva, c.eta_avisada_at as antes
  )
  select m.id, m.cliente_id, m.nombre, m.min_real::int, (m.nueva < m.antes)
    from marcadas m;
end $$;

grant execute on function turno_avisos_de_espera(uuid, int) to authenticated;
