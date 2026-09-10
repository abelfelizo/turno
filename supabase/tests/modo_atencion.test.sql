-- ─────────────────────────────────────────────────────────────────────────────
-- CÓMO TE LLEGA EL TRABAJO · Turno
--
-- Del piloto: "botones que definan qué tipo de cola se acepta, así si le
-- simplifica a algunos barberos". No todos trabajan igual: uno de barrio no usa
-- citas en su vida, y otro solo trabaja con hora y no quiere gente sentada
-- esperando.
--
-- Tres modos, en turno_perfiles.modo_atencion (migración 70):
--
--   ambos       · citas y fila, como hasta ahora
--   solo_citas  · agenda abierta, fila cerrada
--   solo_fila   · fila abierta, agenda cerrada
--
-- LO QUE ESTA SUITE VIGILA DE VERDAD no es que los modos funcionen —eso es lo
-- fácil— sino que no se coman una regla que ya existía. La comprobación del modo
-- se enganchó en turno_perfil_acepta, que es la misma función por la que pasa el
-- DESCANSO (migración 56: cierra la fila de hoy, NO la agenda futura). La
-- versión original terminaba así:
--
--     if v_est = 'descanso' then return p_fecha is not null; end if;
--
-- Ese `return` se habría llevado por delante la comprobación del modo: un
-- barbero 'solo_fila' que además estuviera en descanso habría vuelto a aceptar
-- citas. Por eso los cuatro últimos casos cruzan descanso con modo en las dos
-- direcciones.
--
-- OJO al escribirla: la limpieza entre casos se hace con DELETE, no llamando a
-- turno_sacar_de_cola. Esa función es del BARBERO, y estos casos impersonan al
-- CLIENTE: usarla mezclaba dos permisos y hacía fallar el caso por una razón
-- que no era la que se estaba probando.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/modo_atencion.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'MO-' || upper(substr(md5(random()::text),1,5));
  a_bar uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  u_bar uuid; v_neg uuid; p_bar uuid; s_corte uuid; r record;
  n int := 0; ok int := 0; fallos text := ''; c text; v_int int;
  v_manana date; v_ahora timestamp; v_dow int; v_ini time; v_fin time;
