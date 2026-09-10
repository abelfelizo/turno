-- EL QUE ESTÁ EN LA SILLA NO HACE FILA
--
-- Reportado desde el teléfono, con un walk-in sentado y un cliente entrando
-- después: "el estado del turno indica que soy el número 2, pero realmente soy
-- el siguiente". Y a la vez, dos esperas que no coinciden: 55 minutos en el
-- resumen de la fila y 22 en el turno.
--
-- Son tres errores distintos con la misma raíz: NADIE ESTABA CALCULANDO EL
-- PUESTO. La pantalla enseñaba `turno_cola.posicion`, que no es un puesto sino
-- un CONTADOR DE ENTRADA — max(posicion)+1 sobre todo lo activo, incluido quien
-- ya está en la silla. Con el walk-in dentro, el siguiente en llegar nace con
-- posicion 2 y ahí se queda para siempre, aunque delante no tenga a nadie
-- esperando.
--
-- 1) EL PUESTO. Se cuenta contra los que ESPERAN ('en_fila'), no contra los que
--    ya están siendo atendidos: quien está en la silla no hace fila. Y se
--    cuenta dentro de su propia cola —la de su barbero, más los que entraron
--    sin elegir— porque la gente que espera a otro barbero no le quita el turno.
--
-- 2) LA ESPERA, UNA SOLA. Había dos cuentas distintas:
--
--      turno_eta          sumaba a TODOS los de delante DEL LOCAL ENTERO, sin
--                         mirar de qué barbero eran.
--      turno_resumen_fila sumaba toda la fila del local, no sumaba el tiempo
--                         que le queda al que está en la silla, y usaba un
--                         hueco entre clientes de 10 minutos inventado.
--
--    Ahora las dos salen del mismo sitio y de la misma aritmética: duración del
--    servicio + hueco entre clientes de los que están DELANTE DE TI en TU cola,
--    más lo que le queda al que está sentado (turno_min_ocupada). Para el que
--    entra sin elegir barbero, el reparto entre sillas ya lo resolvía
--    turno_carga_de_fila desde la migración 67, así que se reutiliza en vez de
--    escribir una tercera versión.
--
-- 3) SACAR DE LA FILA. Reportado también: el dueño no debería poder sacar a
--    nadie de la fila. La migración 76 cerró la silla; esto cierra la espera.
--    La fila de una silla es del barbero que la atiende: él sí puede sacar a
--    quien se fue del local. El dueño, sobre la cola de otro, no — y si el
--    cliente no aparece cuando le toca, para eso está turno_no_esta, que es la
--    puerta correcta y ya exige haberlo llamado antes.

-- ── EL PUESTO ────────────────────────────────────────────────────────────────
create or replace function turno_puesto(p_cola uuid)
returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_cola; v_n int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  if not (v_row.cliente_id = public.turno_uid()
          or v_row.negocio_id in (select public.turno_mis_negocios())) then
    return null;
  end if;

  -- Llamado, en camino o en la silla: ya no hace fila. Cero es "te toca".
  if v_row.estado <> 'en_fila' then return 0; end if;

  select count(*) into v_n
    from turno_cola q
   where q.negocio_id = v_row.negocio_id
     and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion))
     -- SU cola: la de su barbero más los que entraron sin elegir, que pueden
     -- caerle a él. Los que esperan a otro barbero no le quitan el turno.
     and (v_row.perfil_id is null
          or q.perfil_id is null
          or q.perfil_id = v_row.perfil_id);

  return coalesce(v_n, 0) + 1;
end $$;

comment on function turno_puesto is
  'Qué puesto ocupa en la fila, contando solo a los que ESPERAN. 0 = ya le '
  'toca. No confundir con turno_cola.posicion, que es el contador de entrada.';

grant execute on function turno_puesto(uuid) to authenticated;

-- ── LA ESPERA DE QUIEN YA ESTÁ EN LA FILA ────────────────────────────────────
create or replace function turno_eta(p_cola uuid)
returns integer
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_row turno_cola; v_min int; v_gap int; v_tz text; v_dow int;
  v_sillas int; v_sueltos int;
