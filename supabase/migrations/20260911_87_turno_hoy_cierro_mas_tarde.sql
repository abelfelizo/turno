-- HOY CIERRO MÁS TARDE
--
-- Reportado desde el teléfono, dos hallazgos que son el mismo:
--
--   «Cuando la barbería cerró le di a sentar un cliente, lo aceptó y luego lo
--    cerró. Es normal que barberos decidan extender su horario.»
--   «Local cerrado: la tarjeta de estado debe ser diferente en dueño y barbero.
--    Ahí podría estar la solución para después que cierran.»
--
-- Las dos mitades:
--
-- 1. QUE EL SERVIDOR LE DEJARA SENTAR A ALGUIEN CON EL LOCAL CERRADO NO ES UN
--    FALLO. Está decidido y probado desde la migración 70: la silla es suya y
--    quien tiene delante se corta, esté el letrero como esté. Lo que fallaba es
--    que la PANTALLA no decía en ningún sitio que la fila estaba cerrada —
--    turno_estado_barbero devuelve `fila_abierta` y `fila_motivo` desde la
--    migración 74 y la agenda no los miraba. El barbero veía "Libre · nadie
--    esperando" a las once de la noche, idéntico a las once de la mañana.
--
-- 2. NO HABÍA FORMA DE ALARGAR EL DÍA. El horario semanal es la norma, pero una
--    barbería no cierra a las seis porque lo diga una tabla: cierra cuando se
--    va el último. Hasta ahora, para seguir recibiendo gente por la app después
--    de la hora había que ir a Configuración y cambiar el horario del martes
--    PARA SIEMPRE. Nadie va a hacer eso a las nueve de la noche, así que la
--    fila digital se apagaba y el barbero seguía trabajando a mano.
--
-- LA JORNADA DE HOY. Una fila por (barbero, día) que MANDA sobre el horario
-- semanal, solo para ese día. Sirve para las dos direcciones, que son las dos
-- reales: alargar («hoy hay cola, me quedo hasta las diez») y cerrar antes
-- («me voy, no me manden a nadie más»). Y también para abrir un día que el
-- horario semanal tiene cerrado, que es el domingo de diciembre.
--
-- POR QUÉ UNA TABLA APARTE Y NO TOCAR turno_horarios: turno_horarios es la
-- NORMA, lo que el cliente ve como "abre de 9 a 6". Machacarla para quedarse una
-- hora más convierte la excepción en regla y al día siguiente el barbero no sabe
-- por qué su horario cambió. La excepción se guarda como excepción, caduca sola
-- con el día, y la norma sigue intacta.

create table if not exists turno_jornadas (
  perfil_id    uuid not null references turno_perfiles(id) on delete cascade,
  fecha        date not null,
  hora_inicio  time,   -- null = la del horario semanal
  hora_fin     time,   -- null = la del horario semanal
  created_at   timestamptz not null default now(),
  primary key (perfil_id, fecha)
);

comment on table turno_jornadas is
  'La jornada de UN día concreto, que manda sobre turno_horarios solo ese día. '
  'Para alargar el cierre, adelantarlo, o abrir un día que la norma tiene '
  'cerrado. No toca el horario semanal. Ver migración 87.';

alter table turno_jornadas enable row level security;

-- La lee y la escribe quien opera esa silla: el barbero o el dueño de su local.
-- El cliente no la toca nunca; a él le llega ya resuelta por turno_fila_abierta.
drop policy if exists turno_jornadas_todo on turno_jornadas;
create policy turno_jornadas_todo on turno_jornadas
  for all to authenticated
  using (public.turno_perfil_operable(perfil_id))
  with check (public.turno_perfil_operable(perfil_id));

-- ── LA JORNADA EFECTIVA DE UN DÍA ────────────────────────────────────────────
-- Un solo sitio donde se resuelve "¿a qué hora trabaja este barbero ESE día?".
-- Antes la respuesta estaba escrita dos veces —en turno_fila_abierta y en
-- turno_slots_disponibles— y ahora habría sido tres. Escrita una vez, la
-- excepción vale en todas.
create or replace function turno_jornada_de(p_perfil uuid, p_fecha date)
returns table (hora_inicio time, hora_fin time, gap int)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int;
  v_jini time; v_jfin time; v_hay boolean;