begin
  v_ahora  := (now() at time zone 'America/Santo_Domingo');
  v_manana := v_ahora::date + 1;
  v_dow    := extract(dow from v_ahora);
  -- Una ventana que CONTIENE la hora actual, sea cual sea. El horario estaba
  -- fijo en 08:00–20:00, y desde la migración 72 la fila respeta el horario:
  -- corriendo esta suite a las siete de la mañana habría fallado sola. Es el
  -- mismo error que ya salió en horarios — una prueba que enseña la hora en vez
  -- de la regla — y se arregla igual: anclando el fixture a `now`.
  v_ini := greatest(time '00:00', (v_ahora - interval '2 hour')::time);
  v_fin := least(time '23:59',   (v_ahora + interval '2 hour')::time);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mb_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc_'||v_cod||'@t.test','',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  perform turno_crear_negocio('Modo Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_bar from turno_usuarios where auth_id = a_bar;
  select id, negocio_id into p_bar, v_neg from turno_perfiles where usuario_id = u_bar limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar,'Corte',30,500,true) returning id into s_corte;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_bar, d, v_ini, v_fin, true, 0 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Modo', '829');
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  -- ── AMBOS: el comportamiento de siempre, que no debe cambiar ──────────────
  n:=n+1; c:='ambos · hay huecos en la agenda';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_manana, s_corte) s;
  if v_int > 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='ambos · se puede entrar a la fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    ok:=ok+1;
    delete from turno_cola where id = r.id;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── SOLO CITAS ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_perfiles set modo_atencion = 'solo_citas' where id = p_bar;

  n:=n+1; c:='solo citas · la agenda SIGUE abierta';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_manana, s_corte) s;
  if v_int > 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - se cerró de más'; end if;

  n:=n+1; c:='solo citas · NO se puede entrar a la fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    fallos:=fallos||E'\n  x '||c||' - entró igualmente';
  exception when others then ok:=ok+1; end;

  -- Cerrar la fila al cliente no es decirle al barbero cómo trabajar: si tiene
  -- a alguien delante y un hueco, lo sienta.
  n:=n+1; c:='solo citas · el barbero SÍ puede sentar a alguien sin cita';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  begin
    select * into r from turno_atender_sin_cita(v_neg, p_bar, s_corte, 'De Paso', '');
    update turno_cola set estado='atendido', atendido_at=now() where id = r.id;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── SOLO FILA ─────────────────────────────────────────────────────────────
  update turno_perfiles set modo_atencion = 'solo_fila' where id = p_bar;

  n:=n+1; c:='solo fila · la agenda NO ofrece huecos';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_manana, s_corte) s;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos'; end if;

  -- Una regla que solo vive en la lista de huecos no es una regla.
  n:=n+1; c:='solo fila · reservar directo TAMBIÉN se niega';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_agendar_cita(p_bar, s_corte, v_manana, time '10:00');
    fallos:=fallos||E'\n  x '||c||' - la reserva pasó';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='solo fila · entrar a la fila SÍ funciona';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    ok:=ok+1;
    delete from turno_cola where id = r.id;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── EL CRUCE CON EL DESCANSO, QUE ES LO QUE DE VERDAD SE VIGILA ───────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_perfiles set estado_actual = 'descanso' where id = p_bar;

  n:=n+1; c:='descanso + solo fila · el descanso NO reabre la agenda';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_manana, s_corte) s;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos'; end if;

  update turno_perfiles set modo_atencion = 'ambos' where id = p_bar;

  n:=n+1; c:='descanso + ambos · la agenda futura SIGUE abierta (regla 56 intacta)';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_manana, s_corte) s;
  if v_int > 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - se rompió el descanso'; end if;

  n:=n+1; c:='descanso + ambos · la fila de ahora sigue cerrada';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    fallos:=fallos||E'\n  x '||c||' - entró en descanso';
  exception when others then ok:=ok+1; end;

  -- ── LA FILA ABRE Y CIERRA CON EL LOCAL (migración 72) ─────────────────────
  -- Encontrado adaptando la interfaz a los modos, y reproducido antes de
  -- arreglarlo: con los siete días INACTIVOS y a las 06:33 de la mañana, un
  -- cliente entraba a la fila igual. turno_entrar_a_cola no miraba el horario.
  -- Con el modo "solo fila" ese agujero deja de ser teórico, porque ahí el
  -- horario es lo único que define la jornada.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_perfiles set estado_actual = 'disponible', modo_atencion = 'ambos' where id = p_bar;

  n:=n+1; c:='horario · con el día cerrado NO se entra a la fila';
  update turno_horarios set activo = false where perfil_id = p_bar and dia_semana = v_dow;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    fallos:=fallos||E'\n  x '||c||' - entró con el local cerrado';
  exception when others then
    if sqlerrm like '%hoy no trabaja%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='horario · fuera de hora tampoco, y el mensaje DICE el horario';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_horarios set activo = true, hora_inicio = time '00:01', hora_fin = time '00:02'
   where perfil_id = p_bar and dia_semana = v_dow;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    fallos:=fallos||E'\n  x '||c||' - entró fuera de hora';
  exception when others then
    if sqlerrm like '%00:01%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - sin horario en el mensaje: '||sqlerrm; end if;
  end;

  -- Cerrar de más también rompe: dentro de hora tiene que seguir funcionando.
  n:=n+1; c:='horario · DENTRO de hora SÍ se entra';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_horarios set hora_inicio = v_ini, hora_fin = v_fin
   where perfil_id = p_bar and dia_semana = v_dow;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    ok:=ok+1;
    delete from turno_cola where id = r.id;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  -- Y el barbero sigue mandando en su silla: si trabaja fuera de su horario
  -- declarado es asunto suyo, y la app no está para decirle que no puede.
  n:=n+1; c:='horario · el barbero SÍ puede sentar a alguien con el local cerrado';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_horarios set activo = false where perfil_id = p_bar;
  begin
    select * into r from turno_atender_sin_cita(v_neg, p_bar, s_corte, 'De Paso 2', '');
    update turno_cola set estado='atendido', atendido_at=now() where id = r.id;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  raise exception E'\n=== MODO DE ATENCIÓN · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
