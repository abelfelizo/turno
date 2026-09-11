-- DEVOLVER VACÍO NO ES NEGARSE
--
-- Cuatro de las funciones que se escribieron en las migraciones 74–83 no tienen
-- portero. No es que tengan uno malo: no tienen ninguno. turno_puesto y
-- turno_eta comprueban si el turno es tuyo y, si no lo es, devuelven null;
-- turno_fila_abierta y turno_mi_preferido no comprueban nada y contestan a
-- quien pregunte.
--
-- Un anónimo —la llave publicable que viaja DENTRO del APK, al alcance de
-- cualquiera que abra el paquete— no se lleva nada con eso. turno_puesto le
-- devuelve null, turno_mi_preferido le devuelve null, y turno_fila_abierta le
-- dice si una barbería está abierta, que es información de la puerta de la
-- calle. No hay fuga. El problema es otro y ya nos costó tres veces:
--
--   devolver vacío y negarse SE PARECEN mientras la consulta funcione.
--
-- El día que alguien toque el `where` de turno_puesto, o que turno_mis_negocios
-- cambie de forma, la comprobación deja de filtrar y la función sigue
-- contestando —ahora con datos— sin que nada se ponga rojo. Ese es exactamente
-- el camino por el que turno_clientes_del_local llegó a producción devolviendo
-- vacío en vez de negarse: la red de puertas.test.sql no la marcó porque no
-- lanzaba, y cuando el portero se cayó de la consulta no había nada debajo.
--
-- Así que el portero va delante, explícito, antes de mirar ninguna fila. Y con
-- eso las cuatro entran en la red de puertas.test.sql, que es el sitio donde se
-- comprueba esto de verdad: llamándolas, no leyéndolas.
--
-- LO QUE NO CAMBIA. Para un usuario con sesión, todo se comporta igual: si el
-- turno no es tuyo, turno_puesto y turno_eta siguen devolviendo null, que es su
-- contrato desde el principio y de lo que la app ya se defiende. Lo único que
-- cambia es que SIN SESIÓN se lanza.
--
-- turno_fila_abierta se llama desde dentro de turno_entrar_a_cola,
-- turno_estado_barbero y turno_estado_local, y las tres exigen sesión antes de
-- llegar aquí: el portero nuevo no les cierra la puerta a ellas.

-- ── EL PUESTO ────────────────────────────────────────────────────────────────
create or replace function turno_puesto(p_cola uuid)
returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_cola; v_n int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;

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

-- ── LA ESPERA ────────────────────────────────────────────────────────────────
create or replace function turno_eta(p_cola uuid)
returns integer
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_row turno_cola; v_min int; v_gap int; v_tz text; v_dow int;
  v_sillas int; v_sueltos int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;

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

-- ── EL LETRERO DE LA PUERTA ──────────────────────────────────────────────────
-- Idéntica a la de la migración 81 salvo la primera línea. Se reescribe entera
-- porque un CREATE OR REPLACE no admite parches.
create or replace function turno_fila_abierta(p_perfil uuid, p_negocio uuid default null)
returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_dow int;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
  v_est text; v_modo text; v_susp boolean; v_motivo text;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;

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
         coalesce(p.estado_actual, 'disponible'), coalesce(p.modo_atencion, 'ambos'),
         coalesce(p.suspendido, false), p.suspendido_motivo
    into v_neg, v_tz, v_est, v_modo, v_susp, v_motivo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil and p.activo and p.aprobado;
  if v_neg is null then return 'no está disponible'; end if;

  -- El motivo del dueño, si lo escribió; si no, algo neutro. Nunca "no ha
  -- puesto su horario" a alguien que está suspendido: eso confunde a todos.
  if v_susp then return coalesce(nullif(trim(v_motivo), ''), 'no está atendiendo por ahora'); end if;

  if not public.turno_perfil_acepta(p_perfil, null) then
    if v_est = 'inactivo' then return 'no está trabajando ahora mismo'; end if;
    if v_est = 'descanso' then return 'está en descanso'; end if;
    if v_modo = 'solo_citas' then return 'solo trabaja con cita'; end if;
    return 'no está tomando clientes ahora mismo';
  end if;

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
  if v_ahora::time < v_ini then
    return 'todavía no abre: empieza a las ' || to_char(v_ini, 'HH12:MI AM');
  end if;
  if v_ahora::time >= v_fin then
    return 'ya cerró por hoy: su jornada termina a las ' || to_char(v_fin, 'HH12:MI AM');
  end if;

  return null;
end $$;

-- ── EL BARBERO DE CONFIANZA ──────────────────────────────────────────────────
-- Era `language sql`, que no puede lanzar. Pasa a plpgsql por el portero.
create or replace function turno_mi_preferido(p_negocio uuid)
returns uuid
language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid(); v_pref uuid;
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  select m.perfil_preferido into v_pref
    from turno_membresias m
   where m.usuario_id = v_uid
     and m.negocio_id = p_negocio and m.rol = 'cliente' and m.activo
   limit 1;
  return v_pref;
end $$;

grant execute on function turno_puesto(uuid) to authenticated;
grant execute on function turno_eta(uuid) to authenticated;
grant execute on function turno_fila_abierta(uuid, uuid) to authenticated;
grant execute on function turno_mi_preferido(uuid) to authenticated;
