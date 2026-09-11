-- ─────────────────────────────────────────────────────────────────────────────
-- LA JORNADA DE HOY · Turno
--
-- Del piloto en el teléfono: «cuando la barbería cerró le di a sentar un
-- cliente, lo aceptó y luego lo cerró. Es normal que barberos decidan extender
-- su horario». Dos cosas distintas, y las dos se prueban aquí:
--
--   · QUE EL BARBERO PUEDA SENTAR A ALGUIEN CON EL LOCAL CERRADO NO ES UN FALLO
--     y esta suite lo fija como regla. La silla es suya y quien tiene delante se
--     corta, esté el letrero como esté. Lo que faltaba era decirlo en pantalla.
--   · ALARGAR EL DÍA (migración 87). El horario semanal es la norma, pero una
--     barbería cierra cuando se va el último. Antes, para seguir recibiendo
--     gente por la app después de la hora había que cambiar el horario del
--     martes PARA SIEMPRE, cosa que nadie hace a las nueve de la noche.
--
-- LO QUE MÁS IMPORTA COMPROBAR es que alargar NO TOCA el horario semanal. Si lo
-- machacara, la excepción de una noche se convertiría en la norma y al día
-- siguiente el barbero no sabría por qué su horario cambió solo.
--
-- El fixture monta a propósito una jornada QUE YA CERRÓ —de 00:01 a hace una
-- hora— para poder mirar el caso real a cualquier hora del día.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/jornada.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  u_due uuid; u_cli uuid; v_neg uuid; p_due uuid; s_corte uuid;
  v_cod text := 'JO-' || upper(substr(md5(random()::text),1,5));
  v_tz text := 'America/Santo_Domingo'; v_ahora timestamp; v_hoy date; v_dow int;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_txt text; v_int int; v_fin time; abiertas text := '';
