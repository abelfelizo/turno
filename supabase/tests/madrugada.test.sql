-- ─────────────────────────────────────────────────────────────────────────────
-- LA MADRUGADA TAMBIÉN ES UNA JORNADA · Turno  (migración 113)
--
-- Una barbería abierta de 9:00 p.m. a 3:00 a.m. es normal en Navidad, en
-- Nochevieja y la víspera del Día de las Madres. Antes de la 113, a la 01:18 el
-- cliente leía «ahora está cerrado: su fila abre de 21:00 a 03:00» — un mensaje
-- que contiene la hora actual y dice lo contrario de lo que se ve por la
-- ventana. La fila estaba cerrada exactamente en las horas de más trabajo.
--
-- ── EL TRUCO PARA PROBARLO A CUALQUIER HORA ─────────────────────────────────
-- Estas reglas dependen de la hora que sea. No se puede mover `now()`, pero SÍ
-- se puede mover el huso del local: cada negocio tiene el suyo. El fixture
-- calcula el huso que hace que en ese local sean **la una y pico de la
-- madrugada** en el instante en que se corre la prueba, sea la hora que sea en
-- el mundo real. Así el caso que se prueba es el de verdad —21:00 a 03:00, y
-- son las 01:xx— y no una jornada retorcida armada para que cuadre el reloj.
--
-- El segundo local hace lo contrario: su huso lo pone a mediodía, para
-- comprobar que un horario normal de 9 a 6 **sigue funcionando igual**. Cerrar
-- de más también es incumplir la regla.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/madrugada.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  a_due2 uuid := gen_random_uuid();
  u_due uuid; u_cli uuid; v_neg uuid; p_due uuid; s_corte uuid; v_cod text;
  v_neg2 uuid; p_due2 uuid; s_corte2 uuid;
  v_sem text := 'MD-' || upper(substr(md5(random()::text),1,5));
  v_off int; v_tz text; v_tz2 text;
  v_ahora timestamp; v_hoy date; v_ayer date;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_txt text; v_date date; v_ini time; v_fin time; v_cruza boolean; v_ts timestamp;
