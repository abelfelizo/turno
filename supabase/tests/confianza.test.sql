-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIANZA · Turno
--
-- Las tres cosas que se pidieron desde el teléfono el mismo día y que en el
-- fondo son la misma: quién te atiende y qué se sabe de él.
--
--   · SUSPENDER (migración 81). El dueño para a un empleado sin echarlo. Es
--     distinto de desvincular —el barbero conserva sus clientes, sus citas y su
--     historial— y distinto de "descanso", que se lo pone el barbero a sí mismo
--     y puede quitárselo.
--   · LEER LAS RESEÑAS (migración 82). Estaban escribiéndose desde el principio
--     y no las leía nadie: salía "★ 4.7 (12)" y los comentarios no se veían.
--   · EL BARBERO DE CONFIANZA (migración 83). Nadie dice "voy a cortarme", dice
--     "voy donde Abel". El dato estaba en el historial y no se usaba.
--
-- POR QUÉ ESTÁN JUNTAS. Las tres se cruzan en la misma pregunta y el cruce es
-- donde están los errores de verdad: si tu barbero de confianza está suspendido,
-- la fila NO puede asignártelo, y tiene que decir por qué con las palabras que
-- escribió el dueño. Ese caso no lo prueba ninguna de las tres por separado.
--
-- LO QUE MÁS SE COMPRUEBA AQUÍ: que ser cliente fijo de alguien decide QUIÉN te
-- atiende y no CUÁNDO. Un preferido que adelantara en la fila convertiría la
-- fila digital en una lista de amigos, que es exactamente lo que la app existe
-- para evitar.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar, así que los fixtures se crean FUERA. Y
-- set_config/set local role son de la transacción: si se hacen dentro de un
-- bloque que captura, la suplantación se deshace con él.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/confianza.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'CF-' || upper(substr(md5(random()::text),1,5));
  a_due uuid := gen_random_uuid(); a_bar uuid := gen_random_uuid();
  a_bar2 uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  a_cli2 uuid := gen_random_uuid(); a_ext uuid := gen_random_uuid();
  u_due uuid; u_bar uuid; u_bar2 uuid; u_cli uuid; u_cli2 uuid; u_ext uuid;
  v_neg uuid; v_neg2 uuid; p_due uuid; p_bar uuid; p_bar2 uuid; p_ext uuid;
  s_corte uuid; s_corte2 uuid;
  vis_a uuid; vis_b uuid; vis_c uuid; vis_d uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_txt text; v_txt2 text; v_int int; v_int2 int; v_num numeric;
  v_uuid uuid; v_bool boolean;
