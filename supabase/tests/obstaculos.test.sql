-- ─────────────────────────────────────────────────────────────────────────────
-- OBSTÁCULOS · Turno
--
-- `viaje.test.sql` recorre el camino feliz: un cliente, un barbero, nada más
-- pasando a la vez. Un local real nunca está así. Esta suite es el mismo día
-- pero con TODO ocurriendo al mismo tiempo — fila esperando, agenda reservada y
-- bloqueos encima — porque los fallos que quedaban no estaban en ninguna de las
-- tres piezas: estaban en los cruces.
--
-- La primera pasada encontró dos:
--
--   · Se podía bloquear "me voy 14:30–16:00" ENCIMA de una cita confirmada de
--     las 15:00. La agenda y los bloqueos decían la verdad por separado y
--     juntos mentían: el barbero se iba y el cliente llegaba a nada.
--   · El paso a 'no_llego' metía al cliente en la fila con tipo_servicio NULL.
--     En Postgres los NULL no chocan en un índice único, así que R1 —un turno
--     activo por tipo— dejaba de cubrir justo a los que peor lo habían pasado.
--     Y la posición se calculaba mirando solo 'en_fila', o sea que reciclaba
--     una posición ya entregada.
--
-- Los dos se arreglan en la migración 51.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Crear un fixture dentro de un bloque que
-- espera un error hace que el fixture desaparezca. Los datos se crean fuera.
--
-- OJO 2: los casos que dependen de "ahora" usan la hora real del servidor en la
-- zona del local. Los bloqueos de prueba se ponen de madrugada (05:00–07:00) a
-- propósito, para no cruzarse con la hora a la que se corra la suite.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/obstaculos.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'OB-' || upper(substr(md5(random()::text),1,5));
  a_due uuid := gen_random_uuid(); a_bar uuid := gen_random_uuid();
  a_c1  uuid := gen_random_uuid(); a_c2  uuid := gen_random_uuid();
  u_due uuid; u_bar uuid; u_c1 uuid; u_c2 uuid;
  v_neg uuid; p_due uuid; p_bar uuid; s_corte uuid;
  q_c1 uuid; cita_tarde uuid; cita_ahora uuid; cita_c2 uuid; cita_vieja uuid;
  v_tz text := 'America/Santo_Domingo';
  v_hoy date; v_manana date; v_t time;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_int int; v_txt text; v_bool boolean;
  q_ausente uuid; q_detras uuid; q_presente uuid; v_pos_antes int;
