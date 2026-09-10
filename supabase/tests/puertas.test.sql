-- ─────────────────────────────────────────────────────────────────────────────
-- PUERTAS DEL API · Turno
--
-- Las otras suites prueban que las cosas FUNCIONAN. Esta prueba que NO funcionan
-- para quien no debe: recorre el API como un desconocido y comprueba que se le
-- cierra en la cara.
--
-- Existe porque el mismo error salió tres veces en este piloto, siempre igual:
-- la puerta cerrada en la pantalla y abierta en el API. Las políticas RLS
-- estaban bien; el agujero estaba en las funciones SECURITY DEFINER, que POR
-- DEFINICIÓN se saltan RLS y por tanto tienen que comprobar por su cuenta quién
-- llama. La app siempre llamaba con los ids correctos, así que nada se veía mal
-- desde dentro. El agujero solo existía para quien no usara la app.
--
-- Lo que encontró la primera corrida, ejecutado de verdad contra la base:
--
--   clientes_por_recuperar(perfil ajeno) -> 2 clientes CON TELÉFONO, y también
--                                           desde `anon`, la llave que viaja
--                                           DENTRO del APK
--   como ANON, cerrar_olvidados()        -> ejecutó (cierra turnos de TODOS los
--                                           locales)
--
-- Cerrado en la migración 52.
--
-- LOS DOS INTRUSOS. Hacen falta los dos y no son intercambiables:
--   · el ANÓNIMO   → tiene la llave publicable del APK y ninguna sesión.
--   · el REGISTRADO→ es un usuario real y completo, de OTRO local. Este es el
--     que importa: un intruso sin fila en turno_usuarios rebota en el
--     "no autenticado" genérico y te hace creer que la comprobación de
--     propiedad funciona cuando nunca llegó a evaluarse.
--
-- EL CASO FINAL es una red para toda la clase de error, no para estos fallos:
-- recorre cada función SECURITY DEFINER que un anónimo puede ejecutar, la LLAMA,
-- y exige que las que mutan se nieguen. Cuando alguien añada la siguiente
-- función sin portero, esta prueba la encuentra sola.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Los datos se crean fuera.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/puertas.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'PT-' || upper(substr(md5(random()::text),1,5));
  a_due uuid := gen_random_uuid(); a_bar uuid := gen_random_uuid();
  a_cli uuid := gen_random_uuid(); a_ext uuid := gen_random_uuid();
  u_due uuid; u_bar uuid; u_cli uuid; u_ext uuid;
  v_neg uuid; v_neg2 uuid; p_due uuid; p_bar uuid; p_ext uuid;
  s_corte uuid; q_cli uuid; v_bloq uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_int int; v_txt text; v_sentado text; abiertas text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pd_'||v_cod||'@t.test','',now(),now()),
         (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pb_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc_'||v_cod||'@t.test','',now(),now()),
         (a_ext,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','px_'||v_cod||'@t.test','',now(),now());

  -- ── EL LOCAL OBJETIVO ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Puertas Barber','empleados','DOP',true,'barbero','Duenno','809',
                              2, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Barbero','809');
  p_bar := r.id;
  select id into u_bar from turno_usuarios where auth_id = a_bar;

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_bar;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar,'Corte',30,500,true) returning id into s_corte;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_bar, d, time '08:00', time '21:00', true, 10 from generate_series(0,6) d;
  insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_bar, current_date + 2, time '05:00', time '06:00', 'prueba') returning id into v_bloq;

  -- Un cliente con historial: es lo que el intruso querría llevarse.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Con Telefono', '8095551234');
  select id into u_cli from turno_usuarios where auth_id = a_cli;
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
  q_cli := r.id;
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_cli, v_neg, p_bar, s_corte, current_date - 90, 500, 'cola_digital');
  update turno_perfiles set revisita_dias = 30 where id = p_bar;

  -- ── EL INTRUSO REGISTRADO: usuario real y completo, de OTRO local ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_ext::text)::text, true);
  perform turno_crear_negocio('Local Ajeno','empleados','DOP',true,'barbero','Extranno','809',
                              2, 10, 5, false, 1, 3, false, true);
  select id into u_ext from turno_usuarios where auth_id = a_ext;
  select id, negocio_id into p_ext, v_neg2 from turno_perfiles where usuario_id = u_ext limit 1;

  n:=n+1; c:='montaje · el intruso es un usuario REAL (si no, rebota por "no autenticado" y no se prueba nada)';
  if u_ext is not null and v_neg2 is not null and v_neg2 <> v_neg then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  -- ── LO QUE NO PUEDE ALCANZAR UN USUARIO DE OTRO LOCAL ─────────────────────
  n:=n+1; c:='cartera · no puede leer los clientes de un barbero ajeno';
  begin
    select count(*) into v_int from turno_clientes_por_recuperar(p_bar);
    fallos:=fallos||E'\n  x '||c||' - SE LLEVÓ '||v_int||' clientes con nombre y teléfono';
  exception when others then ok:=ok+1; end;

  -- Este es el intruso que importa: registrado, real y de otro local. Un anónimo
  -- rebota antes de llegar a la comprobación de pertenencia.
  n:=n+1; c:='listado · no puede leer el listado de clientes de un local ajeno';
  begin
    select count(*) into v_int from turno_clientes_del_local(v_neg);
    fallos:=fallos||E'\n  x '||c||' - SE LLEVÓ '||v_int||' clientes con nombre y teléfono';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='silla · no puede ver el estado de un barbero ajeno';
  begin
    perform turno_estado_barbero(p_bar);
    fallos:=fallos||E'\n  x '||c||' - lo vio';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='local · no puede ver el estado de un local ajeno';
  begin
    perform turno_estado_local(v_neg);
    fallos:=fallos||E'\n  x '||c||' - lo vio';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='eta · no puede leer el ETA de un turno ajeno';
  select turno_eta(q_cli) into v_int;
  if v_int is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - devolvió '||v_int; end if;

  n:=n+1; c:='fila · no puede sacar de la fila a un cliente ajeno';
  begin
    perform turno_sacar_de_cola(q_cli);
    fallos:=fallos||E'\n  x '||c||' - lo sacó';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='stats · no puede ver las cuentas de un local ajeno';
  begin
    perform turno_estadisticas_negocio(v_neg);
    fallos:=fallos||E'\n  x '||c||' - las vio';
  exception when others then ok:=ok+1; end;

  -- ── LO QUE SÍ PUEDE EL LEGÍTIMO (una regla que cierra de más también rompe) ─
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  n:=n+1; c:='legítimo · el barbero SÍ ve su propia cartera';
  begin
    select count(*) into v_int from turno_clientes_por_recuperar(p_bar);
    if v_int >= 1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||v_int||' clientes: se cerró de más'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- La otra mitad de la migración 63: al hacer que se niegue al desconocido hay
  -- que comprobar que no se ha negado también al dueño de los datos.
  n:=n+1; c:='legítimo · el barbero SÍ ve el listado del local';
  begin
    select count(*) into v_int from turno_clientes_del_local(v_neg);
    if v_int >= 1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||v_int||' clientes: se cerró de más'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='legítimo · el barbero SÍ ve el estado de su silla';
  begin
    select e.estado into v_txt from turno_estado_barbero(p_bar) e;
    if v_txt is not null then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='legítimo · el dueño SÍ ve la cartera de su empleado';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    select count(*) into v_int from turno_clientes_por_recuperar(p_bar);
    if v_int >= 1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||v_int; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='legítimo · el cliente SÍ ve el ETA de SU turno';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  select turno_eta(q_cli) into v_int;
  if v_int is not null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se cerró de más'; end if;

  -- El nombre de quien está en la silla es información del local: el cliente ve
  -- el estado (para elegir barbero) pero no a quién atiende.
  n:=n+1; c:='cliente · ve el estado de su barbero, NO el nombre de quien está sentado';
  begin
    select e.estado, e.cliente into v_txt, v_sentado from turno_estado_barbero(p_bar) e;
    if v_txt is not null and v_sentado is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - vio a: '||coalesce(v_sentado,'?'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── LA RED: TODO LO QUE UN ANÓNIMO PUEDE EJECUTAR ─────────────────────────
  -- No se comprueba leyendo el código —eso ya falló tres veces— sino llamando.
  perform set_config('request.jwt.claims', null, true);
  set local role anon;

  begin perform turno_clientes_por_recuperar(p_bar);
    abiertas := abiertas || ' clientes_por_recuperar'; exception when others then null; end;
  begin perform turno_cerrar_olvidados();
    abiertas := abiertas || ' cerrar_olvidados'; exception when others then null; end;
  begin perform turno_cerrar_citas_viejas();
    abiertas := abiertas || ' cerrar_citas_viejas'; exception when others then null; end;
  begin perform turno_estado_local(v_neg);
    abiertas := abiertas || ' estado_local'; exception when others then null; end;
  begin perform turno_estadisticas_negocio(v_neg);
    abiertas := abiertas || ' estadisticas_negocio'; exception when others then null; end;
  begin perform turno_stats_periodo_negocio(v_neg, current_date-30, current_date);
    abiertas := abiertas || ' stats_periodo_negocio'; exception when others then null; end;
  begin perform turno_asignar_cola(q_cli, p_bar);
    abiertas := abiertas || ' asignar_cola'; exception when others then null; end;
  begin perform turno_cambiar_modalidad(p_bar, 'barbero_renta');
    abiertas := abiertas || ' cambiar_modalidad'; exception when others then null; end;
  begin perform turno_cambiar_tipo_negocio(v_neg, 'espacios_rentados');
    abiertas := abiertas || ' cambiar_tipo_negocio'; exception when others then null; end;
  begin perform turno_cerrar_local(v_neg);
    abiertas := abiertas || ' cerrar_local'; exception when others then null; end;
  begin perform turno_desvincular_barbero(p_bar);
    abiertas := abiertas || ' desvincular_barbero'; exception when others then null; end;
  begin perform turno_guardar_reglas_barbero(p_bar, 3, 10, 5, 2);
    abiertas := abiertas || ' guardar_reglas_barbero'; exception when others then null; end;
  begin perform turno_mover_en_cola(q_cli, 1);
    abiertas := abiertas || ' mover_en_cola'; exception when others then null; end;
  begin perform turno_sacar_de_cola(q_cli);
    abiertas := abiertas || ' sacar_de_cola'; exception when others then null; end;
  begin perform turno_iniciar_atencion(q_cli);
    abiertas := abiertas || ' iniciar_atencion'; exception when others then null; end;
  begin perform turno_devolver_a_fila(q_cli);
    abiertas := abiertas || ' devolver_a_fila'; exception when others then null; end;
  begin perform turno_cambiar_servicio(q_cli, s_corte);
    abiertas := abiertas || ' cambiar_servicio'; exception when others then null; end;
  begin perform turno_liberar_ahora(v_bloq);
    abiertas := abiertas || ' liberar_ahora'; exception when others then null; end;
  begin perform turno_llamar_siguiente(v_neg, p_bar);
    abiertas := abiertas || ' llamar_siguiente'; exception when others then null; end;
  begin perform turno_ocupar_ahora(p_bar, s_corte, 'x');
    abiertas := abiertas || ' ocupar_ahora'; exception when others then null; end;
  begin perform turno_estado_barbero(p_bar);
    abiertas := abiertas || ' estado_barbero'; exception when others then null; end;
  begin perform turno_fidelidad(p_bar, v_neg);
    abiertas := abiertas || ' fidelidad'; exception when others then null; end;
  begin perform turno_regla_tiempo(p_bar, v_neg, 'ventana_llegada_min');
    abiertas := abiertas || ' regla_tiempo'; exception when others then null; end;

  -- Las cuatro de las migraciones 59–62. Se añaden aquí porque esta suite se
  -- escribió antes que ellas y no las cubría: clientes_del_local llegó a
  -- producción devolviendo vacío en vez de negarse, y nada se puso rojo.
  -- Devolver vacío no es una fuga, pero tampoco es una negativa: el día que el
  -- portero se caiga de la consulta, la diferencia es todo.
  begin perform turno_clientes_del_local(v_neg);
    abiertas := abiertas || ' clientes_del_local'; exception when others then null; end;
  begin perform turno_avisos_de_espera(v_neg, 5);
    abiertas := abiertas || ' avisos_de_espera'; exception when others then null; end;
  begin perform turno_no_esta(q_cli);
    abiertas := abiertas || ' no_esta'; exception when others then null; end;
  begin perform turno_sustituir_ausente(q_cli, q_cli);
    abiertas := abiertas || ' sustituir_ausente'; exception when others then null; end;

  -- Las de las migraciones 66–68. Se añaden a la vez que se escriben, que es la
  -- única forma de que esta red sirva: la última vez se quedaron fuera cuatro
  -- funciones nuevas y una llegó a producción sin negarse.
  begin perform turno_atender_sin_cita(v_neg, p_bar, s_corte, 'Anon', '');
    abiertas := abiertas || ' atender_sin_cita'; exception when others then null; end;
  begin perform turno_carga_de_fila(p_bar);
    abiertas := abiertas || ' carga_de_fila'; exception when others then null; end;
  begin perform turno_ya_llegue(q_cli);
    abiertas := abiertas || ' ya_llegue'; exception when others then null; end;
  begin perform turno_dar_mas_tiempo(q_cli, 5);
    abiertas := abiertas || ' dar_mas_tiempo'; exception when others then null; end;
  begin perform turno_ocupar_ahora(p_bar, s_corte, 'x');
    abiertas := abiertas || ' ocupar_ahora'; exception when others then null; end;

  reset role;

  n:=n+1; c:='RED · ninguna función queda al alcance de un anónimo';
  if abiertas = '' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||E'\n      abiertas:'||abiertas; end if;

  raise exception E'\n=== PUERTAS DEL API · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
