-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBAS DE FIDELIDAD · Turno
--
-- El programa cuenta RECORTES, no puntos abstractos: "cada X recortes te ganas
-- esto". Y la tarjeta pertenece a quien pone la regla, que es la regla R11
-- aplicada a la fidelidad:
--
--   Local de empleados → la tarjeta es del LOCAL   (perfil_id NULL)
--   Barbero que renta  → la tarjeta es del BARBERO (perfil_id)
--
-- Lo que se comprueba aquí es justo lo que antes no cuadraba: se acumulaba con
-- las reglas del barbero pero se canjeaba con las del local, así que el cliente
-- podía ver un premio que el canje le negaba.
--
-- Termina en RAISE para revertir la transacción entera: no deja ni un registro
-- (la BD es compartida con otro proyecto).
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/fidelidad.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_neg uuid; v_cod text := 'FID-' || upper(substr(md5(random()::text), 1, 4));
  a_due uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  u_due uuid; u_cli uuid; u_ren uuid; p_due uuid; p_ren uuid; s_corte uuid; s_ren uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; v_int int; r record; f record;
begin
  -- ── FIXTURES · un local de empleados que ADEMÁS alquila un asiento ─────────
  -- El caso mixto es el interesante: conviven la tarjeta del local y la del
  -- rentado, con metas y premios distintos.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fd_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fc_'||v_cod||'@t.test','',now(),now()),
         (a_ren,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fr_'||v_cod||'@t.test','',now(),now());
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('D','','profesional',a_due) returning id into u_due;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Cli','','cliente',a_cli) returning id into u_cli;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Rent','','profesional',a_ren) returning id into u_ren;
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo) values ('T Fid','empleados',v_cod,'DOP',true) returning id into v_neg;
  insert into turno_configuracion_negocio (negocio_id, puntos_activos, visitas_para_gratis, premio)
    values (v_neg, true, 3, 'Corte gratis');
  insert into turno_membresias (usuario_id,negocio_id,rol,activo) values
    (u_due,v_neg,'dueno',true),(u_cli,v_neg,'cliente',true),(u_ren,v_neg,'barbero_renta',true);
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_due,v_neg,'barbero','disponible',true,true) returning id into p_due;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo,puntos_activos,puntos_meta,premio)
    values (u_ren,v_neg,'barbero','disponible',true,true,true,2,'Barba gratis') returning id into p_ren;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_due,'Corte',30,500,true) returning id into s_corte;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_ren,'Corte',30,700,true) returning id into s_ren;

  -- ── CASO 1-2 · de quién es la regla ───────────────────────────────────────
  n:=n+1; c:='ambito · el dueño usa la tarjeta del LOCAL';
  select * into f from turno_fidelidad(p_due, v_neg);
  if f.ambito = 'negocio' and f.meta = 3 and f.premio = 'Corte gratis' then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - '||f.ambito||'/'||f.meta||'/'||f.premio; end if;

  n:=n+1; c:='ambito · el rentado usa la SUYA';
  select * into f from turno_fidelidad(p_ren, v_neg);
  if f.ambito = 'perfil' and f.meta = 2 and f.premio = 'Barba gratis' then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - '||f.ambito||'/'||f.meta||'/'||f.premio; end if;

  -- ── CASO 3 · dos tarjetas separadas para el mismo cliente ─────────────────
  -- Antes había un solo saldo por (cliente, local) aunque las reglas fueran del
  -- barbero: dos rentados con metas distintas compartían bolsa.
  n:=n+1; c:='acumular · 1 visita = 1 recorte, en la tarjeta correcta';
  insert into turno_historial_visitas(perfil_id,cliente_id,negocio_id,servicio_id,precio_cobrado,origen,fecha)
    values (p_due,u_cli,v_neg,s_corte,500,'cola_digital',current_date),
           (p_ren,u_cli,v_neg,s_ren,700,'cola_digital',current_date);
  select count(*) into v_int from turno_puntos where usuario_id=u_cli and negocio_id=v_neg;
  if v_int = 2 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - '||v_int||' tarjetas (esperadas 2: local y rentado)'; end if;

  -- ── CASO 4 · no se canjea lo que no se ha ganado ──────────────────────────
  n:=n+1; c:='canje · aún no llega (1 de 3 del local)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
    perform turno_emitir_canje(v_neg, null);
    fallos := fallos || E'\n  x '||c||' - canjeó sin tener';
  exception when others then
    if sqlerrm like '%te faltan%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ── CASO 5 · cada tarjeta con su propia meta ──────────────────────────────
  n:=n+1; c:='canje · el rentado con meta 2 canjea a la segunda';
  insert into turno_historial_visitas(perfil_id,cliente_id,negocio_id,servicio_id,precio_cobrado,origen,fecha)
    values (p_ren,u_cli,v_neg,s_ren,700,'cola_digital',current_date);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
    select * into r from turno_emitir_canje(v_neg, p_ren);
    if r.premio = 'Barba gratis' and r.visitas_costo = 2 then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - premio='||coalesce(r.premio,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  -- ── CASO 6 · lo prometido se cumple ───────────────────────────────────────
  -- El premio se copia al vale al emitirlo. Si el barbero lo cambia mañana,
  -- quien ya lo ganó cobra lo que se le prometió, no lo nuevo.
  n:=n+1; c:='canje · el premio queda congelado en el vale';
  update turno_perfiles set premio = 'Otra cosa' where id = p_ren;
  select premio into c from turno_canjes where usuario_id=u_cli and perfil_id=p_ren limit 1;
  if c = 'Barba gratis' then ok:=ok+1;
  else fallos := fallos || E'\n  x  el vale cambió a '||coalesce(c,'NULL'); end if;

  -- ── RESULTADO (el RAISE revierte todos los fixtures) ──────────────────────
  raise exception E'\n═══ FIDELIDAD · % / % casos OK ═══%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
