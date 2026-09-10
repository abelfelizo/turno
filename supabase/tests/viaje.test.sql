-- ─────────────────────────────────────────────────────────────────────────────
-- VIAJE COMPLETO · Turno
--
-- Las otras suites comprueban invariantes sueltas. Esta recorre las HISTORIAS
-- de principio a fin, llamando a las mismas funciones que llama la app y en el
-- mismo orden: el dueño monta su local, un barbero pide entrar, el dueño lo
-- aprueba, un cliente llega con el código, pide turno, lo llaman, dice que va
-- en camino, lo sientan, lo terminan, y comprueba que su tarjeta sumó y que no
-- queda atrapado sin poder pedir otro.
--
-- Existe porque los fallos de FLUJO no se ven mirando funciones de una en una.
-- La primera vez que se corrió encontró que un barbero SIN APROBAR podía llamar
-- clientes: la aprobación solo existía en la interfaz.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Crear un fixture dentro de un bloque que
-- espera un error hace que el fixture desaparezca. Los datos se crean fuera.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/viaje.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_cod text := 'VJ-' || upper(substr(md5(random()::text),1,5));
  a_due uuid := gen_random_uuid(); a_bar uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  u_due uuid; u_bar uuid; u_cli uuid; v_neg uuid; p_due uuid; p_bar uuid; s_corte uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; r record; v_int int; v_uuid uuid; v_bool boolean; v_est text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','vd_'||v_cod||'@t.test','',now(),now()),
         (a_bar,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','vb_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','vc_'||v_cod||'@t.test','',now(),now());

  -- ── EL DUEÑO MONTA SU LOCAL ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Viaje Barber','empleados','DOP',true,'barbero','Duenno','809',2,10,5,true,1,3,false,true);
  select id into u_due from turno_usuarios where auth_id=a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id=u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id=v_neg;

  n:=n+1; c:='ONBOARDING dueño · local, perfil y código';
  if v_neg is not null and p_due is not null and v_cod is not null then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='ONBOARDING dueño · su propia silla es operable';
  if turno_perfil_operable(p_due) then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el dueño no puede operar su silla'; end if;

  -- ── UN BARBERO PIDE ENTRAR ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Barbero Nuevo','809');
  p_bar := r.id; select id into u_bar from turno_usuarios where auth_id=a_bar;
  -- El servicio se crea AQUÍ y no dentro de los bloques de abajo: un
  -- `exception` revierte lo que hizo su propio bloque.
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_bar,'Corte',30,500,true) returning id into s_corte;

  n:=n+1; c:='BARBERO · al unirse queda PENDIENTE';
  if r.aprobado = false then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- El código del local se comparte por WhatsApp: quien lo tenga se une solo.
  -- Hasta que el dueño lo acepte, no puede tocar nada del local.
  n:=n+1; c:='BARBERO · sin aprobar NO puede llamar clientes';
  begin
    perform turno_llamar_siguiente(v_neg, p_bar);
    fallos := fallos || E'\n  x '||c||' - pudo operar la fila sin aprobación';
  exception when others then
    if sqlerrm like '%no está aprobado%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- Antes esto probaba turno_ocupar_ahora, que se cerró en la migración 66 y
  -- hoy se niega SIEMPRE ("esta versión de la app está desactualizada"). El caso
  -- habría seguido pasando por la razón equivocada si solo mirase que falla:
  -- por eso comprueba el mensaje, y por eso llama a la función que de verdad
  -- usa la app ahora.
  n:=n+1; c:='BARBERO · sin aprobar NO puede sentar a nadie';
  begin
    perform turno_atender_sin_cita(v_neg, p_bar, s_corte, 'Sin cita', '');
    fallos := fallos || E'\n  x '||c||' - atendió sin aprobación';
  exception when others then
    if sqlerrm like '%no está aprobado%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ── EL DUEÑO LO APRUEBA ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_bar;
  -- Jornada de 00:01 a 23:59 A PROPÓSITO. Desde la migración 72 la fila
  -- respeta el horario, y con un fixture de 08:00 a 21:00 esta suite fallaba
  -- sola al correrla de madrugada o de noche: contaba la hora, no la regla.
  -- Aquí el horario no es lo que se mide, así que se abre entero para que no
  -- interfiera; quien sí lo mide es horarios.test.sql y modo_atencion.test.sql.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_bar, d, time '00:01', time '23:59', true, 10 from generate_series(0,6) d;

  n:=n+1; c:='BARBERO · aprobado, ya puede operar';
  if turno_perfil_operable(p_bar) then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ── LLEGA UN CLIENTE ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Nuevo', '829');
  select id into u_cli from turno_usuarios where auth_id=a_cli;

  n:=n+1; c:='CLIENTE · entra con el código';
  if exists(select 1 from turno_membresias where usuario_id=u_cli and negocio_id=v_neg and rol='cliente' and activo)
    then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='CLIENTE · ve al barbero aprobado como disponible';
  select count(*) into v_int from turno_perfiles p cross join lateral turno_estado_barbero(p.id) e
   where p.negocio_id=v_neg and p.aprobado and p.activo and e.acepta;
  if v_int >= 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  n:=n+1; c:='CLIENTE · la hoja previa trae datos (R3)';
  begin
    select * into r from turno_resumen_fila(v_neg, p_bar);
    if r is not null then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='CLIENTE · entra a la fila en posición 1';
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    v_uuid := r.id;
    if r.posicion = 1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - pos '||r.posicion; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='CLIENTE · su ETA se calcula';
  select turno_eta(v_uuid) into v_int;
  if v_int is not null then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ── EL TURNO SE CONSUME ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='BARBERO · llama y le toca a ese cliente';
  select * into r from turno_llamar_siguiente(v_neg, p_bar);
  if r.cliente_id = u_cli then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  n:=n+1; c:='CLIENTE · llamado, puede decir que va en camino';
  select turno_puede_confirmar(v_uuid) into v_bool;
  if v_bool then
    perform turno_confirmar_camino(v_uuid);
    select estado into v_est from turno_cola where id=v_uuid;
    if v_est='en_camino' then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - quedó en '||v_est; end if;
  else fallos:=fallos||E'\n  x '||c||' - no le dejó confirmar estando llamado'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_bar::text)::text, true);
  n:=n+1; c:='BARBERO · lo sienta en la silla';
  begin
    perform turno_iniciar_atencion(v_uuid);
    select estado into v_est from turno_cola where id=v_uuid;
    if v_est='atendiendo' then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_est; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  update turno_cola set estado='atendido', atendido_at=now() where id=v_uuid;

  n:=n+1; c:='CIERRE · visita registrada';
  select count(*) into v_int from turno_historial_visitas where cliente_id=u_cli and negocio_id=v_neg;
  if v_int=1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int; end if;

  n:=n+1; c:='CIERRE · su tarjeta sumó un recorte';
  select visitas_totales into v_int from turno_puntos where usuario_id=u_cli and negocio_id=v_neg;
  if coalesce(v_int,0)=1 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||coalesce(v_int,-1); end if;

  -- R1 permite un turno activo por tipo. Si el cierre no libera bien, el
  -- cliente queda atrapado sin poder volver a pedir.
  n:=n+1; c:='CIERRE · el cliente NO queda atrapado';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_bar);
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  raise exception E'\n═══ VIAJE COMPLETO · % / % pasos OK ═══%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
