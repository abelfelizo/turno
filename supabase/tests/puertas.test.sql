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
  a_cli2 uuid := gen_random_uuid();
  u_due uuid; u_bar uuid; u_cli uuid; u_ext uuid; u_cli2 uuid;
  v_neg uuid; v_neg2 uuid; p_due uuid; p_bar uuid; p_ext uuid;
  s_corte uuid; q_cli uuid; q_libre uuid; v_bloq uuid;
  cita_a uuid; cita_b uuid; cita_c uuid; cita_d uuid; cita_vieja uuid; cita_fut uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_int int; v_pts int; v_txt text; v_sentado text; abiertas text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pd_'||v_cod||'@t.test','',now(),now()),
         (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pb_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc_'||v_cod||'@t.test','',now(),now()),
         (a_ext,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','px_'||v_cod||'@t.test','',now(),now()),
         (a_cli2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2_'||v_cod||'@t.test','',now(),now());

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
  -- Jornada de 00:01 a 23:59 A PROPÓSITO. Desde la migración 72 la fila
  -- respeta el horario, y con un fixture de 08:00 a 21:00 esta suite fallaba
  -- sola al correrla de madrugada o de noche: contaba la hora, no la regla.
  -- Aquí el horario no es lo que se mide, así que se abre entero para que no
  -- interfiera; quien sí lo mide es horarios.test.sql y modo_atencion.test.sql.
  -- ON CONFLICT desde la migración 85: el perfil ya nace con jornada sembrada.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_bar, d, time '00:01', time '23:59', true, 10 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = true, tiempo_entre_clientes = excluded.tiempo_entre_clientes;
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

  -- ── QUIÉN CIERRA LA CITA (migración 73) ───────────────────────────────────
  -- Las puertas de arriba son funciones. Esta es una TABLA, y por eso se coló:
  -- la app escribe en turno_citas con un update normal, así que quien manda es
  -- la política RLS. Decía "cliente_id = turno_uid() OR negocio_id IN
  -- (turno_mis_negocios())", y turno_mis_negocios() incluye los locales donde
  -- eres SOLO CLIENTE. Ejecutado contra la base antes de arreglarlo: un cliente
  -- marcó SU cita como 'atendida' (visita + punto de fidelidad, sin ir ni
  -- pagar) y canceló la cita de OTRO.
  --
  -- Aquí se prueban las dos capas: la política (de quién es la fila) y el
  -- trigger (qué valores puede escribir su dueño). Con una sola no llega:
  -- 'atendida' es la firma del cobro y RLS no sabe leer valores.
  --
  -- OJO: `set local role` y `set_config` van FUERA de los bloques con
  -- exception. Al capturar, el bloque revierte también la suplantación que se
  -- hizo dentro, y el caso siguiente corre como quien no es.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Dos', '8095559999');
  select id into u_cli2 from turno_usuarios where auth_id = a_cli2;

  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli2, v_neg, s_corte, current_date+1, time '10:00', time '10:30', 'creada') returning id into cita_a;
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli,  v_neg, s_corte, current_date+1, time '11:00', time '11:30', 'creada') returning id into cita_b;
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli2, v_neg, s_corte, current_date+1, time '12:00', time '12:30', 'creada') returning id into cita_c;
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli2, v_neg, s_corte, current_date+1, time '13:00', time '13:30', 'creada') returning id into cita_d;

  -- Desde aquí se escribe COMO CLIENTE de verdad: sin `set local role` las
  -- políticas no se evalúan y la prueba pasaría siempre.
  set local role authenticated;

  n:=n+1; c:='cita · el cliente NO puede marcar SU cita como atendida';
  begin
    update turno_citas set estado='atendida', atendida_at=now() where id=cita_a;
    fallos:=fallos||E'\n  x '||c||' - la firmó él mismo';
  exception when others then ok:=ok+1; end;

  reset role;

  -- Lo que hace grave al caso anterior no es el estado: es lo que arrastra.
  n:=n+1; c:='cita · el intento fallido NO dejó visita ni punto de fidelidad';
  select count(*) into v_int from turno_historial_visitas where cliente_id=u_cli2;
  select coalesce(max(visitas_totales),0) into v_pts from turno_puntos where usuario_id=u_cli2 and negocio_id=v_neg;
  if v_int = 0 and v_pts = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - visitas '||v_int||', puntos '||v_pts; end if;

  set local role authenticated;

  n:=n+1; c:='cita · el cliente NO puede firmar atendida_at por su cuenta';
  begin
    update turno_citas set atendida_at=now() where id=cita_a;
    fallos:=fallos||E'\n  x '||c||' - firmó el cobro sin tocar el estado';
  exception when others then ok:=ok+1; end;

  -- Sabotaje: borrarle la hora a otro cliente del mismo local. Aquí no hay
  -- excepción que capturar —RLS simplemente no ve la fila— así que el caso
  -- mira si la cita ajena cambió.
  update turno_citas set estado='cancelada' where id=cita_b;

  n:=n+1; c:='cita · el cliente SÍ puede cancelar la SUYA';
  begin
    update turno_citas set estado='cancelada' where id=cita_c;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm||' (se cerró de más)'; end;

  reset role;

  n:=n+1; c:='cita · el cliente NO puede cancelar la cita de OTRO';
  select estado into v_txt from turno_citas where id=cita_b;
  if v_txt = 'creada' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - la dejó en '||v_txt; end if;

  -- La otra mitad: una regla que cierra de más rompe el trabajo del barbero.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  set local role authenticated;

  n:=n+1; c:='cita · el barbero SÍ la cierra';
  begin
    update turno_citas set estado='atendida', atendida_at=now() where id=cita_a;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='cita · el barbero SÍ puede marcar no llegó';
  begin
    update turno_citas set estado='no_llego' where id=cita_d;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  reset role;

  n:=n+1; c:='cita · cerrada por el barbero, esa SÍ cuenta como visita';
  select count(*) into v_int from turno_historial_visitas where cliente_id=u_cli2;
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' visitas'; end if;

  -- ── HASTA CUÁNDO MANDA EL CLIENTE EN SU CITA (migración 90) ───────────────
  -- Los casos de arriba miran QUÉ puede escribir el cliente. Faltaba CUÁNDO.
  -- Sin esta regla podía confirmar —o ponerse en camino— en una cita del martes
  -- pasado, y el barbero se encontraba una cita vieja en verde en su agenda
  -- como si fuera a aparecer alguien. No es una fuga: es ruido metido en la
  -- agenda de otro, que es lo que esta app existe para evitar.
  -- Las dos se crean AQUÍ, fuera de todo bloque con `exception`: uno que captura
  -- revierte también sus propios inserts. Y la futura es NUEVA, no cita_c —
  -- esa ya la canceló el cliente arriba, y un update que no cambia el estado no
  -- pasa por la comprobación: el caso habría pasado por la razón equivocada.
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli2, v_neg, s_corte, current_date-3, time '10:00', time '10:30', 'creada') returning id into cita_vieja;
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_cli2, v_neg, s_corte, current_date+3, time '10:00', time '10:30', 'creada') returning id into cita_fut;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  set local role authenticated;

  n:=n+1; c:='cita vieja · el cliente NO la confirma a toro pasado';
  begin
    update turno_citas set estado='confirmada' where id=cita_vieja;
    fallos:=fallos||E'\n  x '||c||' - confirmó una cita de hace tres días';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='cita vieja · tampoco se pone "en camino" a una cita de hace tres días';
  begin
    update turno_citas set estado='en_camino' where id=cita_vieja;
    fallos:=fallos||E'\n  x '||c||' - dijo que iba en camino a algo que ya pasó';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='cita vieja · ni la cancela (cancelar avisa al barbero por push)';
  begin
    update turno_citas set estado='cancelada' where id=cita_vieja;
    fallos:=fallos||E'\n  x '||c||' - canceló algo que ya no iba a ocurrir';
  exception when others then ok:=ok+1; end;

  reset role;

  -- LAS DOS MITADES DE NO CERRAR DE MÁS. Si esta regla se pasa de lista rompe
  -- dos cosas peores que las que arregla: que el cliente cancele una cita que
  -- todavía no ha pasado, y que el BARBERO cierre las viejas — que es
  -- exactamente como se marca "no llegó".
  n:=n+1; c:='cita futura · el cliente SÍ la sigue cancelando';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  set local role authenticated;
  begin
    update turno_citas set estado='cancelada' where id=cita_fut;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;
  reset role;

  n:=n+1; c:='cita vieja · el BARBERO sí la cierra (así se marca "no llegó")';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  set local role authenticated;
  begin
    update turno_citas set estado='no_llego' where id=cita_vieja;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;
  reset role;

  -- ── LA SILLA ES DE QUIEN ATIENDE (migración 76) ───────────────────────────
  -- Reportado desde el teléfono mirando el panel del dueño: puede sacar de la
  -- fila a alguien que un barbero está atendiendo. Y buscando por dónde entraba
  -- salió algo peor del mismo hueco: turno_cola_operable solo comprobaba el
  -- perfil cuando el turno TENÍA barbero asignado, así que sobre un turno de
  -- "cualquiera disponible" bastaba con pertenecer al local — y al local
  -- pertenecen los clientes. Ejecutado contra la base antes de arreglarlo, un
  -- cliente cualquiera sacó de la fila el turno de otro y lo dejó 'abandonado'.
  --
  -- Estos casos son el hueco que esta suite tenía: su intruso es de OTRO local
  -- y rebota antes, en "sin acceso al negocio". El que hay que temer es el de
  -- dentro, que sí pertenece.
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', null);
  q_libre := r.id;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  perform turno_llamar_a(q_cli);
  perform turno_iniciar_atencion(q_cli);

  n:=n+1; c:='silla · el DUEÑO no saca de la fila a quien está en la silla del barbero';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_sacar_de_cola(q_cli);
    fallos:=fallos||E'\n  x '||c||' - se lo levantó a mitad de corte (y sin visita: el corte no se cobra)';
  exception when others then
    if sqlerrm like '%silla de otro barbero%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='fila · un CLIENTE no puede sacar de la fila el turno sin barbero de OTRO';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_sacar_de_cola(q_libre);
    fallos:=fallos||E'\n  x '||c||' - echó de la fila a otro cliente';
  exception when others then
    if sqlerrm like '%la maneja el equipo%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- Y las dos mitades de "no cerrar de más", que es la otra forma de romperlo.
  n:=n+1; c:='silla · el barbero QUE ATIENDE sí puede';
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  begin
    perform turno_devolver_a_fila(q_cli);
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='fila · el equipo del local SÍ maneja el turno sin barbero';
  begin
    perform turno_sacar_de_cola(q_libre);
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  -- ── LO QUE TRAJERON LAS MIGRACIONES 81–83 ─────────────────────────────────
  -- El intruso registrado, que es el que importa: un desconocido sin fila en
  -- turno_usuarios rebota en el "no autenticado" genérico y no prueba nada.
  n:=n+1; c:='suspender · un dueño AJENO no puede suspender a un barbero de este local';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ext::text)::text, true);
  begin
    perform turno_suspender_barbero(p_bar, true, 'porque sí');
    fallos:=fallos||E'\n  x '||c||' - dejó sin trabajar a un barbero de otro local';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='reseñas · no se leen las de un barbero de otro local';
  begin
    perform turno_resumen_resenas(p_bar);
    fallos:=fallos||E'\n  x '||c||' - se llevó el promedio de un barbero ajeno';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='preferido · no se marca a un barbero de un local del que no eres cliente';
  begin
    perform turno_marcar_preferido(v_neg, p_bar);
    fallos:=fallos||E'\n  x '||c||' - se apuntó en la membresía de un local ajeno';
  exception when others then ok:=ok+1; end;

  -- Lo que factura una silla es de las dos personas que mandan en ella y de
  -- nadie más. El agujero de la migración 89 era solo para anónimos —el `<>`
  -- contra un uid nulo daba NULL y el if no entraba— pero la regla se escribe
  -- entera: ni un dueño de otro local la lee.
  n:=n+1; c:='ventas · un dueño AJENO no lee lo que factura esta silla';
  begin
    perform turno_stats_periodo_perfil(p_bar, current_date-3650, current_date);
    fallos:=fallos||E'\n  x '||c||' - se llevó ingresos, visitas y ticket de un barbero ajeno';
  exception when others then ok:=ok+1; end;

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

  -- Las de las migraciones 74–83. Se añaden a la vez que la migración 84, que es
  -- la que les puso portero: cuatro de ellas —puesto, eta, fila_abierta y
  -- mi_preferido— no lanzaban, DEVOLVÍAN NULL. Nadie se llevaba nada con eso,
  -- pero devolver vacío y negarse se parecen mientras la consulta funcione, y
  -- el día que el filtro se caiga la red no lo ve. Es el camino exacto por el
  -- que clientes_del_local llegó a producción sin portero.
  begin perform turno_puesto(q_cli);
    abiertas := abiertas || ' puesto'; exception when others then null; end;
  begin perform turno_eta(q_cli);
    abiertas := abiertas || ' eta'; exception when others then null; end;
  begin perform turno_fila_abierta(p_bar, v_neg);
    abiertas := abiertas || ' fila_abierta'; exception when others then null; end;
  begin perform turno_filas_abiertas(v_neg);
    abiertas := abiertas || ' filas_abiertas'; exception when others then null; end;
  begin perform turno_resumen_fila(v_neg, p_bar);
    abiertas := abiertas || ' resumen_fila'; exception when others then null; end;
  begin perform turno_suspender_barbero(p_bar, true, 'x');
    abiertas := abiertas || ' suspender_barbero'; exception when others then null; end;
  begin perform turno_resenas_de(p_bar, 5);
    abiertas := abiertas || ' resenas_de'; exception when others then null; end;
  begin perform turno_resumen_resenas(p_bar);
    abiertas := abiertas || ' resumen_resenas'; exception when others then null; end;
  begin perform turno_marcar_preferido(v_neg, p_bar);
    abiertas := abiertas || ' marcar_preferido'; exception when others then null; end;
  begin perform turno_mi_preferido(v_neg);
    abiertas := abiertas || ' mi_preferido'; exception when others then null; end;
  -- Migración 86. Cuánto paga un local y desde cuándo debe es de lo más privado
  -- que hay aquí dentro.
  begin perform turno_suscripcion(v_neg);
    abiertas := abiertas || ' suscripcion'; exception when others then null; end;
  -- Migración 93. Lo que paga —o debe— un barbero suelto es igual de privado
  -- que lo que paga su local.
  begin perform turno_suscripcion_silla(p_bar);
    abiertas := abiertas || ' suscripcion_silla'; exception when others then null; end;
  begin perform turno_suscripcion_de(p_bar);
    abiertas := abiertas || ' suscripcion_de'; exception when others then null; end;
  begin perform turno_asientos_negocio(v_neg);
    abiertas := abiertas || ' asientos_negocio'; exception when others then null; end;
  -- Migración 87. Alargar o cerrar la jornada de otro es moverle el negocio.
  begin perform turno_alargar_jornada(p_bar, 30);
    abiertas := abiertas || ' alargar_jornada'; exception when others then null; end;
  -- Migración 91, el mismo día que se escribe. La regla ya no depende de que me
  -- acuerde —el censo de abajo lo cazaría— pero el censo mira permisos y esto
  -- mira porteros, que son cosas distintas.
  begin perform turno_adelantar_jornada(p_bar, 30);
    abiertas := abiertas || ' adelantar_jornada'; exception when others then null; end;
  begin perform turno_cerrar_jornada(p_bar);
    abiertas := abiertas || ' cerrar_jornada'; exception when others then null; end;
  begin perform turno_jornada_normal(p_bar);
    abiertas := abiertas || ' jornada_normal'; exception when others then null; end;
  -- Esta es la que la red cazó el día que se escribió la 87: un ayudante de
  -- solo lectura al que se le olvidó el portero. Devolver la jornada de
  -- cualquiera no es una fuga grave, pero tampoco es negarse.
  begin perform turno_jornada_de(p_bar, current_date);
    abiertas := abiertas || ' jornada_de'; exception when others then null; end;
  begin perform turno_limpiar_pasado();
    abiertas := abiertas || ' limpiar_pasado'; exception when others then null; end;
  -- Migración 88. Esta se me quedó fuera el día que se escribió, y al ir a
  -- añadirla el censo de abajo encontró otras diecisiete. De ahí viene la 89.
  begin perform turno_manda_en_el_horario(p_bar);
    abiertas := abiertas || ' manda_en_el_horario'; exception when others then null; end;
  -- Migración 92, el mismo día. Es la que decide de quién es el negocio de una
  -- silla, así que si algún día contesta a un desconocido, contesta la regla
  -- entera del reparto de poder.
  begin perform turno_manda_en_la_silla(p_bar);
    abiertas := abiertas || ' manda_en_la_silla'; exception when others then null; end;
  -- Migraciones 95, 96 y 97. Las tres contestan la MISMA pregunta que el letrero
  -- se niega a contestar: si ese barbero está al día. La 95 tuvo el cuidado de
  -- que la fachada no lo delatara y dejó el grant abierto a anon justo al lado;
  -- la 97 lo cierra. turno_perfil_acepta y turno_perfil_operable entran aquí
  -- por lo mismo: llevan el cobro dentro desde la 95, y estaban EXENTAS con un
  -- motivo —"viven dentro de una política"— que ya no es cierto.
  begin perform turno_silla_al_dia(p_bar);
    abiertas := abiertas || ' silla_al_dia'; exception when others then null; end;
  begin perform turno_local_operativo(v_neg);
    abiertas := abiertas || ' local_operativo'; exception when others then null; end;
  begin perform turno_perfil_acepta(p_bar, null);
    abiertas := abiertas || ' perfil_acepta'; exception when others then null; end;
  begin perform turno_perfil_operable(p_bar);
    abiertas := abiertas || ' perfil_operable'; exception when others then null; end;

  -- ── LAS DIECIOCHO DEL CENSO (migración 89) ────────────────────────────────
  -- Nunca habían pasado por aquí. Ocho ya se negaban —tenían portero y nadie lo
  -- había comprobado—, seis son ayudantes de políticas y quedan exentas abajo,
  -- una estaba MUERTA (turno_siguiente_adelantado leía una columna inexistente:
  -- se borró, porque negarse por estar rota es la peor forma de pasar una
  -- prueba) y tres estaban abiertas: turno_mis_tarjetas devolvía vacío,
  -- turno_negocio_por_codigo contestaba a cualquiera y
  -- turno_stats_periodo_perfil soltaba la facturación.
  --
  -- Que una función se defienda sola no es razón para no llamarla: hasta que la
  -- red la llama, que se defienda es una creencia.
  begin perform turno_agendar_grupo(p_bar, s_corte, current_date+1, time '10:00', 2);
    abiertas := abiertas || ' agendar_grupo'; exception when others then null; end;
  begin perform turno_aplicar_canje(v_neg);
    abiertas := abiertas || ' aplicar_canje'; exception when others then null; end;
  begin perform turno_dejar_local(p_bar);
    abiertas := abiertas || ' dejar_local'; exception when others then null; end;
  begin perform turno_eliminar_cuenta();
    abiertas := abiertas || ' eliminar_cuenta'; exception when others then null; end;
  begin perform turno_emitir_canje(v_neg, p_bar);
    abiertas := abiertas || ' emitir_canje'; exception when others then null; end;
  begin perform turno_llamar_a(q_cli);
    abiertas := abiertas || ' llamar_a'; exception when others then null; end;
  begin perform turno_salir_local(v_neg);
    abiertas := abiertas || ' salir_local'; exception when others then null; end;
  -- OJO CON ESTA. Con un uuid inventado rebotaba con "perfil inexistente" y
  -- parecía cerrada; con el id de una silla que EXISTE soltaba la facturación
  -- entera. Va con p_bar, que es real, a propósito: un portero se prueba con la
  -- puerta que de verdad está ahí. (Migración 89.)
  begin perform turno_stats_periodo_perfil(p_bar, current_date-30, current_date);
    abiertas := abiertas || ' stats_periodo_perfil'; exception when others then null; end;
  begin perform turno_cola_operable(q_cli);
    abiertas := abiertas || ' cola_operable'; exception when others then null; end;
  -- Las dos que estaban abiertas de verdad. Si alguna vuelve a aparecer aquí,
  -- es que a alguien se le cayó el portero de la migración 89.
  begin perform turno_mis_tarjetas(v_neg);
    abiertas := abiertas || ' mis_tarjetas'; exception when others then null; end;
  begin perform turno_negocio_por_codigo('ABC-1234');
    abiertas := abiertas || ' negocio_por_codigo'; exception when others then null; end;

  reset role;

  n:=n+1; c:='RED · ninguna función queda al alcance de un anónimo';
  if abiertas = '' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||E'\n      abiertas:'||abiertas; end if;

  -- ── EL CENSO: QUE LA RED NO DEPENDA DE QUE ALGUIEN SE ACUERDE ─────────────
  -- Todo lo de arriba es una lista escrita a mano, y las listas escritas a mano
  -- se pudren. El README de esta carpeta dice desde hace meses «toda función
  -- nueva se añade a esa red el mismo día que se escribe», y aun así al ir a
  -- meter UNA que faltaba aparecieron dieciocho. Una regla que depende de la
  -- memoria de quien escribe no es una regla.
  --
  -- Así que aquí la red se cuenta sola: enumera pg_proc y se pone roja cuando
  -- existe una función turno_* que un anónimo puede ejecutar y que las líneas
  -- de arriba no nombran. No sustituye a las llamadas —el censo mira permisos,
  -- las llamadas miran porteros, y son cosas distintas— pero garantiza que no
  -- vuelva a haber funciones que esta suite ni siquiera sabe que existen.
  --
  -- CÓMO SABE EL CENSO QUÉ SE HA LLAMADO. `v_red` es el índice de las llamadas
  -- de arriba. Sí, es una segunda lista, y no finjo que se mantenga sola: lo
  -- que el censo garantiza es que no vuelva a existir una función que esta
  -- suite ni siquiera sabe que existe —que es el fallo que de verdad ocurrió,
  -- dieciocho veces— y, en el otro sentido, que un nombre del índice que ya no
  -- exista en la base salte en vez de quedarse ahí dando confianza falsa.
  -- Meter un nombre en el índice sin escribir su llamada sigue siendo posible,
  -- pero hay que hacerlo a propósito y se ve en el diff.
  --
  -- Dos exenciones, las dos por motivos escritos:
  --   · Las funciones de trigger no se pueden llamar a mano: Postgres las
  --     rechaza con "trigger functions can only be called as triggers". Se
  --     descartan por su tipo de retorno, no por su nombre, para que una
  --     función normal no se cuele diciéndose trigger.
  --   · Los ayudantes que viven DENTRO de una política RLS o de un CHECK se
  --     evalúan con el rol de quien consulta. Quitarles el EXECUTE a anon no
  --     los deja fuera: hace que la política reviente con "permission denied"
  --     en vez de devolver false, que es peor. Van nombrados uno a uno: la
  --     exención es una decisión, no una categoría en la que colar cosas.
  declare
    v_red text[] := array[
      'turno_adelantar_jornada','turno_agendar_grupo','turno_alargar_jornada','turno_aplicar_canje',
      'turno_asientos_negocio','turno_asignar_cola','turno_atender_sin_cita',
      'turno_avisos_de_espera','turno_cambiar_modalidad','turno_cambiar_servicio',
      'turno_cambiar_tipo_negocio','turno_carga_de_fila','turno_cerrar_citas_viejas',
      'turno_cerrar_jornada','turno_cerrar_local','turno_cerrar_olvidados',
      'turno_clientes_del_local','turno_clientes_por_recuperar','turno_dar_mas_tiempo',
      'turno_dejar_local','turno_desvincular_barbero','turno_devolver_a_fila',
      'turno_eliminar_cuenta','turno_emitir_canje','turno_estadisticas_negocio',
      'turno_estado_barbero','turno_estado_local','turno_eta','turno_fidelidad',
      'turno_fila_abierta','turno_filas_abiertas','turno_guardar_reglas_barbero',
      'turno_iniciar_atencion','turno_jornada_de','turno_jornada_normal',
      'turno_liberar_ahora','turno_limpiar_pasado','turno_llamar_a',
      'turno_llamar_siguiente','turno_manda_en_el_horario','turno_marcar_preferido',
      'turno_manda_en_la_silla',
      'turno_mi_preferido','turno_mis_tarjetas','turno_mover_en_cola',
      'turno_negocio_por_codigo','turno_no_esta','turno_ocupar_ahora','turno_puesto',
      'turno_regla_tiempo','turno_resenas_de','turno_resumen_fila',
      'turno_resumen_resenas','turno_sacar_de_cola','turno_salir_local',
      'turno_stats_periodo_negocio',
      'turno_local_operativo','turno_perfil_acepta','turno_perfil_operable',
      'turno_silla_al_dia',
      'turno_stats_periodo_perfil','turno_suscripcion','turno_suscripcion_de',
      'turno_suscripcion_silla','turno_suspender_barbero',
      'turno_sustituir_ausente','turno_ya_llegue'
    ];
    -- turno_perfil_acepta y turno_perfil_operable ESTABAN AQUÍ, con el motivo
    -- «viven dentro de una política RLS». Comprobado contra pg_policies y
    -- pg_constraint: no viven en ninguna, y desde la migración 95 llevan el
    -- cobro dentro. Se les quitó el EXECUTE en la 97 y suben a la red, donde
    -- se las llama de verdad. Una exención con el motivo caducado es peor que
    -- ninguna, porque parece decidida.
    v_exentas text[] := array[
      'turno_perfil_admin', 'turno_perfil_autonomo',
      'turno_puede_confirmar', 'turno_cola_operable',
      'turno_codigo_prefijo', 'turno_bloqueo_sin_pisar_citas',
      'turno_puntos_coherentes', 'turno_puntos_perfil_coherentes'
    ];
    v_sin_censar text;
    v_fantasmas text;
  begin
    select string_agg(distinct p.proname, ' ' order by p.proname)
      into v_sin_censar
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
     where ns.nspname = 'public'
       and p.proname like 'turno\_%'
       and t.typname <> 'trigger'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and not (p.proname = any(v_red))
       and not (p.proname = any(v_exentas));

    n:=n+1; c:='CENSO · toda función que anon puede ejecutar pasa por la red';
    if v_sin_censar is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c
      ||E'\n      sin llamar:'||v_sin_censar
      ||E'\n      → añade arriba su `begin perform ...` Y su nombre a v_red; si'
      ||E'\n        es ayudante de política/CHECK, a v_exentas CON su razón.'; end if;

    -- El índice al revés: un nombre que ya no existe en la base es una línea
    -- que dejó de probar nada sin que nadie se enterara.
    select string_agg(x, ' ' order by x) into v_fantasmas
      from unnest(v_red) as x
     where not exists (
       select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname = x);

    n:=n+1; c:='CENSO · el índice de la red no nombra funciones que ya no existen';
    if v_fantasmas is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||E'\n      fantasmas: '||v_fantasmas; end if;
  end;

  raise exception E'\n=== PUERTAS DEL API · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