begin
  -- El portero, aunque esto sea de solo lectura y las horas de una barbería
  -- estén en la puerta de la calle. La red de puertas.test.sql lo cazó al
  -- primer intento: sin esto, un anónimo obtenía la jornada de cualquiera. No
  -- se escapa gran cosa, pero devolver algo y negarse se parecen mientras la
  -- consulta funcione — es exactamente lo de la migración 84, y la red está
  -- para que no vuelva a colarse. Las tres funciones que la llaman por dentro
  -- son SECURITY DEFINER y ya exigen sesión antes de llegar aquí.
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;

  select h.hora_inicio, h.hora_fin, coalesce(h.tiempo_entre_clientes, 0)
    into v_ini, v_fin, v_gap
    from turno_horarios h
   where h.perfil_id = p_perfil and h.dia_semana = v_dow and h.activo
   order by h.hora_inicio limit 1;

  select j.hora_inicio, j.hora_fin, true into v_jini, v_jfin, v_hay
    from turno_jornadas j
   where j.perfil_id = p_perfil and j.fecha = p_fecha;

  -- Sin excepción: manda la norma (o nada, si ese día está cerrado).
  if not coalesce(v_hay, false) then
    if v_ini is null then return; end if;
    return query select v_ini, v_fin, coalesce(v_gap, 0);
    return;
  end if;

  -- Con excepción. Puede abrir un día que la norma tiene cerrado, y entonces
  -- tiene que traer las dos horas: media excepción sobre un día sin norma no
  -- describe ninguna jornada.
  v_ini := coalesce(v_jini, v_ini);
  v_fin := coalesce(v_jfin, v_fin);
  if v_ini is null or v_fin is null then return; end if;
  if v_fin <= v_ini then return; end if;   -- cerrado a conciencia
  return query select v_ini, v_fin, coalesce(v_gap, 0);
end $$;

comment on function turno_jornada_de is
  'A qué hora trabaja un barbero un día concreto: el horario semanal, con la '
  'excepción de ese día encima si la hay. Sin filas = ese día no trabaja.';

grant execute on function turno_jornada_de(uuid, date) to authenticated;

-- ── ALARGAR ──────────────────────────────────────────────────────────────────
create or replace function turno_alargar_jornada(p_perfil uuid, p_minutos int)
returns time
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tz text; v_hoy date; v_ahora time; v_fin time; v_nuevo time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;
  if coalesce(p_minutos, 0) not between 15 and 240 then
    raise exception 'se alarga entre 15 minutos y 4 horas';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_hoy   := (now() at time zone v_tz)::date;
  v_ahora := (now() at time zone v_tz)::time;

  select j.hora_fin into v_fin from turno_jornada_de(p_perfil, v_hoy) j;

  -- Se cuenta desde AHORA cuando ya cerró, y desde el cierre cuando todavía no.
  -- Si se contara siempre desde el cierre, alargar media hora a las diez de la
  -- noche con cierre a las seis no abriría nada y el botón no haría nada
  -- visible, que es la peor forma de fallar.
  v_nuevo := least(time '23:59', greatest(coalesce(v_fin, v_ahora), v_ahora) + make_interval(mins => p_minutos));

  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_hoy, v_nuevo)
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;

  return v_nuevo;
end $$;

comment on function turno_alargar_jornada is
  'Alarga el cierre de HOY sin tocar el horario semanal. Devuelve la nueva hora '
  'de cierre. Ver migración 87.';

grant execute on function turno_alargar_jornada(uuid, int) to authenticated;

-- ── CERRAR ANTES ─────────────────────────────────────────────────────────────
-- La otra mitad, y la que evita el desastre: alargar sin poder deshacerlo deja
-- al barbero recibiendo gente hasta la hora que puso, aunque se vaya.
create or replace function turno_cerrar_jornada(p_perfil uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_tz text; v_hoy date; v_ahora time; v_ini time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_hoy   := (now() at time zone v_tz)::date;
  v_ahora := (now() at time zone v_tz)::time;
  select j.hora_inicio into v_ini from turno_jornada_de(p_perfil, v_hoy) j;

  -- Cerrar A ESTA HORA, no borrar el día: si se pusiera hora_fin = hora_inicio
  -- la agenda diría "hoy no trabaja", y hoy sí trabajó.
  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_hoy, greatest(v_ahora, coalesce(v_ini, v_ahora)))
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;
end $$;

comment on function turno_cerrar_jornada is
  'Cierra la fila de HOY a esta hora, sin tocar el horario semanal ni el estado '
  'del barbero. Mañana vuelve a abrir a su hora.';

grant execute on function turno_cerrar_jornada(uuid) to authenticated;

