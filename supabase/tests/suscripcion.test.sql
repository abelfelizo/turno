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
  -- El local de asientos alquilados y su inquilino, para la parte de la
  -- migración 93: hace falta uno de CADA modalidad para distinguir quién paga.
  a_emp uuid := gen_random_uuid(); a_d2 uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  u_d2 uuid; v_neg3 uuid; v_cod3 text; p_emp uuid; p_d2 uuid; p_ren uuid; s_ren uuid;
  v_q text; r record;
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

  -- ═══ CADA SILLA PAGA LA SUYA (migración 93) ═══════════════════════════════
  --
  -- La 86 puso `negocio_id` de primary key, y con eso el barbero que alquila un
  -- asiento NO EXISTÍA: no había forma de que pagara lo suyo si su local no
  -- paga, ni de que su local pagando le cubriera a él sin cubrir a todos.
  --
  -- La regla nueva tiene la misma forma que R11 y que la 92: **la modalidad del
  -- LOCAL decide**. Asientos alquilados → paga cada silla, la del dueño
  -- incluida si atiende. Empleados → paga el local.
  --
  -- OJO: se mira el TIPO DEL NEGOCIO, no la autonomía de la persona. En un
  -- local de empleados el dueño también es «autónomo» por membresía, y si la
  -- regla mirase eso, acabaría con una suscripción de silla aparte de la de su
  -- propio local. El caso del dueño de empleados está abajo justo para eso.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_emp,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','se_'||v_cod||'@t.test','',now(),now()),
         (a_d2 ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','s2_'||v_cod||'@t.test','',now(),now()),
         (a_ren,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sr_'||v_cod||'@t.test','',now(),now());

  -- Un empleado en el local de empleados de arriba.
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Empleado','809');
  p_emp := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_emp;

  -- Y un local de ASIENTOS ALQUILADOS con su inquilino.
  perform set_config('request.jwt.claims', json_build_object('sub', a_d2::text)::text, true);
  perform turno_crear_negocio('Alquilo Asientos','espacios_rentados','DOP',true,'barbero','Duenno2','809',
                              2, 10, 5, true, 1, 3, false, true);
  select id into u_d2 from turno_usuarios where auth_id = a_d2;
  select id, negocio_id into p_d2, v_neg3 from turno_perfiles where usuario_id = u_d2 limit 1;
  select codigo_acceso into v_cod3 from turno_negocios where id = v_neg3;
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod3,'barbero','barbero_renta','Rentado','809');
  p_ren := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_d2::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_ren;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_ren,'Corte',30,700,true) returning id into s_ren;

  n:=n+1; c:='siembra · toda silla nueva nace con 30 días de prueba';
  select count(*) into v_int from turno_suscripciones_silla
   where perfil_id in (p_due, p_emp, p_d2, p_ren) and prueba_hasta = v_hoy + 30;
  if v_int = 4 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - solo '||v_int||' de 4 sillas la tienen'; end if;

  n:=n+1; c:='quién paga · en ASIENTOS ALQUILADOS paga la silla';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  select s.quien, s.estado, s.al_dia into v_q, v_txt, v_bool from turno_suscripcion_de(p_ren) s;
  if v_q = 'silla' and v_txt = 'prueba' and v_bool then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_q,'?')||' / '||coalesce(v_txt,'?'); end if;

  n:=n+1; c:='quién paga · la silla del DUEÑO de un local de alquiler también es suya';
  perform set_config('request.jwt.claims', json_build_object('sub', a_d2::text)::text, true);
  select s.quien into v_q from turno_suscripcion_de(p_d2) s;
  if v_q = 'silla' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_q,'?')||' (agrupar no cuesta; atender sí)'; end if;

  n:=n+1; c:='quién paga · en un local de EMPLEADOS paga el local';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  select s.quien into v_q from turno_suscripcion_de(p_due) s;
  if v_q = 'local' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_q,'?')
       ||' (si mira la autonomía en vez del tipo del local, sale "silla")'; end if;

  n:=n+1; c:='quién paga · al EMPLEADO se le dice que la cubre su barbería, sin fechas';
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  select s.quien, s.estado, s.hasta into v_q, v_txt, v_fecha from turno_suscripcion_de(p_emp) s;
  if v_q = 'local' and v_txt = 'la_cubre_el_local' and v_fecha is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_q,'?')||' / '||coalesce(v_txt,'?')
       ||' (lo que paga un local no es asunto de sus empleados)'; end if;

  -- ── LAS PUERTAS ───────────────────────────────────────────────────────────
  n:=n+1; c:='puerta · el casero NO lee lo que paga su inquilino';
  perform set_config('request.jwt.claims', json_build_object('sub', a_d2::text)::text, true);
  begin
    perform turno_suscripcion_silla(p_ren);
    fallos:=fallos||E'\n  x '||c||' - se llevó la situación de pago de su inquilino';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='puerta · y por la tabla tampoco (RLS)';
  set local role authenticated;
  select count(*) into v_int from turno_suscripciones_silla where perfil_id = p_ren;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - leyó '||v_int||' filas ajenas'; end if;

  n:=n+1; c:='puerta · pero el dueño de EMPLEADOS sí ve la de su empleado';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_suscripcion_silla(p_emp); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='puerta · un anónimo no llega a la de nadie';
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  begin
    perform turno_suscripcion_de(p_ren); reset role;
    fallos:=fallos||E'\n  x '||c||' - contestó a un anónimo';
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='pago · una fecha pagada por delante pone la silla activa';
  update turno_suscripciones_silla set pagada_hasta = v_hoy + 27 where perfil_id = p_ren;
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  select s.estado, s.dias_restantes into v_txt, v_int from turno_suscripcion_de(p_ren) s;
  if v_txt = 'activa' and v_int = 27 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_txt,'?')||' / '||coalesce(v_int::text,'?'); end if;

  -- LA MISMA TRAMPA QUE ARRIBA, PARA LA SILLA. Si alguien mete una comprobación
  -- de pago en el motor, este caso se pone rojo y obliga a que la decisión se
  -- tome mirándola. Cortarle la silla a un barbero un sábado por una regla que
  -- se coló sin querer es mucho peor que no cobrar.
  n:=n+1; c:='nadie corta · la silla vencida SIGUE trabajando (decisión sin tomar)';
  update turno_suscripciones_silla set pagada_hasta = null, prueba_hasta = v_hoy - 90
   where perfil_id = p_ren;
  select s.al_dia into v_bool from turno_suscripcion_de(p_ren) s;
  begin
    select * into r from turno_atender_sin_cita(v_neg3, p_ren, s_ren, 'De Paso', '');
    update turno_cola set estado='atendido', atendido_at=now() where id = r.id;
    if v_bool = false then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - la suscripción no llegó a vencer: el caso no probaba nada'; end if;
  exception when others then
    fallos:=fallos||E'\n  x '||c||' - dejó de trabajar por no pagar: "'||sqlerrm
         ||'". Si esto fue a propósito, cambia ESTE caso; si no, alguien metió '
         ||'una regla de cobro sin decidirla'; end;

  raise exception E'\n=== SUSCRIPCIÓN · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