begin
  v_ahora := (now() at time zone v_tz); v_hoy := v_ahora::date; v_dow := extract(dow from v_ahora);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','jd_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','jc_'||v_cod||'@t.test','',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Jornada Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_due,'Corte',30,500,true) returning id into s_corte;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Jornada', '829');
  select id into u_cli from turno_usuarios where auth_id = a_cli;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);

  -- Una jornada QUE YA CERRÓ, sea la hora que sea cuando se corra esto.
  -- ON CONFLICT porque desde la migración 85 el perfil nace con jornada sembrada.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_due, d, time '00:01', greatest(time '00:02', (v_ahora - interval '1 hour')::time), true, 0
      from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  -- ══ EL LOCAL CERRADO ══════════════════════════════════════════════════════
  n:=n+1; c:='cerrado · el letrero lo dice';
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt like 'ahora está cerrado%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||coalesce(v_txt,'abierta')||'"'; end if;

  n:=n+1; c:='cerrado · el cliente NO puede entrar a la fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
    fallos:=fallos||E'\n  x '||c||' - entró con el local cerrado';
  exception when others then ok:=ok+1; end;

  -- LA REGLA, FIJADA. Que el barbero pueda sentar a alguien con el local
  -- cerrado es deliberado desde la migración 70 y aquí queda por escrito: si
  -- algún día alguien "arregla" esto cerrándolo, este caso se pone rojo.
  n:=n+1; c:='cerrado · pero el barbero SÍ puede sentar a quien tiene delante';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    select * into r from turno_atender_sin_cita(v_neg, p_due, s_corte, 'De Paso', '');
    update turno_cola set estado='atendido', atendido_at=now() where id = r.id;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ══ ALARGAR ═══════════════════════════════════════════════════════════════
  n:=n+1; c:='alargar · devuelve una hora de cierre por delante de ahora';
  select turno_alargar_jornada(p_due, 60) into v_fin;
  if v_fin > v_ahora::time then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - dejó el cierre en '||coalesce(v_fin::text,'NULL'); end if;

  n:=n+1; c:='alargar · la fila vuelve a estar abierta';
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  n:=n+1; c:='alargar · y el cliente ya puede entrar';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
    ok:=ok+1;
    update turno_cola set estado='abandonado' where id = r.id;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- EL CASO QUE JUSTIFICA LA TABLA APARTE.
  n:=n+1; c:='alargar · NO toca el horario semanal';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  select hora_fin into v_fin from turno_horarios where perfil_id = p_due and dia_semana = v_dow;
  if v_fin <= v_ahora::time then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el horario de siempre quedó en '||v_fin::text
       ||': la excepción de una noche se volvió la norma'; end if;

  n:=n+1; c:='alargar · no se aceptan barbaridades';
  begin
    perform turno_alargar_jornada(p_due, 600);
    fallos:=fallos||E'\n  x '||c||' - aceptó 10 horas';
  exception when others then ok:=ok+1; end;

  -- ══ CERRAR ANTES ══════════════════════════════════════════════════════════
  -- La otra mitad: alargar sin poder deshacerlo deja al barbero recibiendo
  -- gente hasta la hora que puso aunque se haya ido a su casa.
  n:=n+1; c:='cerrar · "ya cierro" apaga la fila al momento';
  perform turno_cerrar_jornada(p_due);
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt like 'ahora está cerrado%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||coalesce(v_txt,'sigue abierta')||'"'; end if;

  n:=n+1; c:='volver a la norma · se borra la excepción de hoy';
  perform turno_jornada_normal(p_due);
  select count(*) into v_int from turno_jornadas where perfil_id = p_due and fecha = v_hoy;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ ABRIR UN DÍA QUE LA NORMA TIENE CERRADO ═══════════════════════════════
  -- El domingo de diciembre. La excepción vale en las dos direcciones.
  n:=n+1; c:='abrir · un día cerrado en la norma se puede abrir solo hoy';
  update turno_horarios set activo = false where perfil_id = p_due and dia_semana = v_dow;
  insert into turno_jornadas (perfil_id, fecha, hora_inicio, hora_fin)
  values (p_due, v_hoy, time '00:01', time '23:59')
  on conflict (perfil_id, fecha) do update set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin;
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  -- La fila y la agenda tienen que decir lo mismo: dejar una abierta y la otra
  -- cerrada es volver a tener dos relojes, que es lo que quitó la migración 78.
  n:=n+1; c:='abrir · y la agenda de hoy ofrece huecos otra vez';
  select count(*) into v_int from turno_slots_disponibles(p_due, v_hoy, s_corte) s;
  if v_int > 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - 0 huecos con el día abierto a mano'; end if;

  -- ══ LAS PUERTAS ═══════════════════════════════════════════════════════════
  n:=n+1; c:='puerta · un cliente no puede alargarle la jornada al barbero';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_alargar_jornada(p_due, 60);
    fallos:=fallos||E'\n  x '||c||' - le movió el cierre a otro';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='puerta · ni cerrársela';
  begin
    perform turno_cerrar_jornada(p_due);
    fallos:=fallos||E'\n  x '||c||' - le cerró la fila a otro';
  exception when others then ok:=ok+1; end;

  -- LAS CUATRO, NO UNA. En la primera corrida esta comprobación solo miraba
  -- `alargar` y la red de puertas.test.sql encontró al instante lo que se me
  -- había escapado: turno_jornada_de le contestaba a un anónimo. No se escapaba
  -- gran cosa —las horas de una barbería están en la puerta de la calle— pero
  -- devolver algo y negarse se parecen mientras la consulta funcione, que es
  -- justo la lección de la migración 84.
  n:=n+1; c:='puerta · un anónimo no llega a ninguna de las cuatro';
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  begin perform turno_alargar_jornada(p_due, 30); abiertas := abiertas||' alargar';    exception when others then null; end;
  begin perform turno_cerrar_jornada(p_due);      abiertas := abiertas||' cerrar';     exception when others then null; end;
  begin perform turno_jornada_normal(p_due);      abiertas := abiertas||' normal';     exception when others then null; end;
  begin perform turno_jornada_de(p_due, v_hoy);   abiertas := abiertas||' jornada_de'; exception when others then null; end;
  reset role;
  if abiertas = '' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - abiertas:'||abiertas; end if;

  raise exception E'\n=== JORNADA DE HOY · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