-- ── DESHACER: VOLVER A MI HORARIO DE SIEMPRE ─────────────────────────────────
create or replace function turno_jornada_normal(p_perfil uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_tz text;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  delete from turno_jornadas
   where perfil_id = p_perfil and fecha = (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'))::date;
end $$;

grant execute on function turno_jornada_normal(uuid) to authenticated;

-- ── EL LETRERO USA LA JORNADA DEL DÍA, NO LA NORMA ───────────────────────────
-- Igual que la de la migración 84 salvo el bloque del horario, que ahora
-- pregunta a turno_jornada_de.
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
    select exists(
      select 1 from turno_perfiles p
        cross join lateral public.turno_jornada_de(p.id, v_ahora::date) j
       where p.negocio_id = p_negocio and p.activo and p.aprobado
         and v_ahora::time >= j.hora_inicio and v_ahora::time < j.hora_fin
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

  select j.hora_inicio, j.hora_fin into v_ini, v_fin
    from turno_jornada_de(p_perfil, v_ahora::date) j;

  if v_ini is null then return 'hoy no trabaja: su fila abre los días que tiene marcados'; end if;
  if v_ahora::time < v_ini or v_ahora::time >= v_fin then
    return 'ahora está cerrado: su fila abre de ' || to_char(v_ini, 'HH24:MI')
        || ' a ' || to_char(v_fin, 'HH24:MI');
  end if;

  return null;
end $$;

grant execute on function turno_fila_abierta(uuid, uuid) to authenticated;

-- ── Y LA AGENDA TAMBIÉN ──────────────────────────────────────────────────────
-- Si el barbero alarga hasta las diez, los huecos de hoy tienen que llegar hasta
-- las diez. Dejar la fila abierta y la agenda cerrada sería volver a tener dos
-- relojes distintos, que es justo lo que la migración 78 vino a quitar.
create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time without time zone
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_ini time; v_fin time; v_gap int; v_dur int;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_paso interval; v_abre timestamp; v_cierra timestamp; v_carga int;
begin
  if not public.turno_perfil_acepta(p_perfil, p_fecha) then return; end if;

  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null or v_dur <= 0 then return; end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return; end if;

  select j.hora_inicio, j.hora_fin, j.gap into v_ini, v_fin, v_gap
    from turno_jornada_de(p_perfil, p_fecha) j;
  if v_ini is null then return; end if;

  v_ahora  := (now() at time zone v_tz);
  v_ant    := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  v_desde  := v_ahora + make_interval(hours => v_ant);

  if p_fecha = v_ahora::date then
    v_carga := coalesce(public.turno_carga_de_fila(p_perfil), 0);
    if v_carga > 0 then
      v_desde := greatest(v_desde, v_ahora + make_interval(mins => v_carga));
    end if;
  end if;

  v_paso   := make_interval(mins => v_dur + coalesce(v_gap, 0));
  v_abre   := p_fecha + v_ini;
  v_cierra := p_fecha + v_fin;

  return query
  with rejilla as (
    select v_abre + (n * v_paso) as t
      from generate_series(
        0,
        greatest(0, floor(extract(epoch from (v_cierra - v_abre))
                          / nullif(extract(epoch from v_paso), 0))::int)
      ) n
  ),
  pegados as (
    select (p_fecha + c.hora_fin) + make_interval(mins => coalesce(v_gap, 0)) as t
      from turno_citas c
     where c.perfil_id = p_perfil and c.fecha = p_fecha
       and c.estado in ('creada','confirmada','en_camino')
    union all
    select (p_fecha + b.hora_fin) + make_interval(mins => coalesce(v_gap, 0)) as t
      from turno_bloqueos b
     where b.perfil_id = p_perfil and b.fecha = p_fecha
  ),
  candidatos as (
    select t from rejilla
    union
    select t from pegados
  )
  select c.t::time
    from candidatos c
   where c.t >= v_abre
     and c.t + make_interval(mins => v_dur) <= v_cierra
     and c.t >= v_desde
     and not exists (
       select 1 from turno_citas x
        where x.perfil_id = p_perfil and x.fecha = p_fecha
          and x.estado in ('creada','confirmada','en_camino')
          and (p_fecha + x.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + x.hora_fin)    > c.t)
     and not exists (
       select 1 from turno_bloqueos b
        where b.perfil_id = p_perfil and b.fecha = p_fecha
          and (p_fecha + b.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + b.hora_fin)    > c.t)
   order by c.t;
end $$;

-- ── LO QUE YA PASÓ SE BORRA ──────────────────────────────────────────────────
-- «Revisar función bloquear hora: después que se cumple debe borrarse.» Un
-- bloqueo de ayer no le quita sitio a nadie —las consultas miran solo el día
-- que se pregunta— pero ensucia la agenda de los días pasados y hace dudar de
-- si sigue haciendo algo. Y las jornadas de días idos son basura pura: su
-- razón de ser es caducar.
--
-- Se conserva una semana, no desde ayer: el barbero repasa "qué pasó el
-- viernes" y borrarle el almuerzo del historial del día no ayuda a nadie.
create index if not exists turno_bloqueos_fecha_idx on turno_bloqueos (fecha);
create index if not exists turno_jornadas_fecha_idx on turno_jornadas (fecha);

create or replace function turno_limpiar_pasado()
returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  delete from turno_bloqueos where fecha < current_date - 7;
  delete from turno_jornadas where fecha < current_date - 7;
end $$;

comment on function turno_limpiar_pasado is
  'Borra bloqueos y jornadas de hace más de una semana. Corre con el resto del '
  'mantenimiento, SIN SESIÓN: no puede exigir turno_uid().';

revoke execute on function turno_limpiar_pasado() from public, anon, authenticated;

-- Trabajo propio, de madrugada, y NO dentro de turno_expirar_llamados: ese corre
-- cada minuto y no hay ninguna razón para buscar basura de hace una semana
-- sesenta veces por hora. Además, meterlo ahí lo haría compartir transacción
-- con el vencimiento de llamados — y ya sabemos cómo acaba eso (migración 75:
-- un error en una parte tumbó las tres).
select cron.schedule('turno_limpiar_pasado', '17 4 * * *',
                     $cron$select public.turno_limpiar_pasado()$cron$);
