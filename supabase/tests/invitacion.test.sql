-- ─────────────────────────────────────────────────────────────────────────────
-- ENTRAR A UN LOCAL LO FIRMAN LOS DOS · Turno (migración 110)
--
-- La regla, en palabras del dueño del producto:
--
--   «Puede agregar y puede ser agregado por barberos con aprobación mutua.»
--
-- Dos direcciones, dos firmas, y ninguna de las dos vale sola:
--
--   barbero → local   con el código del local   → falta el sí del LOCAL
--   local → barbero   con el código del barbero → falta el sí del BARBERO
--
-- Esta suite existe por dos razones, y la segunda importa más que la primera:
--
--   1. La dirección local → barbero es NUEVA: no había dónde probarla.
--
--   2. La otra CORRIGE una regla que estuvo verde durante veinte migraciones.
--      La 94 decidió que en asientos alquilados el barbero entra activo, se
--      agrega él solo, razonando que «quien no dirige, tampoco autoriza». El
--      razonamiento confundía dos cosas: **decidir quién entra en tu casa no es
--      dirigir a nadie.** El casero sigue sin poner precios ni horarios (92) y
--      sin ver un peso de lo que su inquilino factura (97) — pero el código del
--      local se comparte por WhatsApp, y con la 94 eso bastaba para aparecer en
--      el escaparate de un local ajeno.
--
-- Lo que se prueba de las dos mitades, siempre: que la puerta CIERRA (nadie se
-- mete solo, nadie firma por otro) y que NO CIERRA DE MÁS (el casero sí aprueba,
-- el barbero sí acepta, y los dos síes cruzados no obligan a esperar dos veces).
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Los fixtures se crean FUERA de esos bloques.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/invitacion.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sfx text := upper(substr(md5(random()::text),1,5));
  cod_renta text; cod_emp text;
  a_cas uuid := gen_random_uuid();   -- dueño de ASIENTOS ALQUILADOS (el casero)
  a_jef uuid := gen_random_uuid();   -- dueño de EMPLEADOS (el jefe)
  a_inq uuid := gen_random_uuid();   -- barbero que pide entrar al de renta
  a_inv uuid := gen_random_uuid();   -- barbero al que invitan
  a_otr uuid := gen_random_uuid();   -- un tercero, con local propio
  u_cas uuid; u_jef uuid; u_inq uuid; u_inv uuid; u_otr uuid;
  neg_renta uuid; neg_emp uuid; p_cas uuid; p_jef uuid;
  p_inq uuid; p_inv uuid; cod_inv text; r record;
  n int := 0; ok int := 0; fallos text := ''; c text; v_int int; v_txt text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         'mu'||y||'_'||v_sfx||'@t.test','',now(),now()
    from (values (a_cas,'1'),(a_jef,'2'),(a_inq,'3'),(a_inv,'4'),(a_otr,'5')) v(x,y);

  perform set_config('request.jwt.claims', json_build_object('sub', a_cas::text)::text, true);
  perform turno_crear_negocio('Renta Barber','espacios_rentados','DOP',true,'barbero','Casero','809',2,10,5,true,1,3,false,true);
  select id into u_cas from turno_usuarios where auth_id = a_cas;
  select id, negocio_id into p_cas, neg_renta from turno_perfiles where usuario_id = u_cas limit 1;
  select codigo_acceso into cod_renta from turno_negocios where id = neg_renta;

  perform set_config('request.jwt.claims', json_build_object('sub', a_jef::text)::text, true);
  perform turno_crear_negocio('Empleados Barber','empleados','DOP',true,'barbero','Jefe','809',2,10,5,true,1,3,false,true);
  select id into u_jef from turno_usuarios where auth_id = a_jef;
  select id, negocio_id into p_jef, neg_emp from turno_perfiles where usuario_id = u_jef limit 1;
  select codigo_acceso into cod_emp from turno_negocios where id = neg_emp;

  -- El tercero tiene local propio a propósito: un desconocido sin fila en
  -- turno_usuarios rebota en el "no autenticado" genérico y no prueba nada.
  perform set_config('request.jwt.claims', json_build_object('sub', a_otr::text)::text, true);
  perform turno_crear_negocio('Ajeno Barber','empleados','DOP',true,'barbero','Otro','809',2,10,5,true,1,3,false,true);
  select id into u_otr from turno_usuarios where auth_id = a_otr;

  -- ══ DIRECCIÓN 1 · EL BARBERO PIDE ENTRAR ═══════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', a_inq::text)::text, true);
  select * into r from turno_unirse_profesional(cod_renta,'barbero','barbero_renta','Inquilino','809');
  p_inq := r.id;
  select id into u_inq from turno_usuarios where auth_id = a_inq;

  n:=n+1; c:='94 invertida · en ASIENTOS ALQUILADOS ya NO entra activo, queda esperando al local';
  if r.aprobado = false and r.pendiente_de = 'local' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - aprobado='||r.aprobado||', pendiente_de='||coalesce(r.pendiente_de,'NULL'); end if;

  n:=n+1; c:='y mientras espera NO sale en el escaparate del local';
  select count(*) into v_int from turno_perfiles where negocio_id = neg_renta and aprobado and activo;
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' perfiles vivos (solo debería estar el del casero)'; end if;

  -- La 108 al pie de la letra: la regla no vale si solo vive en la función.
  n:=n+1; c:='el que pide entrar NO se aprueba solo por la tabla';
  set local role authenticated;
  begin
    update turno_perfiles set aprobado = true, pendiente_de = null where id = p_inq; v_int := 1;
  exception when others then v_int := 0; v_txt := sqlerrm; end;
  reset role;
  if v_int = 0 and v_txt like '%lo decide la barbería%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - entró por la tabla'; end if;

  n:=n+1; c:='ni tocando solo pendiente_de (la columna nueva, cerrada el día que nace)';
  set local role authenticated;
  begin
    update turno_perfiles set pendiente_de = 'barbero' where id = p_inq; v_int := 1;
  exception when others then v_int := 0; end;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - se cambió de cola él solo'; end if;

  n:=n+1; c:='un local AJENO no responde por esa solicitud';
  perform set_config('request.jwt.claims', json_build_object('sub', a_otr::text)::text, true);
  begin
    perform turno_responder_solicitud(p_inq, true);
    fallos:=fallos||E'\n  x '||c||' - metió gente en el local de otro';
  exception when others then
    if sqlerrm like '%lo decide su dueño%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - rebotó por otra cosa: '||sqlerrm; end if;
  end;

  n:=n+1; c:='el CASERO sí la aprueba (decidir quién entra en tu casa no es dirigir a nadie)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cas::text)::text, true);
  begin
    select * into r from turno_responder_solicitud(p_inq, true);
    if r.aprobado and r.pendiente_de is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - aprobado='||r.aprobado; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='y ya no le queda firma pendiente a nadie';
  begin
    perform turno_responder_solicitud(p_inq, true);
    fallos:=fallos||E'\n  x '||c||' - se puede aprobar dos veces';
  exception when others then
    if sqlerrm like '%no falta tu firma%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ══ DIRECCIÓN 2 · EL LOCAL INVITA ══════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', a_inv::text)::text, true);
  perform turno_unirse_cliente(cod_emp, 'Invitado', '8095550000');
  select id into u_inv from turno_usuarios where auth_id = a_inv;
  update turno_usuarios set tipo_usuario = 'profesional' where id = u_inv;
  select codigo_barbero into cod_inv from turno_usuarios where id = u_inv;

  n:=n+1; c:='montaje · el barbero tiene código propio, que es por donde se le invita';
  if cod_inv is not null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - sin codigo_barbero no hay a quién invitar'; end if;

  n:=n+1; c:='invitar · un NO dueño no invita a trabajar en un local';
  perform set_config('request.jwt.claims', json_build_object('sub', a_inq::text)::text, true);
  begin
    perform turno_invitar_barbero(neg_emp, cod_inv);
    fallos:=fallos||E'\n  x '||c||' - metió a alguien en un local que no es suyo';
  exception when others then
    if sqlerrm like '%solo el dueño%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - rebotó por otra cosa: '||sqlerrm; end if;
  end;

  -- Se invita por CÓDIGO y no por teléfono ni correo a propósito: con teléfono
  -- se podría barrer la tabla de usuarios probando números. El código lo da su
  -- dueño, y por eso un código inventado no puede encontrar a nadie.
  n:=n+1; c:='invitar · un código que no existe no invita a nadie';
  perform set_config('request.jwt.claims', json_build_object('sub', a_jef::text)::text, true);
  begin
    perform turno_invitar_barbero(neg_emp, 'NOEXISTE-999');
    fallos:=fallos||E'\n  x '||c;
  exception when others then
    if sqlerrm like '%ningún profesional con ese código%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='invitar · el dueño invita y queda esperando al BARBERO, no al revés';
  begin
    select * into r from turno_invitar_barbero(neg_emp, cod_inv);
    p_inv := r.id;
    if r.aprobado = false and r.pendiente_de = 'barbero' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - aprobado='||r.aprobado||', pendiente_de='||coalesce(r.pendiente_de,'NULL'); end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='invitar · el local NO se la firma por él';
  perform set_config('request.jwt.claims', json_build_object('sub', a_jef::text)::text, true);
  begin
    perform turno_responder_invitacion(p_inv, true);
    fallos:=fallos||E'\n  x '||c||' - el dueño aceptó en nombre del barbero';
  exception when others then
    if sqlerrm like '%no es tuya%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - rebotó por otra cosa: '||sqlerrm; end if;
  end;

  n:=n+1; c:='invitar · invitar dos veces lo dice, no lo repite';
  begin
    perform turno_invitar_barbero(neg_emp, cod_inv);
    fallos:=fallos||E'\n  x '||c;
  exception when others then
    if sqlerrm like '%ya le invitaste%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='invitación · el barbero la ve en su lista';
  perform set_config('request.jwt.claims', json_build_object('sub', a_inv::text)::text, true);
  select count(*) into v_int from turno_mis_invitaciones();
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - vio '||v_int; end if;

  n:=n+1; c:='invitación · y NADIE MÁS la ve como suya';
  perform set_config('request.jwt.claims', json_build_object('sub', a_inq::text)::text, true);
  select count(*) into v_int from turno_mis_invitaciones();
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - vio '||v_int||' invitaciones ajenas'; end if;

  n:=n+1; c:='invitación · el barbero la acepta y ahí sí queda dentro';
  perform set_config('request.jwt.claims', json_build_object('sub', a_inv::text)::text, true);
  begin
    select * into r from turno_responder_invitacion(p_inv, true);
    if r.aprobado and r.pendiente_de is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - aprobado='||r.aprobado; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='invitación · aceptada, ya no está en la lista de pendientes';
  select count(*) into v_int from turno_mis_invitaciones();
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - siguen '||v_int; end if;

  n:=n+1; c:='invitar · a quien ya trabaja ahí no se le invita otra vez';
  perform set_config('request.jwt.claims', json_build_object('sub', a_jef::text)::text, true);
  begin
    perform turno_invitar_barbero(neg_emp, cod_inv);
    fallos:=fallos||E'\n  x '||c;
  exception when others then
    if sqlerrm like '%ya trabaja en tu local%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ══ LOS DOS SÍES, VENGAN EN EL ORDEN QUE VENGAN ════════════════════════════
  -- Si él pidió entrar y el local le invita, eso son las dos firmas: hacerle
  -- esperar otra vez sería pedirle un sí que ya dio.
  n:=n+1; c:='los dos síes cruzados · él pidió entrar y el local le invita: queda dentro de una';
  perform set_config('request.jwt.claims', json_build_object('sub', a_inv::text)::text, true);
  select * into r from turno_unirse_profesional(cod_renta,'barbero','barbero_renta','Invitado','809');
  if r.pendiente_de = 'local' then
    perform set_config('request.jwt.claims', json_build_object('sub', a_cas::text)::text, true);
    begin
      select * into r from turno_invitar_barbero(neg_renta, cod_inv);
      if r.aprobado and r.pendiente_de is null then ok:=ok+1;
      else fallos:=fallos||E'\n  x '||c||' - quedó aprobado='||r.aprobado; end if;
    exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;
  else fallos:=fallos||E'\n  x '||c||' - montaje: no quedó pendiente del local'; end if;

  n:=n+1; c:='rechazar · decir que no lo deja fuera, no dentro';
  perform set_config('request.jwt.claims', json_build_object('sub', a_otr::text)::text, true);
  select * into r from turno_unirse_profesional(cod_emp,'barbero','empleado','Otro Mas','809');
  perform set_config('request.jwt.claims', json_build_object('sub', a_jef::text)::text, true);
  begin
    select * into r from turno_responder_solicitud(r.id, false);
    if r.activo = false and r.aprobado = false and r.pendiente_de is null then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - activo='||r.activo||' aprobado='||r.aprobado; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  raise exception E'\n═══ APROBACIÓN MUTUA · % / % casos OK ═══%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
