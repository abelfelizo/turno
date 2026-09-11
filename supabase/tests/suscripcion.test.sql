-- ─────────────────────────────────────────────────────────────────────────────
-- SUSCRIPCIÓN · Turno
--
-- `constants.SUSCRIPCION.dias_prueba = 30` llevaba meses en el repo sin que lo
-- leyera NADIE: ni la app ni la base. Una promesa escrita en un archivo de
-- constantes. Y debajo no había nada más — la base no sabía quién estaba
-- suscrito, ni desde cuándo, ni hasta cuándo. Se podía enseñar el precio, pero
-- no responder a la única pregunta que importa: ¿este local está al día?
--
-- La migración 86 pone ese estado. Esta suite lo prueba, y prueba sobre todo lo
-- que NO hace.
--
-- EL CASO MÁS IMPORTANTE DE AQUÍ ES EL ÚLTIMO: que un local con la suscripción
-- vencida SIGA funcionando. No es un descuido, es la decisión: qué pasa cuando
-- alguien no paga —cerrar la fila, dejar leer pero no atender, dar gracia— es
-- una decisión de producto que nadie ha tomado todavía, y cortarle el local a un
-- barbero un sábado por la mañana por una regla que se coló sin querer sería
-- mucho peor que no cobrar. El día que esa decisión se tome, ESTE caso es el que
-- hay que cambiar a conciencia, y eso es justo lo que se quiere.
--
-- OJO CON LAS FECHAS: `current_date` es UTC, y el local vive en la hora de Santo
-- Domingo (UTC−4). Después de las 20:00 de allá, `current_date` ya es el día
-- siguiente y todas las cuentas salen con un día de más. La suite calcula su
-- propio "hoy" en la zona del local, igual que hace turno_suscripcion.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/suscripcion.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid(); a_ext uuid := gen_random_uuid();
  u_due uuid; u_ext uuid; v_neg uuid; v_neg2 uuid; p_due uuid;
  v_cod text := 'SU-' || upper(substr(md5(random()::text),1,5));
  v_hoy date;
  n int := 0; ok int := 0; fallos text := ''; c text;
  v_int int; v_txt text; v_bool boolean; v_fecha date;
begin
  -- El "hoy" del local, no el de UTC. Ver la nota de arriba.
  v_hoy := (now() at time zone 'America/Santo_Domingo')::date;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','su_'||v_cod||'@t.test','',now(),now()),
         (a_ext,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sx_'||v_cod||'@t.test','',now(),now());

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Suscripcion Barber','empleados','DOP',true,'barbero','Duenno','809',
                              2, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;

  -- ── NACER EN PRUEBA ───────────────────────────────────────────────────────
  n:=n+1; c:='nace · el local recién creado entra en prueba';
  select s.estado, s.al_dia, s.dias_restantes into v_txt, v_bool, v_int from turno_suscripcion(v_neg) s;
  if v_txt = 'prueba' and v_bool and v_int between 29 and 30 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_txt,'?')||' / al_dia '||coalesce(v_bool::text,'?')
       ||' / '||coalesce(v_int::text,'?')||' días'; end if;

  n:=n+1; c:='nace · y cuenta los asientos que cubre';
  select s.asientos into v_int from turno_suscripcion(v_neg) s;
  if v_int >= 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_int::text,'?'); end if;

  n:=n+1; c:='vencida · pasada la prueba sin pagar, deja de estar al día';
  update turno_suscripciones set prueba_hasta = v_hoy - 3 where negocio_id = v_neg;
  select s.estado, s.al_dia, s.dias_restantes into v_txt, v_bool, v_int from turno_suscripcion(v_neg) s;
  if v_txt = 'vencida' and v_bool = false and v_int < 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_txt,'?')||' / '||coalesce(v_int::text,'?'); end if;

  -- ── EL PAGO ───────────────────────────────────────────────────────────────
  -- Nadie escribe todavía `pagada_hasta` desde la app: no hay pasarela. Se
  -- escribe a mano aquí para probar que la lectura ya la entiende, que es lo
  -- único que esta migración promete.
  n:=n+1; c:='pago · una fecha pagada por delante lo pone activa';
  update turno_suscripciones set pagada_hasta = v_hoy + 27 where negocio_id = v_neg;
  select s.estado, s.al_dia, s.dias_restantes into v_txt, v_bool, v_int from turno_suscripcion(v_neg) s;
  if v_txt = 'activa' and v_bool and v_int = 27 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_txt,'?')||' / '||coalesce(v_int::text,'?'); end if;

  -- Quien paga durante la prueba no puede perder los días que le quedaban.
  n:=n+1; c:='pago · manda sobre la prueba aunque la prueba siga viva';
  update turno_suscripciones set prueba_hasta = v_hoy + 5, pagada_hasta = v_hoy + 40 where negocio_id = v_neg;
  select s.hasta into v_fecha from turno_suscripcion(v_neg) s;
  if v_fecha = v_hoy + 40 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - enseña '||coalesce(v_fecha::text,'?'); end if;

  n:=n+1; c:='cortesía · siempre al día, sin fecha';
  update turno_suscripciones set cortesia = true, prueba_hasta = v_hoy - 90, pagada_hasta = null where negocio_id = v_neg;
  select s.estado, s.al_dia into v_txt, v_bool from turno_suscripcion(v_neg) s;
  if v_txt = 'cortesia' and v_bool then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_txt,'?'); end if;

  -- ── LAS PUERTAS ───────────────────────────────────────────────────────────
  -- Cuánto paga un local y desde cuándo debe es de lo más privado que guarda
  -- esta base. Se comprueba por las dos vías: la función y la tabla.
  n:=n+1; c:='puerta · el dueño de OTRO local no la lee';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ext::text)::text, true);
  perform turno_crear_negocio('Local Ajeno','empleados','DOP',true,'barbero','Extranno','809',
                              2, 10, 5, false, 1, 3, false, true);
  select id into u_ext from turno_usuarios where auth_id = a_ext;
  select negocio_id into v_neg2 from turno_perfiles where usuario_id = u_ext limit 1;
  begin
    perform turno_suscripcion(v_neg);
    fallos:=fallos||E'\n  x '||c||' - se llevó la situación de pago de otro local';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='puerta · y por la tabla tampoco (RLS)';
  set local role authenticated;
  select count(*) into v_int from turno_suscripciones where negocio_id = v_neg;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - leyó '||v_int||' filas ajenas'; end if;

  n:=n+1; c:='puerta · un anónimo no llega';
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  begin
    perform turno_suscripcion(v_neg);
    reset role;
    fallos:=fallos||E'\n  x '||c||' - contestó a un anónimo';
  exception when others then reset role; ok:=ok+1; end;

  -- ── Y LO QUE NO HACE ──────────────────────────────────────────────────────
  -- Esta es la trampa puesta a propósito. Si alguien mete una comprobación de
  -- pago en turno_fila_abierta, turno_entrar_a_cola o donde sea, este caso se
  -- pone rojo y obliga a que la decisión se tome mirándola, no de refilón.
  n:=n+1; c:='nadie corta · el local vencido SIGUE funcionando (decisión sin tomar)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_suscripciones set cortesia = false, prueba_hasta = v_hoy - 90, pagada_hasta = null
   where negocio_id = v_neg;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_due, d, time '00:01', time '23:59', true, 0 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se cerró por falta de pago: "'||v_txt
       ||'". Si esto fue a propósito, cambia ESTE caso; si no, alguien metió una '
       ||'regla de cobro sin decidirla'; end if;

  raise exception E'\n=== SUSCRIPCIÓN · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
