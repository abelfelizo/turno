-- ─────────────────────────────────────────────────────────────────────────────
-- EL SIN CITA, LA FILA Y EL RELOJ · Turno
--
-- Tres cosas que el piloto encontró el mismo día y que resultaron ser la misma
-- clase de fallo: piezas que por separado hacían lo suyo y juntas se
-- contradecían.
--
--   1. ATENDER SIN CITA NO ERA ATENDER (migración 66). Metía un BLOQUEO en la
--      agenda en vez de un turno en la cola. Lo que se veía: al terminar el
--      bloqueo seguía ahí, y el rato aparecía en "HORAS BLOQUEADAS" como si el
--      barbero se lo hubiera cogido libre. Lo que no se veía y costaba dinero:
--      las visitas se registran con un trigger sobre turno_cola —cuando un
--      turno pasa a 'atendido'— así que ese corte NUNCA se contaba. Ni en las
--      cuentas del día, ni en las estadísticas, ni como punto de fidelidad.
--      En la base del piloto había dos cortes así.
--
--   2. LA FILA NO EXISTÍA PARA LA AGENDA (migración 67). El primer hueco
--      reservable era `ahora + anticipación`, sin mirar quién está esperando.
--      Con cinco en la fila y tres horas por delante, la app ofrecía cita para
--      dentro de una hora. El cliente llegaba puntual a una cita imposible y el
--      barbero quedaba mal por una promesa que hizo la app.
--
--   3. EL RELOJ CORRÍA A OSCURAS (migración 68). turno_llamar_siguiente lleva
--      desde siempre poniendo `expira_at`, pero ninguna pantalla lo enseñaba, y
--      el cliente no tenía forma de decir "ya estoy aquí" — solo "voy en
--      camino", que no sirve a quien ya está en la puerta y a quien el reloj le
--      seguía corriendo igual.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Los datos se crean fuera.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/sin_cita.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'SC-' || upper(substr(md5(random()::text),1,5));
  a_bar uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid(); a uuid;
  u_bar uuid; u_cli uuid; v_neg uuid; p_bar uuid; s_corte uuid; r record; q uuid;
  n int := 0; ok int := 0; fallos text := ''; c text;
  v_int int; v_txt text; v_carga int; v_prim time;
  v_tz text := 'America/Santo_Domingo'; v_ahora timestamp; i int;
  v_exp timestamptz; v_llego timestamptz;
