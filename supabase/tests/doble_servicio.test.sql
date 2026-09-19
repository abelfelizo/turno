-- ─────────────────────────────────────────────────────────────────────────────
-- EL DOBLE SERVICIO ES UNO DETRÁS DEL OTRO · Turno  (migración 114)
--
-- «Doble servicio es uno detrás de otro con 2 personas diferentes, ejemplo:
-- puede ser un barbero y manicurista.» Antes de la 114 la app hacía lo
-- contrario: el interruptor `doble_servicio_activo` sólo permitía tener dos
-- turnos activos A LA VEZ si eran de oficios distintos. Dos turnos sueltos, en
-- paralelo, sin relación — se podía llamar a la manicura mientras el cliente
-- estaba sentado cortándose el pelo.
--
-- Lo que esta suite fija, y que es todo lo que hace falta para que la regla sea
-- una regla y no una costumbre:
--
--   · Que el segundo turno NO se llame por ninguna de las dos puertas —ni el
--     llamado automático ni el manual— mientras el primero siga vivo.
--   · Que un turno bloqueado NO tape la fila: el barbero tiene que poder seguir
--     llamando a los demás.
--   · Y sobre todo QUE EL SEGUNDO SE SUELTE SOLO cuando el primero termina,
--     acabe bien o acabe mal. Si el primer servicio se abandona y el segundo
--     se quedara esperándolo, ese cliente no volvería a ser llamado nunca.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/doble_servicio.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid(); a_man uuid := gen_random_uuid();
  a_cli uuid := gen_random_uuid(); a_cli2 uuid := gen_random_uuid();
  u_due uuid; v_neg uuid; p_bar uuid; p_man uuid; v_cod text;
  s_corte uuid; s_corte2 uuid; s_unas uuid;
  v_sem text := 'DS-' || upper(substr(md5(random()::text),1,5));
  q_a uuid; q_b uuid; v_espera uuid; v_est text;
  n int := 0; ok int := 0; fallos text := ''; c text; r record; v_int int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ds1_'||v_sem||'@t.test','',now(),now()),
         (a_man ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ds2_'||v_sem||'@t.test','',now(),now()),
         (a_cli ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ds3_'||v_sem||'@t.test','',now(),now()),
         (a_cli2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ds4_'||v_sem||'@t.test','',now(),now());

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Doble Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_bar, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;

  -- La manicurista: OTRO oficio, que es lo que hace que esto sea un doble
  -- servicio y no dos turnos con el mismo barbero.
  perform set_config('request.jwt.claims', json_build_object('sub', a_man::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'manicuri_pedicuri','empleado','Manicurista','809');
  p_man := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_responder_solicitud(p_man, true);
  -- Y se le da permiso para servirse de su propia fila. Por la migración 109 un
  -- empleado NO reparte la fila salvo que la barbería se lo active, y sin esto
  -- la suite se pondría roja por esa regla en vez de por la que quiere probar.
  update turno_perfiles set acepta_por_su_cuenta = true where id = p_man;

  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar,'Corte',30,500,true) returning id into s_corte;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_bar,'Barba',20,300,true) returning id into s_corte2;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_man,'Uñas',40,700,true) returning id into s_unas;

  -- Fila abierta todo el día para los dos, que aquí no se prueba el horario.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select pf, d, time '00:01', time '23:59', true, 0
      from (values (p_bar),(p_man)) x(pf), generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Doble', '829');
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Suelto', '829');

  -- ══ 1. MONTAJE ════════════════════════════════════════════════════════════
  n:=n+1; c:='montaje - los dos oficios tienen la fila abierta';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  if turno_fila_abierta(p_bar, v_neg) is null and turno_fila_abierta(p_man, v_neg) is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - bar:'||coalesce(turno_fila_abierta(p_bar,v_neg),'ok')
                     ||' man:'||coalesce(turno_fila_abierta(p_man,v_neg),'ok'); end if;

  -- ══ 2. PEDIR LOS DOS ══════════════════════════════════════════════════════
  n:=n+1; c:='pedir doble - devuelve DOS turnos';
  select count(*)::int into v_int
    from turno_entrar_a_cola_doble(v_neg, s_corte, s_unas, 'digital', p_bar, p_man) t;
  if v_int = 2 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - devolvió '||v_int; end if;

  select id into q_a from turno_cola where cliente_id = (select id from turno_usuarios where auth_id=a_cli)
    and perfil_id = p_bar and estado = 'en_fila';
  select id, espera_a_id into q_b, v_espera from turno_cola
   where cliente_id = (select id from turno_usuarios where auth_id=a_cli)
     and perfil_id = p_man and estado = 'en_fila';

  n:=n+1; c:='el segundo queda ENGANCHADO al primero';
  if v_espera = q_a then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - espera_a='||coalesce(v_espera::text,'(nada)'); end if;

  n:=n+1; c:='y el primero no espera a nadie';
  select espera_a_id into v_espera from turno_cola where id = q_a;
  if v_espera is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ 3. AL SEGUNDO NO SE LE LLAMA ANTES DE TIEMPO ══════════════════════════
  n:=n+1; c:='la manicurista NO recibe al cliente mientras se corta el pelo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_man::text)::text, true);
  select * into r from turno_llamar_siguiente(v_neg, p_man);
  if r.id is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - llamó a '||r.id::text; end if;

  n:=n+1; c:='ni llamándolo a mano desde la lista';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_llamar_a(q_b);
    fallos:=fallos||E'\n  x '||c||' - la regla vivía solo en el llamado automático';
  exception when others then
    if sqlerrm like '%primer servicio%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - se negó por otra razón: '||sqlerrm; end if;
  end;

  n:=n+1; c:='el barbero SÍ llama al primero';
  select * into r from turno_llamar_siguiente(v_neg, p_bar);
  if r.id = q_a then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - llamó a '||coalesce(r.id::text,'(nadie)'); end if;

  -- ══ 4. UN TURNO BLOQUEADO NO TAPA LA FILA ═════════════════════════════════
  -- Si el bloqueado contara como "hay alguien antes", la manicurista se
  -- quedaría sin poder atender a nadie mientras ese cliente está en la otra
  -- silla. Cerrar de más también es incumplir la regla.
  n:=n+1; c:='otro cliente SÍ entra y SÍ se le llama, con el bloqueado delante';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli2::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_unas, 'digital', p_man);
  perform set_config('request.jwt.claims', json_build_object('sub', a_man::text)::text, true);
  declare q_otro uuid := r.id; begin
    select * into r from turno_llamar_siguiente(v_neg, p_man);
    if r.id = q_otro then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - llamó a '||coalesce(r.id::text,'(nadie)')
                       ||': el turno bloqueado tapaba la fila'; end if;
    update turno_cola set estado='atendido', atendido_at=now() where id = q_otro;
  end;

  -- ══ 5. SE SUELTA CUANDO EL PRIMERO TERMINA ════════════════════════════════
  n:=n+1; c:='terminado el corte, el segundo turno se suelta solo';
  update turno_cola set estado='atendido', atendido_at=now() where id = q_a;
  select espera_a_id into v_espera from turno_cola where id = q_b;
  if v_espera is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - sigue enganchado a '||v_espera::text; end if;

  n:=n+1; c:='y ahora la manicurista sí lo llama';
  perform set_config('request.jwt.claims', json_build_object('sub', a_man::text)::text, true);
  select * into r from turno_llamar_siguiente(v_neg, p_man);
  if r.id = q_b then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - llamó a '||coalesce(r.id::text,'(nadie)'); end if;
  update turno_cola set estado='atendido', atendido_at=now() where id = q_b;

  -- ══ 6. Y TAMBIÉN CUANDO EL PRIMERO ACABA MAL ══════════════════════════════
  -- Éste es el caso que deja a un cliente colgado para siempre si se olvida.
  n:=n+1; c:='si el PRIMERO se abandona, el segundo tambien se suelta';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_entrar_a_cola_doble(v_neg, s_corte, s_unas, 'digital', p_bar, p_man);
  select id into q_a from turno_cola where cliente_id = (select id from turno_usuarios where auth_id=a_cli)
    and perfil_id = p_bar and estado = 'en_fila';
  select id into q_b from turno_cola where cliente_id = (select id from turno_usuarios where auth_id=a_cli)
    and perfil_id = p_man and estado = 'en_fila';
  update turno_cola set estado='abandonado' where id = q_a;
  select espera_a_id into v_espera from turno_cola where id = q_b;
  if v_espera is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se quedaría esperando algo que ya no va a pasar'; end if;
  update turno_cola set estado='abandonado' where id = q_b;

  -- ══ 7. LO QUE NO ES UN DOBLE SERVICIO ═════════════════════════════════════
  n:=n+1; c:='dos servicios del MISMO oficio no son un doble servicio';
  begin
    perform turno_entrar_a_cola_doble(v_neg, s_corte, s_corte2, 'digital', p_bar, p_bar);
    fallos:=fallos||E'\n  x '||c||' - lo aceptó';
  exception when others then
    if sqlerrm like '%otra persona%' or sqlerrm like '%oficios distintos%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='ni el mismo servicio dos veces';
  begin
    perform turno_entrar_a_cola_doble(v_neg, s_corte, s_corte, 'digital', p_bar, p_man);
    fallos:=fallos||E'\n  x '||c||' - lo aceptó';
  exception when others then
    if sqlerrm like '%dos servicios distintos%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ══ 8. EL INTERRUPTOR DEL LOCAL SIGUE MANDANDO ════════════════════════════
  n:=n+1; c:='con el doble servicio apagado, el local no lo encadena';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_configuracion_negocio set doble_servicio_activo = false where negocio_id = v_neg;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola_doble(v_neg, s_corte, s_unas, 'digital', p_bar, p_man);
    fallos:=fallos||E'\n  x '||c||' - lo encadenó con el interruptor apagado';
  exception when others then
    if sqlerrm like '%no encadena%' or sqlerrm like '%ya tienes un turno activo%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_configuracion_negocio set doble_servicio_activo = true where negocio_id = v_neg;

  -- ══ 9. LA PUERTA ══════════════════════════════════════════════════════════
  n:=n+1; c:='un anónimo no encadena servicios en un local ajeno';
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  begin
    perform turno_entrar_a_cola_doble(v_neg, s_corte, s_unas, 'digital', p_bar, p_man);
    reset role;
    fallos:=fallos||E'\n  x '||c||' - entró sin sesión';
  exception when others then reset role; ok:=ok+1; end;

  raise exception E'\n=== DOBLE SERVICIO - % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
