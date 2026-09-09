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

  insert into turno_configuracion_negocio (negocio_id, anticipacion_minima_horas, ventana_llegada_min, gracia_cita_min, umbral_confirmacion)
  values (v_neg, 2, 10, 5, 2);

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

  -- ── CASO 1 · entrar a la fila asigna posición 1 y prioridad digital ───────
  n:=n+1; c:='entrar a la fila · posición 1, prioridad digital';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    if r.posicion = 1 and r.prioridad = 2 and r.tipo_servicio = 'barbero' and r.estado = 'en_fila'
      then ok:=ok+1;
      else fallos := fallos || E'\n  ✗ '||c||' — pos='||r.posicion||' prio='||r.prioridad||' tipo='||r.tipo_servicio;
    end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 2 · R1: NO se permite un 2º turno del MISMO tipo ─────────────────
  n:=n+1; c:='R1 · bloquea segundo turno del mismo tipo';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    fallos := fallos || E'\n  ✗ '||c||' — permitió un segundo turno de barbero';
  exception when others then
    if sqlerrm like '%ya tienes un turno activo%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;

  -- ── CASO 3 · R1: SÍ se permite un turno de OTRO tipo (barbero + uñas) ─────
  n:=n+1; c:='R1 · permite turno simultáneo de otro tipo (uñas)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_unas, 'digital', p_mani);
    if r.tipo_servicio = 'manicuri_pedicuri' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — tipo='||coalesce(r.tipo_servicio,'null'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 4 · segundo cliente toma la siguiente posición ──────────────────
  n:=n+1; c:='fila · el segundo cliente toma posición 3 (tras 2 activos)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb);
    if r.posicion = 3 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — posición='||r.posicion||' (esperada 3)'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 5 · R2: con 0 delante y umbral 2, SÍ puede confirmar ────────────
  n:=n+1; c:='R2 · puede confirmar cuando está cerca (0 delante, umbral 2)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
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
  n:=n+1; c:='R2 · turno_confirmar_camino rechaza en el servidor';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    select id into v_uuid from turno_cola where cliente_id=u_cli2 and estado='en_fila';
    perform turno_confirmar_camino(v_uuid);
    fallos := fallos || E'\n  ✗ '||c||' — dejó confirmar estando lejos';
  exception when others then
    if sqlerrm like '%faltan%' or sqlerrm like '%Aún%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;
  update turno_configuracion_negocio set umbral_confirmacion = 2 where negocio_id = v_neg;

  -- ── CASO 8 · orden de llamado: respeta posición ──────────────────────────
  n:=n+1; c:='llamar siguiente · respeta el orden de la fila';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
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
  n:=n+1; c:='autorización · stats del negocio negadas a un no-dueño';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    perform * from turno_stats_periodo_negocio(v_neg, current_date - 30, current_date);
    fallos := fallos || E'\n  ✗ '||c||' — un cliente pudo leer los ingresos del local';
  exception when others then
    if sqlerrm like '%no autorizado%' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — error inesperado: '||sqlerrm; end if;
  end;

  -- ── CASO 11 · citas grupales (R5): N espacios consecutivos ───────────────
  n:=n+1; c:='R5 · cita grupal crea N espacios consecutivos con un grupo_id';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
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
  n:=n+1; c:='ciclo de vida · dejar el local cancela citas futuras';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    perform turno_dejar_local(p_barb);
    select count(*) into v_int from turno_citas
     where perfil_id=p_barb and fecha=(current_date+2) and estado <> 'cancelada';
    if v_int = 0 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedaron '||v_int||' citas sin cancelar'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 13 · el walk-in debe rellenar tipo_servicio ─────────────────────
  -- Sin esto R1 no cubre a los clientes sin cita: en Postgres los NULL no
  -- colisionan en un índice único, así que se podrían duplicar sin límite.
  n:=n+1; c:='walk-in · rellena tipo_servicio';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    select * into r from turno_registrar_fisico(v_neg, p_barb, s_corte, 'Sin cita', '');
    if r.tipo_servicio = 'barbero' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — tipo_servicio = '||coalesce(r.tipo_servicio,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 14 · la posición no se recicla al llamar a alguien ──────────────
  -- Antes se calculaba max(posicion)+1 mirando solo 'en_fila': al pasar alguien
  -- a llamado/en_camino el máximo caía y el siguiente reusaba su posición.
  n:=n+1; c:='fila · la posición no se recicla tras llamar';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    perform turno_registrar_fisico(v_neg, p_barb, s_corte, 'Otro sin cita', '');
    select count(*) into v_int from turno_cola
     where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino')
     group by posicion having count(*) > 1 limit 1;
    if v_int is null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — hay posiciones duplicadas en la cola'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── PREPARACIÓN · fila limpia y horario, para la gestión de turnos ───────
  update turno_cola set estado = 'atendido'
   where negocio_id = v_neg and estado in ('en_fila','llamado','en_camino','atendiendo');
  update turno_perfiles set activo = true where id = p_barb;
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  select p_barb, d, time '08:00', time '20:00', true, 10 from generate_series(0,6) d;

  -- ── CASO 15 · mover a alguien un puesto arriba lo pone delante ───────────
  -- El orden es la pareja (prioridad, posicion), no la posición sola: mover
  -- tiene que intercambiar LAS DOS o el cambio no se ve en la fila.
  n:=n+1; c:='fila · subir un puesto cambia el orden';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb); v_id1 := r.id;
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_barb); v_id2 := r.id;

    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    perform turno_mover_en_cola(v_id2, -1);
    select id into v_uuid from turno_cola
     where negocio_id = v_neg and estado = 'en_fila' order by prioridad, posicion limit 1;
    if v_uuid = v_id2 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — el primero de la fila no es el que se subió'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 16 · llamar a alguien concreto, saltando el orden ───────────────
  n:=n+1; c:='fila · llamar a uno concreto';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    select * into r from turno_llamar_a(v_id1);
    if r.estado = 'llamado' and r.llamado_at is not null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — estado = '||coalesce(r.estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 17 · devolver a la fila deshace el llamado ──────────────────────
  n:=n+1; c:='fila · devolver a la fila';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    select * into r from turno_devolver_a_fila(v_id1);
    if r.estado = 'en_fila' and r.llamado_at is null then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedó en '||coalesce(r.estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 18 · sacar de la fila al que se fue del local ───────────────────
  n:=n+1; c:='fila · sacar a alguien que se fue';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    perform turno_sacar_de_cola(v_id1);
    select estado into c2_estado from turno_cola where id = v_id1;
    if c2_estado = 'abandonado' then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — quedó en '||coalesce(c2_estado,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 19 · un cliente NO puede tocar la fila de otro ──────────────────
  -- Las RPC son SECURITY DEFINER: sin este chequeo cualquiera con sesión podría
  -- sacar de la fila a los clientes de una barbería a la que solo pertenece.
  n:=n+1; c:='fila · un cliente no puede sacar a otro';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli1::text)::text, true);
    begin
      perform turno_sacar_de_cola(v_id2);
      fallos := fallos || E'\n  ✗ '||c||' — un cliente sacó de la fila a otro';
    exception when others then ok:=ok+1;
    end;
  end;

  -- ── CASO 20 · "sin cita" ocupa la silla por el tiempo del servicio ───────
  n:=n+1; c:='sin cita · ocupa la silla 30+10 min';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    select * into r from turno_ocupar_ahora(p_barb, s_corte); v_bloq := r.id;
    v_int := round(extract(epoch from (r.hora_fin - r.hora_inicio)) / 60);
    if v_int between 39 and 41 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — el bloqueo duró '||v_int||' min'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 21 · el ETA cuenta la silla ocupada ─────────────────────────────
  -- Sin esto el cliente de la cola digital ve "0 min" mientras el barbero está
  -- a mitad de un corte, llega, y se queda de pie.
  n:=n+1; c:='eta · suma el tiempo de la silla ocupada';
  begin
    select turno_eta(v_id2) into v_int;
    if coalesce(v_int, 0) >= 30 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — eta = '||coalesce(v_int::text,'NULL')||' min con la silla ocupada'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 22 · liberar la silla al terminar antes ─────────────────────────
  n:=n+1; c:='sin cita · liberar la silla al terminar';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
    perform turno_liberar_ahora(v_bloq);
    select turno_min_ocupada(p_barb) into v_int;
    -- <= 1: liberar deja un piso de un minuto a propósito, para no dejar nunca
    -- un bloqueo con hora_fin por debajo de hora_inicio.
    if coalesce(v_int, 0) <= 1 then ok:=ok+1;
    else fallos := fallos || E'\n  ✗ '||c||' — la silla sigue ocupada '||v_int||' min'; end if;
  exception when others then fallos := fallos || E'\n  ✗ '||c||' — excepción: '||sqlerrm;
  end;

  -- ── CASO 23 · el interruptor "doble servicio" restringe de verdad ────────
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
