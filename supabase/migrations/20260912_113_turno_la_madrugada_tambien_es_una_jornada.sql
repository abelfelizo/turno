-- LA MADRUGADA TAMBIÉN ES UNA JORNADA
--
-- Un local abierto de 9:00 p.m. a 3:00 a.m. —normal en Navidad, en Nochevieja
-- y la víspera del Día de las Madres— hoy sale MAL por todas partes:
--
--   · A la 01:18 el cliente lee «ahora está cerrado: su fila abre de 21:00 a
--     03:00». El propio mensaje contiene la hora actual. La fila está cerrada
--     justo en las horas en que el barbero está trabajando.
--   · `turno_jornada_de` tenía `if v_fin <= v_ini then return; end if`: una
--     jornada que cruza la medianoche **no existía**, devolvía vacío.
--   · `turno_alargar_jornada` topaba en las 23:59. El barbero que cierra a las
--     11:30 p.m. y quiere una hora más se quedaba en 23:59, y el resto de la
--     hora no había forma de anunciarla.
--   · `turno_cerrar_olvidados` (el cron de cada noche) calculaba el final como
--     `fecha + hora_fin`, o sea las 3 de la mañana **del mismo día**, que ya
--     pasó: a todo el que entrara en una fila de madrugada lo daba por
--     expirado nada más entrar.
--
-- ── DE QUÉ DÍA ES LA NOCHE DEL 24 ───────────────────────────────────────────
-- Una jornada se ancla al día en que EMPIEZA. El turno de 9:00 p.m. del 24 al
-- 3:00 a.m. del 25 es «la noche del 24», que es como lo dice el barbero, y su
-- `dia_semana` es el del 24. A la 01:18 del 25 la jornada vigente es la del
-- 24: hay que mirar hacia atrás un día, no solo al de hoy.
--
-- La regla, en una línea: **si la hora de fin es menor que la de inicio, el fin
-- es del día siguiente.** Si son iguales, el día está cerrado — eso ya lo usa
-- `turno_cerrar_jornada` para decir «hoy ya no trabajo» y se conserva.
--
-- Esta migración arregla LA FILA. La agenda de citas (`turno_slots_disponibles`,
-- `turno_agendar_cita`, `turno_agendar_grupo`) y las pantallas de estado siguen
-- sin entender la madrugada; van en la siguiente. Se dice aquí para que no se
-- lea esta migración como si cerrara el tema entero.

-- ── 1. LA ARITMÉTICA, SUELTA Y SIN SESIÓN ───────────────────────────────────
-- El cron corre SIN sesión: `turno_uid()` allí es nulo. Por eso el cálculo del
-- final real vive en una función pura, que no pregunta quién llama y que
-- pueden usar por igual el cron y las funciones con portero.

create or replace function public.turno_fin_real(p_fecha date, p_ini time, p_fin time)
returns timestamp language sql immutable as $$
  select (p_fecha + p_fin)::timestamp
       + case when p_fin < p_ini then interval '1 day' else interval '0 second' end;
$$;

revoke execute on function public.turno_fin_real(date, time, time) from public, anon;
grant  execute on function public.turno_fin_real(date, time, time) to authenticated;

-- ── 2. LA VENTANA CRUDA ─────────────────────────────────────────────────────
-- El par (inicio, fin) de la jornada que EMPIEZA en `p_fecha`, ya resuelto
-- entre el horario base y la jornada del día, y ya convertido a instantes.
--
-- No tiene portero **a propósito**: no se le concede a nadie. Solo la pueden
-- llamar el cron y las funciones `security definer` que la envuelven, que sí
-- preguntan quién llama. Así el mismo cálculo sirve a ambos lados sin abrir
-- una puerta nueva.