begin
  v_hoy    := (now() at time zone v_tz)::date;
  v_manana := v_hoy + 1;
  v_t      := (now() at time zone v_tz)::time;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','od_'||v_cod||'@t.test','',now(),now()),
         (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ob_'||v_cod||'@t.test','',now(),now()),
         (a_c1 ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o1_'||v_cod||'@t.test','',now(),now()),
         (a_c2 ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o2_'||v_cod||'@t.test','',now(),now());

  -- ── EL LOCAL, CON UN BARBERO YA APROBADO ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Obstaculos Barber','empleados','DOP',true,'barbero','Duenno','809',
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

  perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Uno', '829');
  select id into u_c1 from turno_usuarios where auth_id = a_c1;

  perform set_config('request.jwt.claims', json_build_object('sub', a_c2::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Dos', '829');
  select id into u_c2 from turno_usuarios where auth_id = a_c2;

  -- Uno esperando en la fila. Todo lo que sigue le pasa por encima.
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
  q_c1 := r.id;

  -- Y una cita reservada de madrugada, para probar el cruce con los bloqueos
  -- sin que la hora real a la que se corra la suite interfiera.
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_c2, v_neg, s_corte, v_hoy, time '05:30', time '06:00', 'confirmada')
  returning id into cita_tarde;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);

  -- ── BLOQUEOS × FILA ───────────────────────────────────────────────────────

  n:=n+1; c:='bloqueo · entra en un hueco libre';
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_bar, v_hoy, time '06:45', time '07:15', 'Desayuno');
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- Bloquear tiempo NO es cerrar: la gente que ya estaba esperando sigue ahí.
  n:=n+1; c:='bloqueo · la fila que ya esperaba sigue viva';
  select estado into v_txt from turno_cola where id = q_c1;
  if v_txt = 'en_fila' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el turno quedó en '||coalesce(v_txt,'NULL'); end if;

  -- ── EL CRUCE QUE FALLABA ──────────────────────────────────────────────────
  -- "Me voy de 05:00 a 06:30" con una cita confirmada a las 05:30 dentro.
  n:=n+1; c:='bloqueo · NO puede taparse una cita ya reservada';
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_bar, v_hoy, time '05:00', time '06:30', 'Me voy');
    fallos := fallos||E'\n  x '||c||' - se bloqueó encima de una cita confirmada';
  exception when others then
    if sqlerrm like '%cita%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- Un "no se puede" a secas obliga al barbero a buscar. El error dice la hora.
  n:=n+1; c:='bloqueo · el rechazo dice a qué hora es la cita';
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_bar, v_hoy, time '05:00', time '06:30', 'Me voy');
    fallos := fallos||E'\n  x '||c||' - no falló';
  exception when others then
    if sqlerrm like '%05:30%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - mensaje sin hora: '||sqlerrm; end if;
  end;

  -- Se rechaza, no se prohíbe: cancelando la cita —y avisando al cliente— el
  -- barbero sí puede irse.
  n:=n+1; c:='bloqueo · cancelada la cita, el mismo bloqueo entra';
  update turno_citas set estado='cancelada', cancelada_by='barbero' where id = cita_tarde;
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_bar, v_hoy, time '05:00', time '06:30', 'Me voy');
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── BLOQUEOS × AGENDA ─────────────────────────────────────────────────────
  n:=n+1; c:='agenda · la hora bloqueada desaparece de los slots';
  insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_bar, v_manana, time '10:00', time '12:00', 'Diligencia');
  select count(*) into v_int
    from turno_slots_disponibles(p_bar, v_manana, s_corte) s
   where s >= time '10:00' and s < time '12:00';
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' slots ofrecidos dentro del bloqueo'; end if;

  -- ── AGENDA × FILA ─────────────────────────────────────────────────────────
  -- Una cita confirmada en curso reserva al barbero: la fila espera su turno,
  -- no se lo come.
  n:=n+1; c:='agenda · una cita en curso frena la fila';
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_c2, v_neg, s_corte, v_hoy,
          (v_t - interval '5 min')::time, (v_t + interval '25 min')::time, 'confirmada')
  returning id into cita_ahora;
  begin
    select * into r from turno_llamar_siguiente(v_neg, p_bar);
    if r.id is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - llamó a alguien teniendo una cita encima'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='agenda · el que esperaba no se perdió por el camino';
  select estado into v_txt from turno_cola where id = q_c1;
  if v_txt = 'en_fila' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_txt,'NULL'); end if;

  -- Terminada la cita, la fila vuelve a correr.
  update turno_citas set estado='atendida', atendida_at=now() where id = cita_ahora;

  n:=n+1; c:='agenda · cerrada la cita, la fila vuelve a correr';
  begin
    select * into r from turno_llamar_siguiente(v_neg, p_bar);
    if r.id = q_c1 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - llamó a '||coalesce(r.id::text,'nadie'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── EL "NO LLEGÓ" ─────────────────────────────────────────────────────────
  -- El cliente perdió su cita. No se le echa a la calle: entra a la fila con
  -- prioridad, delante de los que llegaron sin reservar. Ahora mismo el único
  -- turno vivo (q_c1) está 'llamado', no 'en_fila': ahí es donde el cálculo de
  -- la posición se reciclaba.
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_c2, v_neg, s_corte, v_hoy, time '09:00', time '09:30', 'confirmada')
  returning id into cita_c2;
  update turno_citas set estado='no_llego' where id = cita_c2;

  n:=n+1; c:='no_llego · el cliente entra a la fila con prioridad';
  select prioridad into v_int from turno_cola
   where cliente_id = u_c2 and estado = 'en_fila' order by created_at desc limit 1;
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - prioridad '||coalesce(v_int::text,'sin turno'); end if;

  -- Sin tipo_servicio, R1 no lo cubre: los NULL no chocan en el índice único y
  -- el cliente puede acumular turnos.
  n:=n+1; c:='no_llego · ese turno trae tipo_servicio';
  select tipo_servicio into v_txt from turno_cola
   where cliente_id = u_c2 and estado = 'en_fila' order by created_at desc limit 1;
  if v_txt is not null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - tipo_servicio NULL: el cliente puede duplicar turnos'; end if;

  n:=n+1; c:='no_llego · no le da una posición ya entregada';
  select posicion into v_int from turno_cola
   where cliente_id = u_c2 and estado = 'en_fila' order by created_at desc limit 1;
  if v_int > (select posicion from turno_cola where id = q_c1) then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - posición '||coalesce(v_int::text,'?')||' pisa la del que ya esperaba'; end if;

  -- ── EL BARBERO SE PLANTA ──────────────────────────────────────────────────
  n:=n+1; c:='descanso · deja de aceptar, pero no borra a nadie';
  update turno_perfiles set estado_actual = 'descanso' where id = p_bar;
  select e.estado, e.acepta into v_txt, v_bool from turno_estado_barbero(p_bar) e;
  select count(*) into v_int from turno_cola
   where perfil_id = p_bar and estado in ('en_fila','llamado','en_camino','atendiendo');
  if v_txt = 'descanso' and v_bool = false and v_int >= 2 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - estado '||coalesce(v_txt,'?')||
       ', acepta '||coalesce(v_bool::text,'?')||', '||v_int||' turnos vivos'; end if;

  n:=n+1; c:='descanso · vuelve y sigue aceptando';
  update turno_perfiles set estado_actual = 'disponible' where id = p_bar;
  select e.acepta into v_bool from turno_estado_barbero(p_bar) e;
  if v_bool then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - se quedó fuera de la lista'; end if;

  -- Dar de baja una silla con gente esperando cierra la puerta del API, no solo
  -- la de la pantalla.
  n:=n+1; c:='baja · un perfil desactivado ya no puede operar su fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_perfiles set activo = false where id = p_bar;
  begin
    perform turno_llamar_siguiente(v_neg, p_bar);
    fallos := fallos||E'\n  x '||c||' - siguió llamando clientes';
  exception when others then
    if sqlerrm like '%aprobado%' or sqlerrm like '%no puedes operar%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- ── EL QUE NO LLEGA PIERDE EL TURNO ───────────────────────────────────────
  -- El orden es una regla (migración 58), pero un turno se pierde por no
  -- presentarse: si a quien le toca no está, el siguiente entra sin haberse
  -- saltado a nadie. La diferencia entre eso y adelantar a dedo son las dos
  -- condiciones que se prueban aquí — hay que haberlo llamado, y tiene que ser
  -- el turno que toca.
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  update turno_perfiles set estado_actual = 'disponible' where id = p_bar;
  update turno_perfiles set activo = true where id = p_bar;

  n:=n+1; c:='ausente · no se puede marcar sin haberlo llamado';
  begin
    select * into r from turno_cola where negocio_id = v_neg and estado = 'en_fila'
     order by prioridad, posicion limit 1;
    if r.id is null then fallos:=fallos||E'\n  x '||c||' - la fila estaba vacía';
    else
      perform turno_no_esta(r.id);
      fallos:=fallos||E'\n  x '||c||' - se saltó a alguien que nunca tuvo su turno';
    end if;
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='ausente · llamado y ausente, pierde el turno';
  begin
    select * into r from turno_llamar_siguiente(v_neg, p_bar);
    if r.id is null then fallos:=fallos||E'\n  x '||c||' - no había a quien llamar';
    else
      perform turno_no_esta(r.id);
      select estado into v_txt from turno_cola where id = r.id;
      if v_txt = 'expirado' then ok:=ok+1;
      else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_txt,'?'); end if;
    end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── EL HUECO DEL AUSENTE, Y AVISAR A QUIEN SE LE MUEVE LA ESPERA ──────────
  -- Estas dos reglas se reescribieron tres veces en una tarde, y cada versión
  -- parecía razonable hasta que se miraba a quién le costaba algo. Por eso están
  -- aquí: lo que se prueba es justamente que NADIE de atrás pierde nada.
  --
  -- Se limpia primero lo que quedó a medias de los casos anteriores: si queda
  -- alguien 'llamado' de antes, no es el turno que toca y la sustitución se
  -- negaría por una razón que no es la que se quiere probar.
  update turno_cola set estado = 'atendido', atendido_at = now()
   where negocio_id = v_neg and estado in ('llamado','en_camino');

  perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
  q_ausente := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
  q_detras := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  select * into r from turno_registrar_fisico(v_neg, p_bar, s_corte, 'Presente', '809');
  q_presente := r.id;

  select posicion into v_pos_antes from turno_cola where id = q_detras;
  select * into r from turno_llamar_siguiente(v_neg, p_bar);   -- el ausente

  n:=n+1; c:='hueco · un turno DIGITAL no puede colarse por aquí';
  begin
    perform turno_sustituir_ausente(r.id, q_detras);
    fallos:=fallos||E'\n  x '||c||' - se coló alguien que no está en el local';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='hueco · el que está en el local hereda el sitio del ausente';
  begin
    perform turno_sustituir_ausente(r.id, q_presente);
    if (select posicion from turno_cola where id = q_presente)
       = (select posicion from turno_cola where id = r.id)
      then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- Lo que de verdad importa: el de atrás no paga la sustitución.
  n:=n+1; c:='hueco · el que venía detrás CONSERVA su puesto';
  select posicion into v_int from turno_cola where id = q_detras;
  if v_int = v_pos_antes and (select estado from turno_cola where id = q_detras) = 'en_fila'
    then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - de la posición '||v_pos_antes||' a la '||coalesce(v_int::text,'?'); end if;

  -- El tiempo es un aproximado, pero si cambia hay que decirlo.
  n:=n+1; c:='aviso · a quien se le movió la espera sale en la lista';
  select count(*) into v_int from turno_avisos_de_espera(v_neg, 5);
  if v_int >= 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - nadie a quien avisar tras cambiar la fila'; end if;

  n:=n+1; c:='aviso · no se avisa dos veces de lo mismo';
  select count(*) into v_int from turno_avisos_de_espera(v_neg, 5);
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' avisos repetidos'; end if;

  -- ── LA CARTERA ES DE QUIEN PUEDE VOLVER (migración 64) ────────────────────
  -- Aquí arriba hay de los dos: clientes que se unieron con el código (con
  -- auth_id) y un walk-in que apuntó el barbero (sin auth_id, creado por
  -- turno_registrar_fisico). Es el sitio para probar que la lista distingue.
  n:=n+1; c:='cartera · el walk-in apuntado por el barbero NO entra en la lista';
  begin
    if exists (select 1 from turno_clientes_del_local(v_neg) x where x.nombre = 'Presente')
      then fallos:=fallos||E'\n  x '||c||' - sigue ahí, y no se le puede escribir';
    else ok:=ok+1; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='cartera · quien se unió con el código SÍ está';
  begin
    if exists (select 1 from turno_clientes_del_local(v_neg) x where x.cliente_id = u_c1)
      then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - se cerró de más'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- Sacarlo de la cartera no es borrarlo: lo que cobró sigue contando.
  n:=n+1; c:='cartera · la visita del walk-in sigue en el historial del local';
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  select q.cliente_id, v_neg, p_bar, s_corte, v_hoy, 500, 'cola_fisica'
    from turno_cola q where q.id = q_presente;
  select count(*) into v_int from turno_historial_visitas h
   where h.negocio_id = v_neg and h.origen = 'cola_fisica';
  if v_int >= 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se perdió lo que cobró'; end if;

  -- ── LA LIMPIEZA DE LA MADRUGADA (migración 75) ────────────────────────────
  -- Reportado desde el teléfono: "las citas abandonadas de días anteriores no
  -- desaparecen ni se gestionan". Sí había quien las cerrara —el cron llama a
  -- turno_cerrar_citas_viejas cada minuto— pero el trigger de la migración 73,
  -- el que impide que un CLIENTE marque su cita como atendida, también se le
  -- aplicaba: el cron corre SIN SESIÓN, así que turno_uid() es null, así que no
  -- es staff, así que se le trataba como al cliente y se le negaba.
  --
  -- Y turno_expirar_llamados hace tres cosas en una transacción, así que al
  -- reventar la tercera se caían las tres: el mantenimiento entero del sistema
  -- llevaba parado desde la 73, sin que se notara, porque solo falla cuando hay
  -- una cita vieja delante.
  --
  -- Estos casos corren SIN SESIÓN a propósito. Es el contexto del cron, y es
  -- justo el que no se probaba: todas las demás suites impersonan a alguien.
  insert into turno_citas (perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
  values (p_bar, u_c1, v_neg, s_corte, v_hoy - 3, time '10:00', time '10:30', 'creada')
  returning id into cita_vieja;

  perform set_config('request.jwt.claims', null, true);
  v_txt := 'NINGUNO';
  begin perform turno_expirar_llamados();
  exception when others then v_txt := sqlerrm; end;

  n:=n+1; c:='limpieza · el cron no revienta con una cita vieja delante';
  if v_txt = 'NINGUNO' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_txt||' (y con él se cae vencer llamados y cerrar olvidados)'; end if;

  n:=n+1; c:='limpieza · la cita de hace tres días queda cerrada';
  select estado into v_txt from turno_citas where id = cita_vieja;
  if v_txt = 'no_llego' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_txt,'?'); end if;

  -- La otra mitad: al arreglar la limpieza, cada cita vieja pasa a 'no_llego',
  -- y ese paso mete al cliente en la fila con prioridad 1. Bien el día de la
  -- cita —el que llega tarde no vuelve al final— y absurdo tres días después:
  -- el cliente amanecía DE PRIMERO por un corte que nunca pidió.
  n:=n+1; c:='limpieza · el que faltó hace tres días NO amanece en la fila de hoy';
  select count(*) into v_int from turno_cola
   where cliente_id = u_c1 and cita_origen_id = cita_vieja
     and estado in ('en_fila','llamado','en_camino','atendiendo');
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' turno(s) fantasma'; end if;

  raise exception E'\n═══ OBSTÁCULOS · % / % casos OK ═══%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
