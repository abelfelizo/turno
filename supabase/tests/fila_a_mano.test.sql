-- ─────────────────────────────────────────────────────────────────────────────
-- LA FILA A MANO · Turno (migración 119)
--
-- La fila se mueve por las RPC —SECURITY DEFINER, con su portero—. Esta suite
-- prueba que la TABLA no deja hacer por detrás lo que las RPC no dejarían:
--
--   · un cliente no se inserta directo, ni se sube la prioridad, ni se marca
--     atendido (lo que apuntaba una visita y regalaba puntos);
--   · el barbero no reordena la fila ni cierra a quien no llamó;
--   · pero lo que la app hace a mano SIGUE funcionando: el cliente sale de la
--     fila y el barbero cobra —y la visita se cuenta—;
--   · y los puntos de un empleado no los enciende él.
--
-- Corre con `set local role authenticated`: sin eso RLS ni se evalúa.
-- Termina en RAISE: la transacción se revierte entera y no deja registros.
-- USO:  psql "$DATABASE_URL" -f supabase/tests/fila_a_mano.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $do$
declare
  v_cod text := upper(substr(md5(random()::text),1,4));
  a_due uuid := gen_random_uuid(); a_emp uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  a_c1 uuid := gen_random_uuid(); a_c2 uuid := gen_random_uuid();
  u_due uuid; u_emp uuid; u_ren uuid; u_c1 uuid; u_c2 uuid;
  n_e uuid; n_r uuid; p_due uuid; p_emp uuid; p_ren uuid; s_e uuid; s_r uuid;
  q1 uuid; q2 uuid; r record; rc int; v_int int; n int := 0; ok int := 0; fallos text := ''; c text;