create or replace function public.turno_ventana_cruda(p_perfil uuid, p_fecha date)
returns table(inicio timestamp, fin timestamp, gap int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini time; v_fin time; v_gap int;
  v_jini time; v_jfin time; v_hay boolean;
begin
  select h.hora_inicio, h.hora_fin, coalesce(h.tiempo_entre_clientes, 0)
    into v_ini, v_fin, v_gap
    from turno_horarios h
   where h.perfil_id = p_perfil and h.dia_semana = extract(dow from p_fecha) and h.activo
   order by h.hora_inicio limit 1;

  select j.hora_inicio, j.hora_fin, true into v_jini, v_jfin, v_hay
    from turno_jornadas j
   where j.perfil_id = p_perfil and j.fecha = p_fecha;

  if coalesce(v_hay, false) then
    v_ini := coalesce(v_jini, v_ini);
    v_fin := coalesce(v_jfin, v_fin);
  end if;

  if v_ini is null or v_fin is null then return; end if;
  -- Iguales = cerrado. Distintas = jornada, cruce o no.
  if v_fin = v_ini then return; end if;

  return query select (p_fecha + v_ini)::timestamp,
                      public.turno_fin_real(p_fecha, v_ini, v_fin),
                      coalesce(v_gap, 0);
end $$;

revoke execute on function public.turno_ventana_cruda(uuid, date) from public, anon, authenticated;

-- ── 3. LA JORNADA DEL DÍA, AHORA CON EL CRUCE DECLARADO ─────────────────────
-- Mismas tres columnas de siempre más `cruza`, para que quien la lea sepa que
-- el fin es de mañana en vez de tener que deducirlo comparando. Hay que tirar
-- y rehacer porque cambia el tipo de retorno.

drop function if exists public.turno_jornada_de(uuid, date);

create function public.turno_jornada_de(p_perfil uuid, p_fecha date)
returns table(hora_inicio time, hora_fin time, gap int, cruza boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  return query
    select v.inicio::time,
           v.fin::time,
           v.gap,
           v.fin::date > v.inicio::date
      from public.turno_ventana_cruda(p_perfil, p_fecha) v;
end $$;

revoke execute on function public.turno_jornada_de(uuid, date) from public, anon;
grant  execute on function public.turno_jornada_de(uuid, date) to authenticated;

-- ── 4. ¿EN QUÉ JORNADA ESTAMOS AHORA MISMO? ─────────────────────────────────
-- Mira la de hoy y la de ayer, porque a la 01:18 la jornada viva empezó ayer.
-- Devuelve una fila o ninguna: vacío significa «ahora no está trabajando».

create or replace function public.turno_jornada_ahora(p_perfil uuid)
returns table(fecha date, inicio timestamp, fin timestamp, gap int)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_ahora timestamp; v_hoy date;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then return; end if;
  v_ahora := (now() at time zone v_tz);
  v_hoy   := v_ahora::date;

  return query
    select d.dia, v.inicio, v.fin, v.gap
      from (select v_hoy as dia union all select v_hoy - 1) d
      cross join lateral public.turno_ventana_cruda(p_perfil, d.dia) v
     where v_ahora >= v.inicio and v_ahora < v.fin
     order by d.dia desc
     limit 1;
end $$;

revoke execute on function public.turno_jornada_ahora(uuid) from public, anon;
grant  execute on function public.turno_jornada_ahora(uuid) to authenticated;

-- ── 5. EL DÍA DE TRABAJO AL QUE SE LE APUNTAN LOS CAMBIOS ───────────────────
-- «Alargar», «adelantar» y «ya cierro» escriben en `turno_jornadas` con una
-- fecha. Esa fecha NO es la del calendario: es la del día en que empezó la
-- jornada en la que estoy. A la 01:18 del 25, cerrar la jornada se apunta en
-- el 24, o se estaría cerrando una jornada que todavía no ha empezado.

create or replace function public.turno_dia_laboral(p_perfil uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_f date;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select j.fecha into v_f from public.turno_jornada_ahora(p_perfil) j;
  if v_f is not null then return v_f; end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  return (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'))::date;
end $$;

revoke execute on function public.turno_dia_laboral(uuid) from public, anon;
grant  execute on function public.turno_dia_laboral(uuid) to authenticated;

-- ── 6. LA PUERTA DE LA FILA ─────────────────────────────────────────────────
-- Cambia solo la parte del horario. Los porteros de suspensión, cobro, modo y
-- estado se quedan exactamente como estaban.

-- OJO: `p_negocio` lleva valor por defecto desde que se creó. Volver a
-- declararla sin él no es un detalle de estilo: Postgres lo rechaza, y si lo
-- aceptara rompería todas las llamadas de un solo argumento.
create or replace function public.turno_fila_abierta(p_perfil uuid, p_negocio uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
  v_est text; v_modo text; v_susp boolean; v_motivo text; v_dentro boolean;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if p_perfil is null then
    if p_negocio is null then return null; end if;
    select exists(
      select 1 from turno_perfiles p
        cross join lateral public.turno_jornada_ahora(p.id) j
       where p.negocio_id = p_negocio and p.activo and p.aprobado
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

  if not public.turno_silla_al_dia(p_perfil) then
    return 'no está tomando clientes ahora mismo';
  end if;

  if v_susp then return coalesce(nullif(trim(v_motivo), ''), 'no está atendiendo por ahora'); end if;
  if not public.turno_perfil_acepta(p_perfil, null) then
    if v_est = 'inactivo' then return 'no está trabajando ahora mismo'; end if;
    if v_est = 'descanso' then return 'está en descanso'; end if;
    if v_modo = 'solo_citas' then return 'solo trabaja con cita'; end if;
    return 'no está tomando clientes ahora mismo';
  end if;

  select exists(select 1 from turno_horarios where perfil_id = p_perfil) into v_tiene_horario;
  if not v_tiene_horario then
    return 'todavía no ha puesto su horario, así que su fila no está abierta';
  end if;

  -- ¿Estoy dentro de alguna jornada viva? La de hoy o la de ayer que cruzó.
  select true into v_dentro from public.turno_jornada_ahora(p_perfil) j;
  if coalesce(v_dentro, false) then return null; end if;

  -- Cerrado. Para decir CUÁNDO abre se usa la jornada que empieza hoy.
  v_ahora := (now() at time zone v_tz);
  select j.hora_inicio, j.hora_fin into v_ini, v_fin
    from public.turno_jornada_de(p_perfil, v_ahora::date) j;
  if v_ini is null then return 'hoy no trabaja: su fila abre los días que tiene marcados'; end if;
  return 'ahora está cerrado: su fila abre de ' || to_char(v_ini, 'HH24:MI')
      || ' a ' || to_char(v_fin, 'HH24:MI');
end $$;

revoke execute on function public.turno_fila_abierta(uuid, uuid) from public, anon;
grant  execute on function public.turno_fila_abierta(uuid, uuid) to authenticated;

-- ── 7. ALARGAR, ADELANTAR Y CERRAR, ANCLADOS AL DÍA DE TRABAJO ──────────────

create or replace function public.turno_alargar_jornada(p_perfil uuid, p_minutos int)
returns time language plpgsql volatile security definer set search_path = public as $$
declare
  v_tz text; v_dia date; v_ahora timestamp;
  v_ini time; v_fin time; v_fin_ts timestamp; v_nuevo_ts timestamp; v_tope timestamp;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_manda_en_el_horario(p_perfil) then
    raise exception 'el horario de esa silla no lo decides tú';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no está operativa';
  end if;
  if coalesce(p_minutos, 0) not between 15 and 240 then
    raise exception 'se alarga entre 15 minutos y 4 horas';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_ahora := (now() at time zone v_tz);
  v_dia   := public.turno_dia_laboral(p_perfil);
  select j.hora_inicio, j.hora_fin into v_ini, v_fin
    from public.turno_jornada_de(p_perfil, v_dia) j;

  -- Sin jornada hoy, alargar cuenta desde ahora. Con jornada, desde su final
  -- real (que puede ser de mañana) o desde ahora si ya se pasó.
  if v_ini is null then
    v_fin_ts := v_ahora;
    v_tope   := v_ahora + interval '23 hours';
  else
    v_fin_ts := greatest(public.turno_fin_real(v_dia, v_ini, v_fin), v_ahora);
    v_tope   := (v_dia + v_ini)::timestamp + interval '23 hours';
  end if;

  -- El final nunca alcanza al inicio: una jornada no puede dar la vuelta
  -- entera y volver a parecer un día normal.
  v_nuevo_ts := least(v_fin_ts + make_interval(mins => p_minutos), v_tope);

  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_dia, v_nuevo_ts::time)
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;

  return v_nuevo_ts::time;
end $$;

revoke execute on function public.turno_alargar_jornada(uuid, int) from public, anon;
grant  execute on function public.turno_alargar_jornada(uuid, int) to authenticated;

create or replace function public.turno_adelantar_jornada(p_perfil uuid, p_minutos int)
returns time language plpgsql volatile security definer set search_path = public as $$
declare v_dia date; v_ini time; v_fin time; v_nuevo time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  -- Adelantar COMPROMETE a estar ahí antes de la hora anunciada. Como alargar,
  -- es una decisión sobre el horario. Ver migración 88.
  if not public.turno_manda_en_el_horario(p_perfil) then
    raise exception 'el horario de esa silla no lo decides tú';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no está operativa';
  end if;
  if coalesce(p_minutos, 0) not between 15 and 240 then
    raise exception 'se adelanta entre 15 minutos y 4 horas';
  end if;

  v_dia := public.turno_dia_laboral(p_perfil);
  select j.hora_inicio, j.hora_fin into v_ini, v_fin
    from public.turno_jornada_de(p_perfil, v_dia) j;
  if v_ini is null then raise exception 'hoy no tienes jornada: eso se cambia en tu horario'; end if;

  -- Tope en las 00:00 del día de la jornada: adelantar no la muda al día
  -- anterior, que sería mover la jornada entera sin decirlo.
  v_nuevo := greatest(time '00:00', v_ini - make_interval(mins => p_minutos));

  insert into turno_jornadas (perfil_id, fecha, hora_inicio)
  values (p_perfil, v_dia, v_nuevo)
  on conflict (perfil_id, fecha) do update set hora_inicio = excluded.hora_inicio;

  return v_nuevo;
end $$;

revoke execute on function public.turno_adelantar_jornada(uuid, int) from public, anon;
grant  execute on function public.turno_adelantar_jornada(uuid, int) to authenticated;

create or replace function public.turno_cerrar_jornada(p_perfil uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_tz text; v_dia date; v_ahora timestamp; v_ini time; v_fin_ts timestamp;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_ahora := (now() at time zone v_tz);
  v_dia   := public.turno_dia_laboral(p_perfil);
  select j.hora_inicio into v_ini from public.turno_jornada_de(p_perfil, v_dia) j;

  -- Cerrar solo QUITA: el final pasa a ser ahora. Si todavía no había
  -- empezado, el final iguala al inicio y eso ya significa «hoy no trabajo».
  v_fin_ts := greatest(v_ahora, coalesce((v_dia + v_ini)::timestamp, v_ahora));

  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_dia, v_fin_ts::time)
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;
end $$;

revoke execute on function public.turno_cerrar_jornada(uuid) from public, anon;
grant  execute on function public.turno_cerrar_jornada(uuid) to authenticated;

-- «Volver a mi horario» deshace la excepción de LA JORNADA QUE ESTÁ VIVA. A la
-- 01:18 ésa es la de ayer: borrar la de hoy no desharía nada y dejaría al
-- barbero dándole a un botón que no hace efecto.

create or replace function public.turno_jornada_normal(p_perfil uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;
  delete from turno_jornadas
   where perfil_id = p_perfil and fecha = public.turno_dia_laboral(p_perfil);
end $$;

revoke execute on function public.turno_jornada_normal(uuid) from public, anon;
grant  execute on function public.turno_jornada_normal(uuid) to authenticated;

-- ── 8. EL CRON DE LA NOCHE ──────────────────────────────────────────────────
-- Un turno se da por olvidado cuando ha pasado el final REAL de la jornada a
-- la que pertenece. Y la jornada a la que pertenece puede haber empezado el
-- día anterior: por eso se miran las dos ventanas.
--
-- OJO A CÓMO SE ELIGE, que aquí me equivoqué primero: no vale quedarse con la
-- ventana que CONTIENE el momento en que el cliente entró. Si el barbero
-- acorta la jornada después —«ya cierro»—, ese turno deja de estar dentro de
-- ninguna ventana y se quedaría en la fila **para siempre**. Lo que se busca
-- es la jornada que ya había EMPEZADO cuando el cliente entró: la de mayor
-- hora de inicio entre las que no son futuras. Y si entró antes de que
-- abriera ninguna —el barbero sienta a quien tiene delante con el local
-- cerrado, cosa permitida—, se usa la del propio día, como siempre.

create or replace function public.turno_cerrar_olvidados()
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_count int;
begin
  with viejos as (
    select q.id, q.estado
      from turno_cola q
      join turno_negocios n on n.id = q.negocio_id
      cross join lateral (
        select (q.created_at at time zone coalesce(n.tz, 'America/Santo_Domingo')) as local
      ) d
      left join lateral (
        select v.fin
          from (select d.local::date as dia union all select d.local::date - 1) c
          cross join lateral public.turno_ventana_cruda(q.perfil_id, c.dia) v
         order by (v.inicio <= d.local) desc, v.inicio desc
         limit 1
      ) w on true
     where q.estado in ('en_fila','llamado','en_camino','atendiendo')
       and case
             when w.fin is not null
               then (now() at time zone coalesce(n.tz, 'America/Santo_Domingo')) > w.fin
             else q.created_at < now() - interval '8 hours'
           end
  )
  update turno_cola q
     set estado = case when v.estado = 'atendiendo' then 'atendido' else 'expirado' end,
         atendido_at = case when v.estado = 'atendiendo' then now() else q.atendido_at end
    from viejos v
   where q.id = v.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.turno_cerrar_olvidados() from public, anon, authenticated;
