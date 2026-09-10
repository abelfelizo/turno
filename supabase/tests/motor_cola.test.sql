-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBAS DEL MOTOR DE COLA · Turno
--
-- Cubre las invariantes que los tipos NO pueden atrapar: orden de la fila,
-- un-turno-activo-por-tipo (R1), gating de "voy en camino" (R2), límite de
-- fila, orden de llamado, autorización de stats, bajas y citas grupales.
-- También la gestión manual de la fila (mover, llamar a uno, devolver, sacar,
-- y que un cliente no pueda tocar la fila de otro) y la silla ocupada por un
-- cliente sin cita, que tiene que descontarse del ETA.
--
-- CÓMO CORRE: todo ocurre dentro de un bloque que SIEMPRE termina con RAISE,
-- de modo que la transacción se revierte entera. No deja ni un registro en la
-- base (importante: es una BD compartida con otros proyectos). El resultado
-- llega en el mensaje de la excepción.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/motor_cola.test.sql
--       (o pegarlo en el SQL editor de Supabase)
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  -- fixtures
  v_neg uuid; v_cod text := 'TST-' || substr(md5(random()::text), 1, 4);
  a_cli1 uuid := gen_random_uuid(); a_cli2 uuid := gen_random_uuid(); a_bar uuid := gen_random_uuid();
  u_cli1 uuid; u_cli2 uuid; u_bar uuid;
  p_barb uuid; p_mani uuid;
  s_corte uuid; s_unas uuid;
  -- acumuladores
  n int := 0; ok int := 0; fallos text := ''; c text;
  -- scratch
  r record; v_bool boolean; v_int int; v_int2 int; v_uuid uuid; v_uuid2 uuid;
  v_id1 uuid; v_id2 uuid; v_bloq uuid; c2_estado text;