begin
  v_ahora := (now() at time zone v_tz);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sb_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sc_'||v_cod||'@t.test','',now(),now());

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  -- Anticipación mínima de 1 hora: es el número del caso que reportó el piloto.
  perform turno_crear_negocio('SinCita Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_bar from turno_usuarios where auth_id = a_bar;
  select id, negocio_id into p_bar, v_neg from turno_perfiles where usuario_id = u_bar limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  -- Corte de 36 min: cinco en la fila son exactamente 180 minutos, 3 horas.
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar,'Corte',36,500,true) returning id into s_corte;
  -- Abierto de par en par: así lo que corte los huecos nunca es el cierre.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_bar, d, time '00:01', time '23:59', true, 0 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = true, tiempo_entre_clientes = 0;

  -- ══ 1 · EL SIN CITA ES UN CLIENTE (migración 66) ═══════════════════════════

  n:=n+1; c:='sin cita · con la fila vacía entra y queda EN LA SILLA';
  begin
    select * into r from turno_atender_sin_cita(v_neg, p_bar, s_corte, 'Juan De Paso', '');
    q := r.id;
    if r.estado = 'atendiendo' and r.tipo_cola = 'fisica' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - estado '||coalesce(r.estado,'?'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='sin cita · NO deja ningún bloqueo en la agenda';
  select count(*) into v_int from turno_bloqueos where perfil_id = p_bar;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' bloqueos'; end if;

  n:=n+1; c:='sin cita · no se puede sentar a otro con la silla ocupada';
  begin
    perform turno_atender_sin_cita(v_neg, p_bar, s_corte, 'Otro', '');
    fallos:=fallos||E'\n  x '||c||' - se sentaron dos';
  exception when others then ok:=ok+1; end;

  -- ESTE es el caso que justifica la migración entera.
  n:=n+1; c:='sin cita · al terminar SÍ se registra la visita (o sea: el dinero)';
  update turno_cola set estado = 'atendido', atendido_at = now() where id = q;
  select count(*) into v_int from turno_historial_visitas
   where perfil_id = p_bar and origen = 'cola_fisica';
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' visitas: el corte no se contó'; end if;

  n:=n+1; c:='sin cita · tras terminar no queda nada colgando en la agenda';
  select count(*) into v_int from turno_bloqueos where perfil_id = p_bar;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó '||v_int||' bloqueo'; end if;

  n:=n+1; c:='sin cita · no ensucia la cartera de clientes del local';
  if exists (select 1 from turno_clientes_del_local(v_neg) x where x.nombre = 'Juan De Paso')
    then fallos:=fallos||E'\n  x '||c;
  else ok:=ok+1; end if;

  n:=n+1; c:='sin cita · la puerta vieja (ocupar_ahora) ya no crea bloqueos fantasma';
  begin
    perform turno_ocupar_ahora(p_bar, s_corte, 'x');
    fallos:=fallos||E'\n  x '||c||' - siguió funcionando';
  exception when others then ok:=ok+1; end;

  -- ══ 2 · LA FILA SE COME LA AGENDA (migración 67) ═══════════════════════════

  n:=n+1; c:='sin fila · el primer hueco respeta la antelación de 1 h';
  select count(*), min(s) into v_int, v_prim from turno_slots_disponibles(p_bar, v_ahora::date, s_corte) s;
  if v_int > 0 and v_prim >= (v_ahora + interval '1 hour')::time then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos, primero '||coalesce(v_prim::text,'-'); end if;

  -- Cinco esperando × 36 min = 180 min. El caso literal del piloto.
  for i in 1..5 loop
    a := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
    values (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f'||i||'_'||v_cod||'@t.test','',now(),now());
    perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
    perform turno_unirse_cliente(v_cod, 'Cliente '||i, '829');
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  n:=n+1; c:='fila · la carga son las 3 horas que de verdad se esperan';
  select turno_carga_de_fila(p_bar) into v_carga;
  if v_carga = 180 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - dio '||coalesce(v_carga::text,'?')||' min'; end if;

  n:=n+1; c:='fila · con 3 h por delante NO se ofrece hueco dentro de esas 3 h';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_ahora::date, s_corte) s
   where s < (v_ahora + interval '180 min')::time;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos ofrecidos encima de la fila'; end if;

  -- Cerrar de más también rompe: la fila retrasa el día, no lo cancela.
  n:=n+1; c:='fila · pero la agenda de hoy NO se cierra entera';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_ahora::date, s_corte) s;
  if v_int > 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se cerró el día'; end if;

  n:=n+1; c:='fila · MAÑANA no se ve afectado por la fila de hoy';
  select count(*) into v_int from turno_slots_disponibles(p_bar, v_ahora::date + 1, s_corte) s
   where s < time '06:00';
  if v_int > 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - la fila de hoy cerró la madrugada de mañana'; end if;

  -- Una regla que solo vive en la lista de huecos es una regla que solo vive en
  -- la interfaz: con la pantalla abierta desde hace media hora se reservaría.
  -- La fila SIN barbero asignado también ocupa a alguien (migración 69). Nadie
  -- lo reportó: hoy no se puede disparar porque ningún local tiene activado
  -- "el dueño asigna". Es la trampa puesta para el día que alguien lo active,
  -- y hasta la 69 esos turnos no contaban para NADIE — la carga daba 0 y la
  -- agenda volvía a ofrecer citas por encima de una fila llena.
  n:=n+1; c:='fila · un turno SIN barbero asignado también suma a la carga';
  a := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sx_'||v_cod||'@t.test','',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Sin Asignar', '829');
  perform turno_entrar_a_cola(v_neg, s_corte, 'digital', null);
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  select turno_carga_de_fila(p_bar) into v_int;
  -- Una sola silla en este local: el suelto se lo come entero. 180 + 36.
  if v_int = 216 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - dio '||coalesce(v_int::text,'?')||' (esperaba 216)'; end if;

  n:=n+1; c:='fila · reservar directo TAMBIÉN se niega, no solo la lista';
  begin
    perform turno_agendar_cita(p_bar, s_corte, v_ahora::date, (v_ahora + interval '70 min')::time);
    fallos:=fallos||E'\n  x '||c||' - la reserva pasó igualmente';
  exception when others then
    if sqlerrm like '%fila%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - se negó por otra razón: '||sqlerrm; end if;
  end;

  -- 240, no 200: con el turno suelto del caso anterior la carga es 216 min.
  -- Este número tiene que ir detrás de la carga real, no de la que había cuando
  -- se escribió el caso — si no, la prueba se rompe sola al añadir una regla.
  n:=n+1; c:='fila · pasada la fila, SÍ deja reservar';
  begin
    perform turno_agendar_cita(p_bar, s_corte, v_ahora::date, (v_ahora + interval '240 min')::time);
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ══ 3 · TE TOCA, Y EL RELOJ CORRE (migración 68) ═══════════════════════════

  n:=n+1; c:='llamar · arranca la cuenta atrás (expira_at)';
  select * into r from turno_llamar_siguiente(v_neg, p_bar);
  q := r.id;
  if q is not null and r.expira_at is not null and r.expira_at > now() then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - expira_at '||coalesce(r.expira_at::text,'NULL'); end if;
  v_exp := r.expira_at;

  n:=n+1; c:='esperar · +5 min mueve el reloj hacia adelante';
  select * into r from turno_dar_mas_tiempo(q, 5);
  if r.expira_at > v_exp then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - no se movió'; end if;

  n:=n+1; c:='esperar · no acepta cualquier número';
  begin
    perform turno_dar_mas_tiempo(q, 500);
    fallos:=fallos||E'\n  x '||c||' - aceptó 500 min';
  exception when others then ok:=ok+1; end;

  -- A quien está de pie en el local no se le expira el turno por un reloj.
  n:=n+1; c:='estoy aquí · apaga el reloj y deja constancia';
  select cliente_id into a from turno_cola where id = q;
  select auth_id into a from turno_usuarios where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  select * into r from turno_ya_llegue(q);
  if r.expira_at is null and r.llego_at is not null and r.estado = 'en_camino' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - expira '||coalesce(r.expira_at::text,'NULL')
       ||' llego '||coalesce(r.llego_at::text,'NULL')||' estado '||r.estado; end if;
  v_llego := r.llego_at;

  n:=n+1; c:='estoy aquí · repetirlo no reescribe la hora de llegada';
  perform pg_sleep(0.05);
  select * into r from turno_ya_llegue(q);
  if r.llego_at = v_llego then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='estoy aquí · solo lo dice el dueño del turno';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  begin
    perform turno_ya_llegue(q);
    fallos:=fallos||E'\n  x '||c||' - el barbero lo marcó por él';
  exception when others then ok:=ok+1; end;

  -- Decir que llegaste no te blinda: si te vas, el barbero sigue mandando.
  n:=n+1; c:='ausente · sigue siendo posible tras un "estoy aquí"';
  begin
    perform turno_no_esta(q);
    select estado into v_txt from turno_cola where id = q;
    if v_txt = 'expirado' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_txt,'?'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  raise exception E'\n=== SIN CITA · FILA · RELOJ · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