begin
  select * into v_row from turno_cola where id = p_cola;
  if v_row.id is null then return null; end if;
  if not (v_row.cliente_id = public.turno_uid()
          or v_row.negocio_id in (select public.turno_mis_negocios())) then
    return null;
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_negocios n where n.id = v_row.negocio_id;
  v_dow := extract(dow from (now() at time zone coalesce(v_tz, 'America/Santo_Domingo')));

  select coalesce(tiempo_entre_clientes, 0) into v_gap
    from turno_horarios
   where perfil_id = v_row.perfil_id and dia_semana = v_dow and activo
   order by hora_inicio limit 1;
  v_gap := coalesce(v_gap, 0);

  if v_row.perfil_id is not null then
    -- Con barbero elegido: los de delante de SU cola.
    select coalesce(sum(coalesce(s.duracion_min, 30) + v_gap), 0)::int into v_min
      from turno_cola q left join turno_servicios s on s.id = q.servicio_id
     where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
       and (q.perfil_id = v_row.perfil_id or q.perfil_id is null)
       and (q.prioridad < v_row.prioridad
            or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));
    return greatest(0, coalesce(v_min, 0) + coalesce(public.turno_min_ocupada(v_row.perfil_id), 0));
  end if;

  -- Sin barbero elegido: le atiende el primero que se desocupe, así que lo de
  -- delante se reparte entre las sillas abiertas. Mismo criterio que
  -- turno_carga_de_fila, que es quien ya decidía esto para la agenda.
  select coalesce(sum(coalesce(s.duracion_min, 30) + v_gap), 0)::int into v_sueltos
    from turno_cola q left join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_row.negocio_id and q.estado = 'en_fila'
     and (q.prioridad < v_row.prioridad
          or (q.prioridad = v_row.prioridad and q.posicion < v_row.posicion));

  select greatest(1, count(*))::int into v_sillas
    from turno_perfiles p
   where p.negocio_id = v_row.negocio_id and p.activo and p.aprobado
     and coalesce(p.estado_actual, 'disponible') = 'disponible';

  return greatest(0, ceil(coalesce(v_sueltos, 0)::numeric / v_sillas)::int);
end $$;

comment on function turno_eta is
  'Minutos que le faltan a ESTE turno: lo que dura la gente de delante en su '
  'misma cola, más lo que le queda al que está en la silla. Con la misma '
  'aritmética que turno_resumen_fila, que es lo que se ve antes de entrar.';

-- ── LA ESPERA DE QUIEN TODAVÍA NO HA ENTRADO ─────────────────────────────────
create or replace function turno_resumen_fila(p_negocio uuid, p_perfil uuid default null)
returns table (delante int, espera_min int)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_delante int; v_espera int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  -- CUÁNTA GENTE HAY DELANTE: solo los que esperan. El que está en la silla no
  -- hace fila, y contarlo era la mitad del "soy el número 2" siendo el
  -- siguiente.
  select count(*)::int into v_delante
    from turno_cola c
   where c.negocio_id = p_negocio and c.estado = 'en_fila'
     and (p_perfil is null or c.perfil_id is null or c.perfil_id = p_perfil);

  if p_perfil is not null then
    v_espera := public.turno_carga_de_fila(p_perfil);
  else
    -- Sin barbero elegido, te atiende el primero que se desocupe: la espera es
    -- la de la silla que antes quede libre, no la suma de todas.
    select min(public.turno_carga_de_fila(p.id))::int into v_espera
      from turno_perfiles p
     where p.negocio_id = p_negocio and p.activo and p.aprobado
       and public.turno_fila_abierta(p.id, p_negocio) is null;
  end if;

  return query select coalesce(v_delante, 0), greatest(0, coalesce(v_espera, 0));
end $$;

comment on function turno_resumen_fila is
  'Lo que verá quien entre AHORA: cuántos esperan y cuántos minutos. Misma '
  'aritmética que turno_eta; antes eran dos cuentas distintas y el cliente veía '
  '55 minutos en una pantalla y 22 en la otra.';

-- ── LA FILA DE UNA SILLA ES DE SU BARBERO ────────────────────────────────────
create or replace function turno_sacar_de_cola(p_cola uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('en_fila','llamado','en_camino','atendiendo') then
    raise exception 'ese turno ya está cerrado';
  end if;

  -- Quien atiende esa cola puede sacar a quien se fue del local. El dueño, si
  -- no es él quien atiende, no: lo suyo cuando el cliente no aparece es
  -- llamarlo y marcar que no está (turno_no_esta), que deja constancia y le da
  -- el turno al siguiente en vez de borrarlo a mano.
  if v.perfil_id is not null and not public.turno_es_mi_perfil(v.perfil_id) then
    raise exception 'esa fila la maneja el barbero que atiende esa silla';
  end if;

  update turno_cola set estado = 'abandonado' where id = p_cola;
end $$;

comment on function turno_sacar_de_cola is
  'Sacar a alguien de la fila lo hace el barbero de esa silla (o el equipo, si '
  'el turno no tiene barbero). El dueño sobre una cola ajena usa turno_no_esta.';
