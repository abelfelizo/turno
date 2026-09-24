-- ─────────────────────────────────────────────────────────────────────────────
-- LOS CLIENTES DEL DUEÑO · Turno (migración 120)
--
-- turno_clientes_del_local_admin cuenta, para quien administra, las visitas
-- de las sillas que MANDA —la suya y las de sus empleados—, y no las de quien
-- le renta un asiento. La función vieja (117), la del barbero, no cambia.
--
-- Un local de empleados con las tres clases de silla: el dueño que atiende,
-- un empleado y alguien que renta dentro (local mixto).
--
-- Termina en RAISE: la transacción se revierte entera y no deja registros.
-- USO:  psql "$DATABASE_URL" -f supabase/tests/clientes_dueno.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $do$
declare
  v_cod text := upper(substr(md5(random()::text),1,4));
  a_due uuid := gen_random_uuid(); a_emp uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  a_c1 uuid := gen_random_uuid(); a_c2 uuid := gen_random_uuid(); a_c3 uuid := gen_random_uuid();
  u_due uuid; u_emp uuid; u_ren uuid; u_c1 uuid; u_c2 uuid; u_c3 uuid;
  n_e uuid; p_due uuid; p_emp uuid; p_ren uuid; s_due uuid; s_emp uuid; s_ren uuid;
  r record; v_int int; n int := 0; ok int := 0; fallos text := ''; c text;
begin
  -- ═══ montaje ═══
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p120'||i||'_'||v_cod||'@t.test','',now(),now()
    from unnest(array[a_due,a_emp,a_ren,a_c1,a_c2,a_c3]) with ordinality z(x,i);
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Due','','profesional',a_due) returning id into u_due;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Emp','','profesional',a_emp) returning id into u_emp;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Ren','','profesional',a_ren) returning id into u_ren;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('C1','8095550001','cliente',a_c1) returning id into u_c1;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('C2','8095550002','cliente',a_c2) returning id into u_c2;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('C3','8095550003','cliente',a_c3) returning id into u_c3;
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo) values ('P120','empleados','PC'||v_cod,'DOP',true) returning id into n_e;
  insert into turno_configuracion_negocio (negocio_id) values (n_e);
  insert into turno_membresias (usuario_id,negocio_id,rol,activo) values
    (u_due,n_e,'dueno',true),(u_emp,n_e,'empleado',true),(u_ren,n_e,'barbero_renta',true),
    (u_c1,n_e,'cliente',true),(u_c2,n_e,'cliente',true),(u_c3,n_e,'cliente',true);
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_due,n_e,'barbero','disponible',true,true) returning id into p_due;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_emp,n_e,'barbero','disponible',true,true) returning id into p_emp;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_ren,n_e,'barbero','disponible',true,true) returning id into p_ren;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_due,'Corte',30,500,true) returning id into s_due;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_emp,'Corte',30,500,true) returning id into s_emp;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_ren,'Corte',30,900,true) returning id into s_ren;

  -- C1: dos con el empleado y una con el dueño. C2: solo con quien renta. C3: nunca.
  insert into turno_historial_visitas (perfil_id,cliente_id,negocio_id,servicio_id,precio_cobrado,origen,fecha) values
    (p_emp,u_c1,n_e,s_emp,500,'cola_digital',current_date - 10),
    (p_emp,u_c1,n_e,s_emp,500,'cita',current_date - 3),
    (p_due,u_c1,n_e,s_due,500,'cola_fisica',current_date - 20),
    (p_ren,u_c2,n_e,s_ren,900,'cola_digital',current_date - 2);

  -- ═══ el dueño, con la función nueva ═══
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);

  n:=n+1; c:='dueño · C1 cuenta las visitas del empleado y las suyas';
  begin
    select * into r from turno_clientes_del_local_admin(n_e) x where x.cliente_id = u_c1;
    if r.visitas = 3 and r.total = 1500 and r.ultima = current_date - 3 then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||coalesce(r.visitas::text,'null')||' / '||coalesce(r.total::text,'null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='dueño · con quién se corta C1: el empleado';
  begin
    select * into r from turno_clientes_del_local_admin(n_e) x where x.cliente_id = u_c1;
    if r.barbero = 'Emp' then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||coalesce(r.barbero,'null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='dueño · C2 sale en la lista, pero lo de quien renta no se le cuenta';
  begin
    select * into r from turno_clientes_del_local_admin(n_e) x where x.cliente_id = u_c2;
    if found and r.visitas = 0 and r.total = 0 and r.ultima is null and r.barbero is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||coalesce(r.visitas::text,'no sale')||' / '||coalesce(r.total::text,'null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='dueño · C3, que nunca vino, sale con cero';
  begin
    select count(*) into v_int from turno_clientes_del_local_admin(n_e) x where x.cliente_id = u_c3 and x.visitas = 0;
    if v_int = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='dueño · la función vieja (la de Mi silla) sigue contando solo la suya';
  begin
    select * into r from turno_clientes_del_local(n_e) x where x.cliente_id = u_c1;
    if r.visitas = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||coalesce(r.visitas::text,'null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ═══ los demás no la abren ═══
  n:=n+1; c:='empleado · NO abre la de administrador';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    perform * from turno_clientes_del_local_admin(n_e);
    fallos:=fallos||E'\n  x '||c||' - la abrió';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='quien renta · NO abre la de administrador';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    perform * from turno_clientes_del_local_admin(n_e);
    fallos:=fallos||E'\n  x '||c||' - la abrió';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='cliente · NO abre la de administrador';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_c1::text)::text, true);
    perform * from turno_clientes_del_local_admin(n_e);
    fallos:=fallos||E'\n  x '||c||' - la abrió';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='empleado · su lista (117) no cambia: solo C1, con sus 2';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    select count(*) into v_int from turno_clientes_del_local(n_e);
    select * into r from turno_clientes_del_local(n_e) x where x.cliente_id = u_c1;
    if v_int = 1 and r.visitas = 2 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' filas, '||coalesce(r.visitas::text,'null'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  if fallos = '' then
    raise exception 'CLIENTES DEL DUEÑO · %/% · TODO VERDE (se revierte)', ok, n;
  else
    raise exception 'CLIENTES DEL DUEÑO · %/% · FALLAN:%', ok, n, fallos;
  end if;
end $do$;