begin
  -- ── FIXTURES ───────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cd_'||v_cod||'@t.test','',now(),now()),
         (a_bar ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cb_'||v_cod||'@t.test','',now(),now()),
         (a_bar2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c2_'||v_cod||'@t.test','',now(),now()),
         (a_cli ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cc_'||v_cod||'@t.test','',now(),now()),
         (a_cli2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ce_'||v_cod||'@t.test','',now(),now()),
         (a_ext ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cx_'||v_cod||'@t.test','',now(),now());

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Confianza Barber','empleados','DOP',true,'barbero','Duenno','809',
                              2, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Abel Felizo','809');
  p_bar := r.id;
  select id into u_bar from turno_usuarios where auth_id = a_bar;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar2::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Otro Barbero','809');
  p_bar2 := r.id;
  select id into u_bar2 from turno_usuarios where auth_id = a_bar2;

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  -- Los dos síes de la 110: aprobar es una FUNCIÓN, no un update. El CHECK de
  -- turno_perfiles rechaza dejar `aprobado` a true con una firma pendiente.
  perform turno_responder_solicitud(p_bar,  true);
  perform turno_responder_solicitud(p_bar2, true);
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar ,'Corte',30,500,true) returning id into s_corte;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar2,'Corte',30,500,true) returning id into s_corte2;

  -- De 00:01 a 23:59 A PROPÓSITO: lo que se mide aquí es la suspensión y la
  -- preferencia, no la jornada. Con un horario de 08:00 a 21:00 la suite
  -- fallaría sola al correrla de madrugada, contando la hora en vez de la regla.
  -- Quien sí prueba el horario es horarios.test.sql y modo_atencion.test.sql.
  -- El perfil del DUEÑO se queda sin horario a propósito: así "el local está
  -- abierto" depende solo de los dos empleados, que es lo que se manipula.
  -- ON CONFLICT desde la migración 85: el perfil YA nace con una jornada
  -- sembrada de lunes a sábado, así que un INSERT pelado choca con el índice
  -- único (perfil_id, dia_semana). Lo que la suite quiere decir no es "inserta
  -- estas filas" sino "este barbero trabaja a estas horas".
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
  select pf, d, time '00:01', time '23:59', true, 10
    from (values (p_bar), (p_bar2)) x(pf), generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = true, tiempo_entre_clientes = excluded.tiempo_entre_clientes;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Juan Carlos Pérez', '8095551111');
  select id into u_cli from turno_usuarios where auth_id = a_cli;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Ana', '8095552222');
  select id into u_cli2 from turno_usuarios where auth_id = a_cli2;

  -- El local ajeno, para el caso de "ese barbero no trabaja aquí".
  perform set_config('request.jwt.claims', json_build_object('sub', a_ext::text)::text, true);
  perform turno_crear_negocio('Local Ajeno','empleados','DOP',true,'barbero','Extranno','809',
                              2, 10, 5, false, 1, 3, false, true);
  select id into u_ext from turno_usuarios where auth_id = a_ext;
  select id, negocio_id into p_ext, v_neg2 from turno_perfiles where usuario_id = u_ext limit 1;

  n:=n+1; c:='montaje · las dos sillas nacen con la fila abierta';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  select turno_fila_abierta(p_bar, v_neg), turno_fila_abierta(p_bar2, v_neg) into v_txt, v_txt2;
  if v_txt is null and v_txt2 is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' — p_bar: '||coalesce(v_txt,'abierta')
       ||' / p_bar2: '||coalesce(v_txt2,'abierta')||' (sin esto, lo de abajo no prueba nada)'; end if;

  -- ═══ SUSPENDER NO ES ECHAR (migración 81) ═════════════════════════════════

  n:=n+1; c:='suspender · el dueño para a un empleado y el letrero da SU motivo';
  begin
    perform turno_suspender_barbero(p_bar, true, 'de vacaciones hasta el lunes');
    select turno_fila_abierta(p_bar, v_neg) into v_txt;
    if v_txt = 'de vacaciones hasta el lunes' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — el letrero dice "'||coalesce(v_txt,'abierta')||'"'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  -- LA MITAD QUE IMPORTA. Una suspensión que solo apaga la tarjeta en la
  -- pantalla no es una suspensión: el barbero sigue recibiendo trabajo por el
  -- API. La puerta tiene que rebotar, y con las palabras del dueño.
  n:=n+1; c:='suspender · la fila rebota con ese mismo motivo, no con uno genérico';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    fallos:=fallos||E'\n  x '||c||' — entró en la fila de un barbero suspendido';
  exception when others then
    if sqlerrm = 'de vacaciones hasta el lunes' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — rebotó con "'||sqlerrm||'"'; end if;
  end;

  n:=n+1; c:='suspender · el barbero suspendido no acepta trabajo';
  select turno_perfil_acepta(p_bar) into v_bool;
  if v_bool = false then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' — turno_perfil_acepta sigue diciendo que sí'; end if;

  -- El dueño puede suspender sin escribir nada, y entonces la app no puede
  -- enseñar un hueco: hace falta una frase que valga para el cliente.
  n:=n+1; c:='suspender · sin motivo escrito, el letrero dice algo, no null';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_suspender_barbero(p_bar, true, '   ');
    select turno_fila_abierta(p_bar, v_neg) into v_txt;
    if v_txt is not null and length(trim(v_txt)) > 0 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — devolvió '||coalesce('"'||v_txt||'"','null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='suspender · un empleado no puede suspender a un compañero';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar2::text)::text, true);
  begin
    perform turno_suspender_barbero(p_bar, true, 'me cae mal');
    fallos:=fallos||E'\n  x '||c||' — un empleado dejó sin trabajar a otro';
  exception when others then ok:=ok+1; end;

  -- Para cerrar su propia silla el dueño ya tiene "descanso" e "inactivo". Si
  -- pudiera suspenderse, tendría dos interruptores para lo mismo y uno de ellos
  -- —el que solo él puede quitar— se le quedaría puesto sin saber por qué.
  n:=n+1; c:='suspender · el dueño no se suspende a sí mismo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_suspender_barbero(p_due, true, null);
    fallos:=fallos||E'\n  x '||c||' — se apagó su propia silla con la suspensión';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='reactivar · al quitarla vuelve a entrar gente';
  begin
    perform turno_suspender_barbero(p_bar, false, null);
    select turno_fila_abierta(p_bar, v_neg) into v_txt;
    if v_txt is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — sigue diciendo "'||v_txt||'"'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='reactivar · y el motivo viejo no se queda guardado';
  select suspendido_motivo into v_txt from turno_perfiles where id = p_bar;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' — quedó "'||v_txt||'" esperando a la próxima'; end if;

  -- ═══ LAS RESEÑAS SE LEEN (migración 82) ═══════════════════════════════════
  -- Cuatro visitas y cuatro notas: 5, 5, 4 y 1. El promedio es 3.75 -> 3.8, y
  -- el reparto es lo que de verdad se quiere ver: ese 1 no puede desaparecer
  -- detrás de la media.
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_cli , v_neg, p_bar, s_corte, current_date - 40, 500, 'cola_digital') returning id into vis_a;
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_cli , v_neg, p_bar, s_corte, current_date - 30, 500, 'cola_digital') returning id into vis_b;
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_cli2, v_neg, p_bar, s_corte, current_date - 20, 500, 'cola_digital') returning id into vis_c;
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_cli2, v_neg, p_bar, s_corte, current_date - 10, 500, 'cola_digital') returning id into vis_d;

  insert into turno_resenas (visita_id, perfil_id, cliente_id, rating, comentario, created_at) values
    (vis_a, p_bar, u_cli , 5, 'El mejor de la zona' , now() - interval '40 days'),
    (vis_b, p_bar, u_cli , 5, null                  , now() - interval '30 days'),
    (vis_c, p_bar, u_cli2, 4, 'Bien, pero esperé'   , now() - interval '20 days'),
    (vis_d, p_bar, u_cli2, 1, 'No era lo que pedí'  , now() - interval '10 days');

  n:=n+1; c:='reseñas · el promedio cuadra con las notas (5,5,4,1 -> 3.8)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    select x.promedio, x.total into v_num, v_int from turno_resumen_resenas(p_bar) x;
    if v_num = 3.8 and v_int = 4 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — promedio '||coalesce(v_num::text,'NULL')
         ||', total '||coalesce(v_int::text,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='reseñas · el reparto separa los cincos del uno';
  begin
    select x.cinco, x.una into v_int, v_int2 from turno_resumen_resenas(p_bar) x;
    if v_int = 2 and v_int2 = 1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — cinco='||coalesce(v_int::text,'NULL')
         ||' una='||coalesce(v_int2::text,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  -- EL APELLIDO NO SALE. Una reseña firmada con nombre y apellido en una
  -- barbería de barrio identifica a la persona delante de todo el que entre, y
  -- el que puntúa con un 1 no está pidiendo eso.
  n:=n+1; c:='reseñas · se firma con el nombre de pila, sin apellido';
  begin
    select r2.autor into v_txt from turno_resenas_de(p_bar, 20) r2
     where r2.comentario = 'El mejor de la zona';
    if v_txt = 'Juan' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — firmó como "'||coalesce(v_txt,'NULL')||'"'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='reseñas · la más nueva va primera';
  begin
    select r2.rating into v_int from turno_resenas_de(p_bar, 20) r2 limit 1;
    if v_int = 1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — la primera es un '||coalesce(v_int::text,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='reseñas · respeta el límite que se le pide';
  begin
    select count(*) into v_int from turno_resenas_de(p_bar, 2);
    if v_int = 2 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — devolvió '||v_int; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  -- Un barbero recién entrado no tiene reseñas y la pantalla tiene que poder
  -- enseñar algo. Devolver null en el promedio rompería el "★ —".
  n:=n+1; c:='reseñas · un barbero sin ninguna da 0 y no revienta';
  begin
    select x.promedio, x.total into v_num, v_int from turno_resumen_resenas(p_bar2) x;
    if v_num = 0 and v_int = 0 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — promedio '||coalesce(v_num::text,'NULL')
         ||', total '||coalesce(v_int::text,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  -- El motivo entero de la migración: que las lea EL CLIENTE que está
  -- decidiendo con quién sentarse, no solo el dueño.
  n:=n+1; c:='reseñas · el cliente del local SÍ las lee';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  begin
    select count(*) into v_int from turno_resenas_de(p_bar, 20);
    if v_int = 4 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — vio '||v_int||' de 4: se cerró de más'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='reseñas · el propio barbero SÍ lee las suyas';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  begin
    select count(*) into v_int from turno_resenas_de(p_bar, 20);
    if v_int = 4 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — vio '||v_int||' de 4'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — SE CERRÓ DE MÁS: '||sqlerrm; end;

  -- ═══ MI BARBERO (migración 83) ════════════════════════════════════════════

  n:=n+1; c:='preferido · se marca y se lee';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_marcar_preferido(v_neg, p_bar);
    select turno_mi_preferido(v_neg) into v_uuid;
    if v_uuid = p_bar then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — leyó '||coalesce(v_uuid::text,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='preferido · no se marca a un barbero de OTRO local';
  begin
    perform turno_marcar_preferido(v_neg, p_ext);
    fallos:=fallos||E'\n  x '||c||' — la membresía quedó apuntando fuera del local';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='preferido · el intento fallido no borró el que ya tenía';
  select turno_mi_preferido(v_neg) into v_uuid;
  if v_uuid = p_bar then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' — quedó en '||coalesce(v_uuid::text,'NULL'); end if;

  -- EL CASO DEL PEDIDO. "Cualquiera disponible" deja de ser un desconocido.
  n:=n+1; c:='preferido · la fila sin barbero elegido se la da al suyo';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', null);
    if r.perfil_id = p_bar then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — le tocó '||coalesce(r.perfil_id::text,'nadie'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;
  update turno_cola set estado = 'abandonado' where negocio_id = v_neg and estado = 'en_fila';

  -- Y ESTA ES LA REGLA QUE SOSTIENE LA FILA. Ser cliente fijo decide quién te
  -- atiende, no cuándo: si adelantara, la fila digital sería una lista de
  -- amigos y no habría ninguna razón para usarla.
  n:=n+1; c:='preferido · NO adelanta a nadie en la fila';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    v_uuid := r.id;
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', null);
    select turno_puesto(r.id) into v_int;
    if r.prioridad = 2 and v_int = 2 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — prioridad '||r.prioridad||', puesto '
         ||coalesce(v_int::text,'NULL')||' entrando el segundo'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;
  update turno_cola set estado = 'abandonado' where negocio_id = v_neg and estado = 'en_fila';

  -- ELEGIR A OTRO NO PUEDE SER MÁS DIFÍCIL QUE NO TENER PREFERIDO. Si el
  -- cliente manda un barbero, esa es la respuesta y el preferido no se mira.
  n:=n+1; c:='preferido · elegir a otro manda sobre la preferencia';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte2, 'digital', p_bar2);
    if r.perfil_id = p_bar2 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — le puso a '||coalesce(r.perfil_id::text,'nadie'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;
  update turno_cola set estado = 'abandonado' where negocio_id = v_neg and estado = 'en_fila';

  -- EL CRUCE DE LAS TRES MIGRACIONES, que es lo que ninguna prueba por
  -- separado: el preferido está suspendido. "Intentar" es la palabra correcta —
  -- se intenta, no se puede, y la fila sigue funcionando sin barbero asignado
  -- en vez de rebotar. El cliente pidió "cualquiera disponible".
  n:=n+1; c:='preferido · si está suspendido, entra sin barbero en vez de rebotar';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_suspender_barbero(p_bar, true, 'suspendido hoy');
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte2, 'digital', null);
    if r.perfil_id is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — se lo asignó a '||r.perfil_id::text; end if;
  exception when others then
    fallos:=fallos||E'\n  x '||c||' — rebotó: "'||sqlerrm||'" (el local sigue abierto con la otra silla)';
  end;
  update turno_cola set estado = 'abandonado' where negocio_id = v_neg and estado = 'en_fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_suspender_barbero(p_bar, false, null);

  -- Lo mismo con el descanso, que es el interruptor del barbero y no el del
  -- dueño: el camino de vuelta tiene que ser el mismo.
  n:=n+1; c:='preferido · si está en descanso, tampoco se fuerza';
  update turno_perfiles set estado_actual = 'descanso' where id = p_bar;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte2, 'digital', null);
    if r.perfil_id is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — se lo asignó a '||r.perfil_id::text; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — rebotó: "'||sqlerrm||'"'; end;
  update turno_cola set estado = 'abandonado' where negocio_id = v_neg and estado = 'en_fila';
  update turno_perfiles set estado_actual = 'disponible' where id = p_bar;

  n:=n+1; c:='preferido · se quita con null y vuelve a ser "cualquiera"';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_marcar_preferido(v_neg, null);
    select turno_mi_preferido(v_neg) into v_uuid;
    if v_uuid is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — sigue siendo '||v_uuid::text; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  n:=n+1; c:='preferido · quitado, la fila deja de asignárselo';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', null);
    if r.perfil_id is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' — le siguió poniendo a '||r.perfil_id::text; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' — '||sqlerrm; end;

  -- ── RESULTADO (el RAISE revierte todos los fixtures) ──────────────────────
  raise exception E'\n═══ CONFIANZA · % / % casos OK ═══%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