begin
  -- ═══ montaje ═══
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p119'||i||'_'||v_cod||'@t.test','',now(),now()
    from unnest(array[a_due,a_emp,a_ren,a_c1,a_c2]) with ordinality z(x,i);
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Due','','profesional',a_due) returning id into u_due;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Emp','','profesional',a_emp) returning id into u_emp;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Ren','','profesional',a_ren) returning id into u_ren;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('C1','8095550001','cliente',a_c1) returning id into u_c1;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('C2','8095550002','cliente',a_c2) returning id into u_c2;
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo) values ('P119E','empleados','PE'||v_cod,'DOP',true) returning id into n_e;
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo) values ('P119R','espacios_rentados','PR'||v_cod,'DOP',true) returning id into n_r;
  insert into turno_configuracion_negocio (negocio_id) values (n_e),(n_r);
  insert into turno_membresias (usuario_id,negocio_id,rol,activo) values
    (u_due,n_e,'dueno',true),(u_emp,n_e,'empleado',true),(u_ren,n_r,'barbero_renta',true),
    (u_c1,n_e,'cliente',true),(u_c2,n_e,'cliente',true),(u_c1,n_r,'cliente',true);
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo,acepta_por_su_cuenta)
    values (u_emp,n_e,'barbero','disponible',true,true,true) returning id into p_emp;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_ren,n_r,'barbero','disponible',true,true) returning id into p_ren;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_emp,'Corte',30,500,true) returning id into s_e;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_ren,'Corte',30,500,true) returning id into s_r;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select pf, d, time '00:01', time '23:59', true, 0 from (values (p_emp),(p_ren)) x(pf), generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  -- las RPC siguen funcionando (van por la puerta)
  n:=n+1; c:='RPC · el cliente entra a la fila';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
    select * into r from turno_entrar_a_cola(n_e, s_e, 'digital', p_emp); q1 := r.id;
    perform set_config('request.jwt.claims', json_build_object('sub', a_c2::text)::text, true);
    select * into r from turno_entrar_a_cola(n_e, s_e, 'digital', p_emp); q2 := r.id;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ═══ lo que se cierra ═══
  n:=n+1; c:='cliente · NO se inserta directo en la fila';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
    set local role authenticated;
    insert into turno_cola (negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
    values (n_r, p_ren, u_c1, s_r, 'digital', 'barbero', 1, 0, 'en_fila');
    reset role; fallos:=fallos||E'\n  x '||c||' - se coló';
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='cliente · NO se sube la prioridad de su propio turno';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
    set local role authenticated;
    update turno_cola set prioridad = 1, posicion = 0 where id = q1; get diagnostics rc = row_count;
    reset role;
    if rc = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - cambió '||rc; end if;
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='cliente · NO se marca atendido (no se inventa una visita)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
    set local role authenticated;
    update turno_cola set estado = 'atendido', atendido_at = now() where id = q1; get diagnostics rc = row_count;
    reset role;
    if rc = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - cambió '||rc; end if;
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='cliente · NO toca el turno de otro';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c2::text)::text, true);
    set local role authenticated;
    update turno_cola set estado = 'abandonado' where id = q1; get diagnostics rc = row_count;
    reset role;
    if rc = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - cambió '||rc; end if;
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='barbero · NO reordena la fila a mano';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    update turno_cola set posicion = 0 where id = q2; get diagnostics rc = row_count;
    reset role;
    if rc = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - cambió '||rc; end if;
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='barbero · NO marca atendido a quien espera sin llamarlo';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    update turno_cola set estado = 'atendido', atendido_at = now() where id = q2; get diagnostics rc = row_count;
    reset role;
    if rc = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - cambió '||rc; end if;
  exception when others then reset role; ok:=ok+1; end;

  -- ═══ lo que la app hace y tiene que seguir funcionando ═══
  n:=n+1; c:='app · el cliente SÍ sale de la fila (salirDeCola)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c2::text)::text, true);
    set local role authenticated;
    update turno_cola set estado = 'abandonado' where id = q2; get diagnostics rc = row_count;
    reset role;
    if rc = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - filas '||rc; end if;
    raise exception 'revertir';
  exception when others then reset role; if sqlerrm <> 'revertir' then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if; end;

  n:=n+1; c:='app · el barbero SÍ cobra (atendiendo → atendido) y cuenta la visita';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    perform turno_llamar_siguiente(n_e, p_emp);
    perform turno_iniciar_atencion(q1);
    set local role authenticated;
    update turno_cola set estado = 'atendido', atendido_at = now() where id = q1; get diagnostics rc = row_count;
    reset role;
    select count(*) into v_int from turno_historial_visitas where perfil_id = p_emp;
    if rc = 1 and v_int = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - filas '||rc||', visitas '||v_int; end if;
  exception when others then reset role; fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='RPC · sentar sin cita, sacar y cambiar servicio siguen funcionando';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    perform turno_cambiar_servicio(q2, s_e);
    perform turno_sacar_de_cola(q2);
    perform turno_atender_sin_cita(n_e, p_emp, s_e, 'Calle', '');
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ═══ puntos ═══
  n:=n+1; c:='puntos · el empleado NO enciende su tarjeta propia';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    update turno_perfiles set puntos_activos = true where id = p_emp;
    reset role; fallos:=fallos||E'\n  x '||c||' - lo encendió';
  exception when others then reset role;
    if sqlerrm like '%los lleva el local%' then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if; end;

  n:=n+1; c:='puntos · el empleado SÍ cambia su recordatorio (revisita_dias)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    update turno_perfiles set revisita_dias = 45 where id = p_emp; get diagnostics rc = row_count;
    reset role;
    if rc = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - filas '||rc; end if;
  exception when others then reset role; fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='puntos · quien alquila SÍ enciende la suya';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    set local role authenticated;
    update turno_perfiles set puntos_activos = true, premio = 'Barba gratis' where id = p_ren; get diagnostics rc = row_count;
    reset role;
    if rc = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - filas '||rc; end if;
  exception when others then reset role; fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='puntos · el dueño SÍ puede apagar la de su empleado';
  begin
    update turno_perfiles set puntos_activos = true where id = p_emp;  -- dato viejo, como el de producción
    perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
    set local role authenticated;
    update turno_perfiles set puntos_activos = false where id = p_emp; get diagnostics rc = row_count;
    reset role;
    if rc = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - filas '||rc; end if;
  exception when others then reset role; fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  raise exception E'\n=== LA FILA A MANO (119) · % / % casos OK ===%', ok, n,
    case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $do$;