begin
  -- ══ EL HUSO QUE PONE EL LOCAL EN LA MADRUGADA ═════════════════════════════
  -- Queremos que en el local sea la 01:xx. Se calcula el desfase contra UTC y
  -- se traduce a un huso fijo. Ojo al signo: en la familia `Etc/`, GMT-4
  -- significa UTC+4, al revés de lo que parece.
  v_off := 1 - extract(hour from (now() at time zone 'UTC'))::int;
  while v_off >  12 loop v_off := v_off - 24; end loop;
  while v_off < -11 loop v_off := v_off + 24; end loop;
  v_tz := case when v_off = 0 then 'UTC'
               when v_off > 0 then 'Etc/GMT-' || v_off
               else 'Etc/GMT+' || (-v_off) end;

  -- Y el del segundo local, a mediodía, para el horario normal.
  v_off := 12 - extract(hour from (now() at time zone 'UTC'))::int;
  while v_off >  12 loop v_off := v_off - 24; end loop;
  while v_off < -11 loop v_off := v_off + 24; end loop;
  v_tz2 := case when v_off = 0 then 'UTC'
                when v_off > 0 then 'Etc/GMT-' || v_off
                else 'Etc/GMT+' || (-v_off) end;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','md1_'||v_sem||'@t.test','',now(),now()),
         (a_due2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','md2_'||v_sem||'@t.test','',now(),now()),
         (a_cli ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mdc_'||v_sem||'@t.test','',now(),now());

  -- ── El local de madrugada ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Madrugada Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  update turno_negocios set tz = v_tz where id = v_neg;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_due,'Corte',30,500,true) returning id into s_corte;

  v_ahora := (now() at time zone v_tz);
  v_hoy   := v_ahora::date;
  v_ayer  := v_hoy - 1;

  -- 9:00 p.m. a 3:00 a.m., todos los días. La jornada viva ahora mismo es la
  -- que EMPEZÓ AYER a las nueve de la noche.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_due, d, time '21:00', time '03:00', true, 0 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  -- ── El local normal, a mediodía ─────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  perform turno_crear_negocio('Mediodia Barber','empleados','DOP',true,'barbero','Duenno2','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id, negocio_id into p_due2, v_neg2 from turno_perfiles
   where usuario_id = (select id from turno_usuarios where auth_id = a_due2) limit 1;
  update turno_negocios set tz = v_tz2 where id = v_neg2;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_due2,'Corte',30,500,true) returning id into s_corte2;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_due2, d, time '09:00', time '18:00', true, 0 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  -- ── El cliente, en el local de madrugada ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Madrugada', '829');
  select id into u_cli from turno_usuarios where auth_id = a_cli;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);

  -- ══ 1. LA ARITMÉTICA ══════════════════════════════════════════════════════
  n:=n+1; c:='fin menor que inicio · el final es de mañana';
  if turno_fin_real(date '2026-12-24', time '21:00', time '03:00')
     = timestamp '2026-12-25 03:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='fin mayor que inicio · el final es de hoy';
  if turno_fin_real(date '2026-12-24', time '09:00', time '18:00')
     = timestamp '2026-12-24 18:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='las 24:00 son la medianoche de mañana, no un cruce';
  if turno_fin_real(date '2026-12-24', time '09:00', time '24:00')
     = timestamp '2026-12-25 00:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ 2. LA JORNADA SE DECLARA CRUZADA ══════════════════════════════════════
  n:=n+1; c:='la jornada de ayer existe y dice que cruza';
  select j.hora_inicio, j.hora_fin, j.cruza into v_ini, v_fin, v_cruza
    from turno_jornada_de(p_due, v_ayer) j;
  if v_ini = time '21:00' and v_fin = time '03:00' and v_cruza then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_ini::text,'(nada)')||' a '
                     ||coalesce(v_fin::text,'(nada)')||' cruza='||coalesce(v_cruza::text,'?'); end if;

  n:=n+1; c:='un horario normal NO se marca como cruzado';
  select j.cruza into v_cruza from turno_jornada_de(p_due2, v_hoy) j;
  if v_cruza is false then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - cruza='||coalesce(v_cruza::text,'(nada)'); end if;

  -- ══ 3. ¿EN QUÉ JORNADA ESTAMOS? ═══════════════════════════════════════════
  n:=n+1; c:='a la 01:xx la jornada viva es la que empezó AYER';
  select j.fecha into v_date from turno_jornada_ahora(p_due) j;
  if v_date = v_ayer then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - devolvió '||coalesce(v_date::text,'(ninguna)')
                     ||', ayer es '||v_ayer::text; end if;

  n:=n+1; c:='el día de trabajo al que se apuntan los cambios es ayer';
  if turno_dia_laboral(p_due) = v_ayer then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||turno_dia_laboral(p_due)::text; end if;

  n:=n+1; c:='en el local de mediodía, el día de trabajo es hoy';
  if turno_dia_laboral(p_due2) = (now() at time zone v_tz2)::date then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ 4. EL FALLO QUE DIO ORIGEN A TODO ═════════════════════════════════════
  n:=n+1; c:='LA FILA ESTÁ ABIERTA a la 01:xx con horario 21:00-03:00';
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  n:=n+1; c:='el local entero figura abierto, no solo la silla';
  select turno_fila_abierta(null, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  n:=n+1; c:='y el cliente puede entrar de verdad en esa fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
    if r.id is not null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - no devolvió turno'; end if;
  exception when others then
    fallos:=fallos||E'\n  x '||c||' - '||sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);

  n:=n+1; c:='el local de mediodía sigue abierto a mediodía';
  select turno_fila_abierta(p_due2, v_neg2) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  -- ══ 5. ALARGAR PASA DE LA MEDIANOCHE ══════════════════════════════════════
  -- Antes topaba en las 23:59: el barbero que sigue trabajando a la una no
  -- tenía forma de anunciarlo.
  n:=n+1; c:='alargar dos horas lleva el final a las 05:00, no a las 23:59';
  select turno_alargar_jornada(p_due, 120) into v_fin;
  if v_fin = time '05:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_fin::text,'(nada)'); end if;

  n:=n+1; c:='y ese cambio se apunta en AYER, que es la jornada que está viva';
  select j.hora_fin into v_fin from turno_jornadas j where j.perfil_id = p_due and j.fecha = v_ayer;
  if v_fin = time '05:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - en ayer hay '||coalesce(v_fin::text,'(nada)'); end if;

  n:=n+1; c:='tras alargar, la jornada sigue declarándose cruzada';
  select j.cruza into v_cruza from turno_jornada_de(p_due, v_ayer) j;
  if v_cruza then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='alargar NO toca el horario semanal';
  select h.hora_fin into v_fin from turno_horarios h
   where h.perfil_id = p_due and h.dia_semana = extract(dow from v_ayer);
  if v_fin = time '03:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el horario quedó en '||coalesce(v_fin::text,'(nada)'); end if;

  -- ══ 6. «YA CIERRO POR HOY» A LA UNA DE LA MADRUGADA ═══════════════════════
  n:=n+1; c:='cerrar a la 01:xx escribe en ayer y deja la fila cerrada';
  perform turno_cerrar_jornada(p_due);
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is not null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - la fila siguió abierta'; end if;

  n:=n+1; c:='cerrar no inventó una jornada en el día de hoy';
  if not exists (select 1 from turno_jornadas where perfil_id = p_due and fecha = v_hoy) then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ 7. EL DÍA CERRADO SIGUE CERRADO ═══════════════════════════════════════
  n:=n+1; c:='inicio igual a fin sigue queriendo decir «hoy no trabajo»';
  insert into turno_jornadas (perfil_id, fecha, hora_inicio, hora_fin)
  values (p_due2, (now() at time zone v_tz2)::date, time '09:00', time '09:00')
  on conflict (perfil_id, fecha) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin;
  select j.hora_inicio into v_ini from turno_jornada_de(p_due2, (now() at time zone v_tz2)::date) j;
  if v_ini is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - devolvió '||v_ini::text; end if;

  -- ══ 8. EL CÁLCULO CRUDO NO ESTÁ ABIERTO A NADIE ═══════════════════════════
  -- `turno_ventana_cruda` no tiene portero a propósito: la defensa es que no se
  -- le concede a ningún rol. Si alguien le pusiera un grant, esto se pone rojo.
  n:=n+1; c:='turno_ventana_cruda no la puede llamar un autenticado';
  begin
    set local role authenticated;
    perform * from turno_ventana_cruda(p_due, v_ayer);
    reset role;
    fallos:=fallos||E'\n  x '||c||' - la dejó pasar';
  exception when insufficient_privilege then
    reset role; ok:=ok+1;
  when others then
    reset role;
    fallos:=fallos||E'\n  x '||c||' - se negó por otra razón: '||sqlerrm;
  end;

  -- ══ RESULTADO ═════════════════════════════════════════════════════════════
  raise exception E'=== MADRUGADA - % / % casos OK ===%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
