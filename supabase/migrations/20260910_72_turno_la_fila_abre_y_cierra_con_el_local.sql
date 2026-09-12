-- LA FILA ABRE Y CIERRA CON EL LOCAL
--
-- Encontrado adaptando la interfaz a los modos de atención (migración 70), y
-- reproducido contra la base antes de tocar nada:
--
--   Horario: los 7 días INACTIVOS
--   Hora local: 06:33
--   Resultado: ENTRÓ A LA FILA
--
-- turno_entrar_a_cola no miraba el horario en absoluto. Comprobaba el tipo de
-- cola, la pertenencia al local, el estado del barbero, el doble servicio y el
-- límite de fila — todo menos si el local estaba abierto. Un cliente podía
-- ponerse el primero de la fila a las tres de la mañana de un domingo cerrado, y
-- el barbero se encontraba gente esperando antes de abrir la puerta.
--
-- No se había notado porque nadie prueba la app de madrugada, y porque hasta
-- ahora el horario servía sobre todo para las citas. Con el modo "solo fila"
-- pasa a ser lo ÚNICO que define la jornada de ese barbero, y ahí el agujero
-- deja de ser teórico.
--
-- LA REGLA, decidida con el piloto: la fila se abre y se cierra con el horario,
-- sin margen. Si la puerta está cerrada no hay fila que hacer.
--
-- Y LOS QUE NO TIENEN HORARIO. Dos de los ocho perfiles de la base no tienen ni
-- una fila en turno_horarios —ni crear_negocio ni unirse_profesional los
-- siembran— así que había que decidir qué significa el silencio. Se decidió que
-- significa "todavía no", no "siempre abierto": la fila queda cerrada y el
-- mensaje dice qué falta. Es la opción estricta, y por eso EL MENSAJE IMPORTA
-- tanto como la regla — un "no se puede" a secas dejaría al barbero sin saber
-- que el problema lo arregla él en dos toques.
--
-- LO QUE NO SE TOCA: turno_atender_sin_cita. Ese es el barbero sentando a quien
-- tiene delante, y si está trabajando fuera de su horario declarado es asunto
-- suyo. Cerrarle eso sería que la app le diga que no puede trabajar.

create or replace function turno_entrar_a_cola(p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_doble boolean; v_row public.turno_cola; v_espera int;
  v_tz text; v_ahora timestamp; v_dow int;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if not public.turno_perfil_acepta(p_perfil, null) then
    raise exception 'ese barbero no está tomando clientes ahora mismo';
  end if;

  -- ── ¿ESTÁ ABIERTO? ────────────────────────────────────────────────────────
  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  v_ahora := (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'));
  v_dow := extract(dow from v_ahora);

  if p_perfil is not null then
    select exists(select 1 from turno_horarios where perfil_id = p_perfil) into v_tiene_horario;
    if not v_tiene_horario then
      raise exception 'ese barbero todavía no ha puesto su horario, así que su fila no está abierta';
    end if;

    select hora_inicio, hora_fin into v_ini, v_fin
      from turno_horarios
     where perfil_id = p_perfil and dia_semana = v_dow and activo
     order by hora_inicio limit 1;

    if v_ini is null then
      raise exception 'hoy no trabaja: su fila abre los días que tiene marcados';
    end if;
    if v_ahora::time < v_ini or v_ahora::time >= v_fin then
      raise exception 'ahora está cerrado: su fila abre de % a %',
        to_char(v_ini, 'HH24:MI'), to_char(v_fin, 'HH24:MI');
    end if;
  else
    -- "Cualquiera disponible": no hay un horario al que mirar, así que la
    -- pregunta es si HAY ALGUIEN abierto en el local ahora mismo. Si no, la
    -- fila tampoco tiene sentido: no la va a atender nadie.
    select exists(
      select 1 from turno_perfiles p
        join turno_horarios h on h.perfil_id = p.id
       where p.negocio_id = p_negocio and p.activo and p.aprobado
         and h.dia_semana = v_dow and h.activo
         and v_ahora::time >= h.hora_inicio and v_ahora::time < h.hora_fin
         and public.turno_perfil_acepta(p.id, null)
    ) into v_abierto;
    if not v_abierto then
      raise exception 'ahora mismo no hay nadie abierto en el local';
    end if;
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