begin
  -- ── FIXTURES ───────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_cli1, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','t1_'||v_cod||'@turno.test','',now(),now()),
         (a_cli2, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2_'||v_cod||'@turno.test','',now(),now()),
         (a_bar , '00000000-0000-0000-0000-000000000000','authenticated','authenticated','tb_'||v_cod||'@turno.test','',now(),now());

  insert into turno_usuarios (nombre, telefono, tipo_usuario, auth_id) values ('Cli Uno','', 'cliente', a_cli1) returning id into u_cli1;
  insert into turno_usuarios (nombre, telefono, tipo_usuario, auth_id) values ('Cli Dos','', 'cliente', a_cli2) returning id into u_cli2;
  insert into turno_usuarios (nombre, telefono, tipo_usuario, auth_id) values ('Barbero','','profesional', a_bar) returning id into u_bar;

  insert into turno_negocios (nombre, tipo, codigo_acceso, moneda, activo)
  values ('Test Barbería','empleados', v_cod, 'DOP', true) returning id into v_neg;

  -- doble_servicio_activo EXPLÍCITO. El fixture no lo ponía y la columna nace
  -- en false, así que desde la migración 49 —que hizo que el interruptor de
  -- verdad restringiera— los casos 3, 4 y 9 fallaban por una razón que no
  -- tenían nada que ver con lo que probaban. Es el defecto del producto (un
  -- local nuevo permite corte + uñas a la vez) puesto donde debe estar.
  insert into turno_configuracion_negocio (negocio_id, anticipacion_minima_horas, ventana_llegada_min, gracia_cita_min, umbral_confirmacion, doble_servicio_activo)
  values (v_neg, 2, 10, 5, 2, true);

  insert into turno_membresias (usuario_id, negocio_id, rol, activo) values
    (u_cli1, v_neg, 'cliente', true), (u_cli2, v_neg, 'cliente', true),
    (u_bar , v_neg, 'empleado', true), (u_bar, v_neg, 'dueno', true);

  insert into turno_perfiles (usuario_id, negocio_id, tipo_servicio, estado_actual, aprobado, activo)
  values (u_bar, v_neg, 'barbero', 'disponible', true, true) returning id into p_barb;
  insert into turno_perfiles (usuario_id, negocio_id, tipo_servicio, estado_actual, aprobado, activo)
  values (u_bar, v_neg, 'manicuri_pedicuri', 'disponible', true, true) returning id into p_mani;

  insert into turno_servicios (perfil_id, nombre, duracion_min, precio, activo)
  values (p_barb,'Corte',30,500,true) returning id into s_corte;
  insert into turno_servicios (perfil_id, nombre, duracion_min, precio, activo)
  values (p_mani,'Uñas',30,700,true) returning id into s_unas;

  -- EL HORARIO VA AQUÍ ARRIBA, Y PARA LAS DOS SILLAS.
  --
  -- Estaba en mitad de la suite (antes del caso 15) y p_mani no tenía ninguno.
  -- Daba igual mientras entrar_a_cola no miraba el horario; desde la migración
  -- 72 lo mira, así que los catorce primeros casos entraban a una fila cerrada
  -- y p_mani no habría podido tener fila en toda la suite.
  --
  -- De 00:01 a 23:59 a propósito: lo que aquí se prueba es el motor de la cola,
  -- no la jornada, y un fixture de 08:00 a 21:00 haría fallar la suite sola al
  -- correrla de madrugada. Quien sí prueba el horario es horarios.test.sql y
  -- modo_atencion.test.sql.
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  select pf, d, time '00:01', time '23:59', true, 10
    from (values (p_barb), (p_mani)) x(pf), generate_series(0,6) d;

  -- ── CASO 1 · entrar a la fila asigna posición 1 y prioridad digital ───────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='entrar a la fila · posición 1, prioridad digital';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    if r.posicion = 1 and r.prioridad = 2 and r.tipo_servicio = 'barbero' and r.estado = 'en_fila'
      then ok:=ok+1;
      else fallos := fallos || E'\n  ✗ '||c||' — pos='||r.posicion||' prio='||r.prioridad||' tipo='||r.tipo_servicio;
    end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 2 · R1: NO se permite un 2º turno del MISMO tipo ─────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='R1 · bloquea segundo turno del mismo tipo';
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    fallos := fallos || E'\n  ✗ '||c||' — permitió un segundo turno de barbero';
  exception when others then
    if sqlerrm like '%ya tienes un turno activo%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;

  -- ── CASO 3 · R1: SÍ se permite un turno de OTRO tipo (barbero + uñas) ─────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='R1 · permite turno simultáneo de otro tipo (uñas)';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_unas, 'digital', p_mani);
    if r.tipo_servicio = 'manicuri_pedicuri' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — tipo='||coalesce(r.tipo_servicio,'null'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 4 · segundo cliente toma la siguiente posición ──────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  n:=n+1; c:='fila · el segundo cliente toma posición 3 (tras 2 activos)';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    if r.posicion = 3 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — posición='||r.posicion||' (esperada 3)'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 5 · R2: con 0 delante y umbral 2, SÍ puede confirmar ────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='R2 · puede confirmar cuando está cerca (0 delante, umbral 2)';
  begin
    select id into v_uuid from turno_cola where cliente_id=u_cli1 and tipo_servicio='barbero' and estado='en_fila';
    v_bool := turno_puede_confirmar(v_uuid);
    if v_bool then ok:=ok+1; else fallos := fallos || E'\n  ✗ '||c||' — devolvió false'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 6 · R2: con umbral 0 y gente delante, NO puede confirmar ────────
  n:=n+1; c:='R2 · bloquea confirmar cuando aún está lejos (umbral 0)';
  begin
    update turno_configuracion_negocio set umbral_confirmacion = 0 where negocio_id = v_neg;
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    select id into v_uuid from turno_cola where cliente_id=u_cli2 and estado='en_fila';
    v_bool := turno_puede_confirmar(v_uuid);
    if not v_bool then ok:=ok+1; else fallos := fallos || E'\n  ✗ '||c||' — devolvió true con gente delante'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 7 · R2: confirmar_camino RECHAZA en servidor (no solo la UI) ────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  n:=n+1; c:='R2 · turno_confirmar_camino rechaza en el servidor';
  begin
    select id into v_uuid from turno_cola where cliente_id=u_cli2 and estado='en_fila';
    perform turno_confirmar_camino(v_uuid);
    fallos := fallos || E'\n  ✗ '||c||' — dejó confirmar estando lejos';
  exception when others then
    if sqlerrm like '%faltan%' or sqlerrm like '%Aún%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;
  update turno_configuracion_negocio set umbral_confirmacion = 2 where negocio_id = v_neg;

  -- ── CASO 8 · orden de llamado: respeta posición ──────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='llamar siguiente · respeta el orden de la fila';
  begin
    select * into r from turno_llamar_siguiente(v_neg, p_barb);
    if r.cliente_id = u_cli1 and r.estado = 'llamado' and r.expira_at is not null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — llamó a otro o no fijó expiración'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 9 · límite de fila del barbero ──────────────────────────────────
  n:=n+1; c:='límite de fila · rechaza cuando el barbero está lleno';
  begin
    update turno_perfiles set limite_cola = 1 where id = p_mani;
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    perform turno_entrar_a_cola(v_neg, s_unas, 'digital', p_mani);  -- ya hay 1 (cli1)
    fallos := fallos || E'\n  ✗ '||c||' — permitió pasar el límite';
  exception when others then
    if sqlerrm like '%fila llena%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;
  update turno_perfiles set limite_cola = null where id = p_mani;

  -- ── CASO 10 · autorización: un cliente NO puede leer stats del negocio ───
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='autorización · stats del negocio negadas a un no-dueño';
  begin
    perform * from turno_stats_periodo_negocio(v_neg, current_date - 30, current_date);
    fallos := fallos || E'\n  ✗ '||c||' — un cliente pudo leer los ingresos del local';
  exception when others then
    if sqlerrm like '%no autorizado%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;

  -- ── CASO 11 · citas grupales (R5): N espacios consecutivos ───────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  n:=n+1; c:='R5 · cita grupal crea N espacios consecutivos con un grupo_id';
  begin
    perform turno_agendar_grupo(p_barb, s_corte, (current_date + 2), '10:00'::time, 3);
    select count(*), count(distinct grupo_id) into v_int, v_int2
      from turno_citas where perfil_id=p_barb and fecha=(current_date+2) and cliente_id=u_cli2;
    if v_int = 3 and v_int2 = 1 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — creó '||v_int||' citas / '||v_int2||' grupos (esperado 3/1)'; end if;
    -- y no deben solaparse: 10:00, 10:30, 11:00
    if not exists (select 1 from turno_citas where perfil_id=p_barb and fecha=(current_date+2) and hora_inicio='11:00')
      then fallos := fallos || E'\n  ✗ '||c||' — los espacios no quedaron consecutivos'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 12 · baja: dejar el local cancela las citas futuras ─────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='ciclo de vida · dejar el local cancela citas futuras';
  begin
    perform turno_dejar_local(p_barb);
    select count(*) into v_int from turno_citas
     where perfil_id=p_barb and fecha=(current_date+2) and estado <> 'cancelada';
    if v_int = 0 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedaron '||v_int||' citas sin cancelar'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- El caso 12 acaba de llamar a dejar_local, que DESAPRUEBA el perfil. Desde la
  -- migración 50 el motor comprueba `aprobado` además de la propiedad, así que
  -- sin restaurarlo aquí los dos casos siguientes mueren con "tu perfil todavía
  -- no está aprobado" — un mensaje que no tiene nada que ver con lo que prueban.
  -- Va JUSTO aquí, no más abajo: los casos 13 y 14 lo necesitan ya.
  update turno_perfiles set activo = true, aprobado = true where id = p_barb;

  -- ── CASO 13 · el walk-in debe rellenar tipo_servicio ─────────────────────
  -- Sin esto R1 no cubre a los clientes sin cita: en Postgres los NULL no
  -- colisionan en un índice único, así que se podrían duplicar sin límite.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='walk-in · rellena tipo_servicio';
  begin
    select * into r from turno_registrar_fisico(v_neg, p_barb, s_corte, 'Sin cita', '');
    if r.tipo_servicio = 'barbero' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — tipo_servicio = '||coalesce(r.tipo_servicio,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 14 · la posición no se recicla al llamar a alguien ──────────────
  -- Antes se calculaba max(posicion)+1 mirando solo 'en_fila': al pasar alguien
  -- a llamado/en_camino el máximo caía y el siguiente reusaba su posición.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='fila · la posición no se recicla tras llamar';
  begin
    perform turno_registrar_fisico(v_neg, p_barb, s_corte, 'Otro sin cita', '');
    select count(*) into v_int from turno_cola
     where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino')
     group by posicion having count(*) > 1 limit 1;
    if v_int is null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — hay posiciones duplicadas en la cola'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── PREPARACIÓN · fila limpia, para la gestión de turnos ────────────────
  update turno_cola set estado = 'atendido'
   where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino','atendiendo');
  update turno_perfiles set activo = true, aprobado = true where id = p_barb;
  -- (el horario se crea arriba, en los fixtures, para las dos sillas)

  -- Los dos turnos se crean AQUÍ, fuera de cualquier begin/exception. Estaban
  -- dentro del bloque del caso 15, y cuando ese bloque capturaba el error,
  -- plpgsql revertía sus propias sentencias: v_id1 y v_id2 quedaban apuntando a
  -- filas que ya no existían y los tres casos siguientes morían con "turno
  -- inexistente". Es la trampa que la cabecera de las otras suites avisa.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb); v_id1 := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb); v_id2 := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  -- ── CASO 15 · el orden de la fila NO se cambia a mano (migración 58) ─────
  -- Este caso decía lo contrario: comprobaba que "subir un puesto" funcionaba.
  -- Y funcionaba, hasta que el piloto lo señaló: "el barbero no puede adelantar
  -- a nadie, eso rompe las reglas". La 58 lo quitó del API, y esta prueba se
  -- quedó defendiendo la regla vieja — que es peor que no tener prueba, porque
  -- da confianza en la dirección equivocada. Ahora prueba la regla de verdad.
  n:=n+1; c:='fila · el orden NO se cambia a mano';
  begin
    perform turno_mover_en_cola(v_id2, -1);
    fallos := fallos || E'\n  x '||c||' - dejó reordenar la fila a dedo';
  exception when others then ok:=ok+1; end;

  -- ── CASO 16 · llamar a uno concreto: solo si es el que toca ──────────────
  n:=n+1; c:='fila · llamar al que SÍ toca funciona';
  begin
    select * into r from turno_llamar_a(v_id1);
    if r.estado = 'llamado' and r.llamado_at is not null then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - estado = '||coalesce(r.estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - excepción: '||sqlerrm;
  end;

  -- La otra mitad de la 58, y la que de verdad importa: llamar al segundo es
  -- adelantar con otro nombre.
  n:=n+1; c:='fila · llamar a uno que NO toca se niega';
  begin
    perform turno_devolver_a_fila(v_id1);
    perform turno_llamar_a(v_id2);
    fallos := fallos || E'\n  x '||c||' - se saltó el orden';
  exception when others then ok:=ok+1; end;
  begin perform turno_llamar_a(v_id1); exception when others then null; end;

  -- ── CASO 17 · devolver a la fila deshace el llamado ──────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='fila · devolver a la fila';
  begin
    select * into r from turno_devolver_a_fila(v_id1);
    if r.estado = 'en_fila' and r.llamado_at is null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedó en '||coalesce(r.estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 18 · sacar de la fila al que se fue del local ───────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='fila · sacar a alguien que se fue';
  begin
    perform turno_sacar_de_cola(v_id1);
    select estado into c2_estado from turno_cola where id = v_id1;
    if c2_estado = 'abandonado' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedó en '||coalesce(c2_estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 19 · un cliente NO puede tocar la fila de otro ──────────────────
  -- Las RPC son SECURITY DEFINER: sin este chequeo cualquiera con sesión podría
  -- sacar de la fila a los clientes de una barbería a la que solo pertenece.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='fila · un cliente no puede sacar a otro';
  begin
    begin
      perform turno_sacar_de_cola(v_id2);
      fallos := fallos || E'\n  ✗ '||c||' — un cliente sacó de la fila a otro';
    exception when others then ok:=ok+1;
    end;
  end;

  -- ── CASOS 20-23 · "SIN CITA", REESCRITOS PARA LA MIGRACIÓN 66 ───────────
  --
  -- Estos tres casos probaban turno_ocupar_ahora, que metía un BLOQUEO en la
  -- agenda en vez de un turno en la cola. Esa función se cerró en la 66 porque
  -- el corte que atendía NUNCA se contaba como dinero: las visitas las registra
  -- un trigger sobre turno_cola, y por la vía del bloqueo no se pasaba por ahí.
  --
  -- Y esta suite se quedó rota desde entonces sin que nadie lo notara, porque
  -- no volví a correrla al cambiar la función. Anotado aquí porque es la misma
  -- lección que en las otras suites: un cambio que cierra una puerta obliga a
  -- correr TODO lo que la usaba, no solo lo que se acaba de escribir.

  -- ── CASO 20 · el sin cita respeta el orden de la fila ────────────────────
  -- Con v_id2 todavía en la fila. Si este caso se ejecutara con la fila vacía
  -- pasaría por la razón equivocada, así que se comprueba primero que hay a
  -- quien saltarse.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='sin cita · con gente esperando, se niega';
  begin
    select count(*) into v_int from turno_cola
     where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino');
    if v_int = 0 then
      fallos := fallos || E'\n  x '||c||' - la fila estaba vacía: el caso no probaba nada';
    else
      perform turno_atender_sin_cita(v_neg, p_barb, s_corte, 'Colado', '');
      fallos := fallos || E'\n  x '||c||' - se coló por delante de la fila';
    end if;
  exception when others then
    if sqlerrm like '%esperando%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- ── CASO 21 · con la fila vacía se sienta, y NO ensucia la agenda ────────
  -- OJO, y esto costó un rato entender: `set_config(..., true)` es LOCAL a la
  -- transacción, así que cuando un bloque `begin ... exception` captura, se
  -- revierte también la impersonación que se hizo DENTRO de él. El caso de
  -- arriba fija el barbero dentro del bloque y termina capturando, así que al
  -- llegar aquí volvíamos a ser el cliente y atender_sin_cita respondía "tu
  -- perfil todavía no está aprobado" — un mensaje que no tenía nada que ver.
  -- Por eso la impersonación va FUERA del bloque.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  n:=n+1; c:='sin cita · se sienta sin crear bloqueo en la agenda';
  begin
    select count(*) into v_int2 from turno_bloqueos where perfil_id = p_barb;
    update turno_cola set estado = 'atendido', atendido_at = now()
     where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino','atendiendo');
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    select * into r from turno_atender_sin_cita(v_neg, p_barb, s_corte, 'Sin cita', '');
    v_uuid := r.id;
    select count(*) into v_int from turno_bloqueos where perfil_id = p_barb;
    if r.estado = 'atendiendo' and r.tipo_cola = 'fisica' and v_int = v_int2 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — estado '||coalesce(r.estado,'NULL')
         ||', bloqueos '||v_int2||' -> '||v_int; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 22 · el ETA cuenta la silla ocupada ─────────────────────────────
  -- Sin esto el cliente de la cola digital ve "0 min" mientras el barbero está
  -- a mitad de un corte, llega, y se queda de pie.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
  n:=n+1; c:='eta · suma el tiempo de la silla ocupada';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    select turno_eta(r.id) into v_int;
    if coalesce(v_int, 0) >= 30 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — eta = '||coalesce(v_int::text,'NULL')||' min con la silla ocupada'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 23 · y al terminar SÍ cuenta como dinero ────────────────────────
  -- El motivo entero de la migración 66. Por la vía vieja este corte no
  -- aparecía en ningún sitio: ni cuentas del día, ni estadísticas, ni punto.
  n:=n+1; c:='sin cita · al terminar se registra la visita';
  begin
    update turno_cola set estado = 'atendido', atendido_at = now() where id = v_uuid;
    select count(*) into v_int from turno_historial_visitas
     where perfil_id = p_barb and origen = 'cola_fisica';
    if v_int >= 1 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — el corte no se contó'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 24 · el interruptor "doble servicio" restringe de verdad ───────
  -- Encontrado en la auditoría: doble_servicio_activo solo aparecía en el
  -- INSERT que crea la configuración; ninguna función lo leía. Un control que
  -- se guarda y nadie consulta se ve bien en pantalla y miente.
  n:=n+1; c:='doble servicio · apagado bloquea el segundo turno de otro tipo';
  begin
    update turno_cola set estado = 'atendido'
     where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino','atendiendo');
    update turno_configuracion_negocio set doble_servicio_activo = false where negocio_id = v_neg;
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    perform turno_entrar_a_cola(v_neg, s_unas, 'digital', p_mani);
    fallos := fallos || E'\n  x '||c||' - el interruptor sigue sin hacer nada';
  exception when others then
    if sqlerrm like '%ya tienes un turno activo%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;
  update turno_configuracion_negocio set doble_servicio_activo = true where negocio_id = v_neg;

  -- ── RESULTADO (el RAISE revierte todos los fixtures) ─────────────────────
  raise exception E'\n═══ MOTOR DE COLA · % / % casos OK ═══%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
