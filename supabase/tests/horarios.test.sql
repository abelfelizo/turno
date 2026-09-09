-- ─────────────────────────────────────────────────────────────────────────────
-- HORARIOS DISPONIBLES · Turno
--
-- Una barbería no vende cortes: vende el tiempo de una silla. Si el sistema deja
-- aire entre servicios, ese aire es dinero que no se cobra y un cliente que se
-- va a otro sitio. Esta suite existe porque el cálculo de huecos tenía justo ese
-- fallo y no se ve mirando una reserva sola: solo aparece cuando conviven
-- servicios de DISTINTA duración.
--
-- Lo que encontró, reproducido contra la base antes de arreglarlo:
--
--   DÍA VACÍO (8:00–12:00, gap 10)
--     Corte 45min -> 08:00  08:55  09:50  10:45
--     Barba 30min -> 08:00  08:40  09:20  10:00  10:40  11:20
--
--   YA HAY UN CORTE RESERVADO 08:00–08:45
--     Barba 30min -> 09:20  10:00  10:40  11:20      <- la barba cabía a las 08:55
--
-- 35 minutos muertos. La causa: los huecos salían de una rejilla fija que
-- arranca en la apertura y avanza de (duración + gap), y esa rejilla depende del
-- servicio que estás reservando. La barba solo podía caer en 08:00, 08:40,
-- 09:20…; como 08:40 pisaba el corte, el siguiente escalón ya era 09:20. El
-- hueco entre 08:45 y 09:20 no existía para la rejilla.
--
-- Una rejilla fija solo funciona si todos los servicios duran lo mismo. Arreglado
-- en la migración 53 añadiendo como candidatos los instantes PEGADOS al final de
-- cada cita y cada bloqueo (+ el tiempo entre clientes).
--
-- Se conserva la rejilla ADEMÁS de los pegados, y eso también se prueba: en un
-- día vacío las horas tienen que seguir siendo redondas y predecibles, no una
-- lista arbitraria.
--
-- OJO al escribirla: un bloque `begin ... exception` en plpgsql revierte sus
-- propias sentencias al capturar. Los datos se crean fuera.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/horarios.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid();
  u_due uuid; v_neg uuid; p uuid; s_corte uuid; s_barba uuid;
  v_dia date; v_lista text; v_int int;
  n int := 0; ok int := 0; fallos text := ''; c text;
begin
  -- Mañana, para que la antelación mínima (2h) no recorte nada.
  v_dia := (now() at time zone 'America/Santo_Domingo')::date + 1;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'hr_'||substr(md5(random()::text),1,6)||'@t.test','',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Horarios Barber','empleados','DOP',true,'barbero','Duenno','809',
                              2, 10, 5, false, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p, v_neg from turno_perfiles where usuario_id = u_due limit 1;

  -- Dos servicios de duración distinta: es la única forma de ver el fallo.
  insert into turno_servicios(perfil_id,nombre,duracion_min,precio,activo)
  values (p,'Corte',45,700,true) returning id into s_corte;
  insert into turno_servicios(perfil_id,nombre,duracion_min,precio,activo)
  values (p,'Barba',30,400,true) returning id into s_barba;
  insert into turno_horarios(perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p, d, time '08:00', time '12:00', true, 10 from generate_series(0,6) d;

  -- ── DÍA VACÍO: LA REJILLA SIGUE DANDO HORAS REDONDAS ──────────────────────
  n:=n+1; c:='vacío · el corte abre en la hora de apertura y avanza de 55 en 55';
  select string_agg(to_char(s,'HH24:MI'), ' ' order by s) into v_lista
    from turno_slots_disponibles(p, v_dia, s_corte) s;
  if v_lista = '08:00 08:55 09:50 10:45' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> '||coalesce(v_lista,'(vacío)'); end if;

  n:=n+1; c:='vacío · la barba avanza de 40 en 40';
  select string_agg(to_char(s,'HH24:MI'), ' ' order by s) into v_lista
    from turno_slots_disponibles(p, v_dia, s_barba) s;
  if v_lista = '08:00 08:40 09:20 10:00 10:40 11:20' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> '||coalesce(v_lista,'(vacío)'); end if;

  -- ── EL FALLO QUE MOTIVA ESTA SUITE ────────────────────────────────────────
  insert into turno_citas(perfil_id,cliente_id,negocio_id,servicio_id,fecha,hora_inicio,hora_fin,estado)
  values (p,u_due,v_neg,s_corte,v_dia,time '08:00',time '08:45','confirmada');

  n:=n+1; c:='sin tiempo muerto · la barba entra a las 08:55, justo al terminar el corte';
  select to_char(min(s),'HH24:MI') into v_lista from turno_slots_disponibles(p, v_dia, s_barba) s;
  if v_lista = '08:55' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> primer hueco '||coalesce(v_lista,'(ninguno)')
       ||' (con 09:20 se pierden 35 minutos de silla)'; end if;

  n:=n+1; c:='sin tiempo muerto · el hueco ofrecido NO pisa la cita que ya existe';
  select count(*) into v_int
    from turno_slots_disponibles(p, v_dia, s_barba) s
   where s < time '08:45' ;
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos encima del corte'; end if;

  -- ── SE ENCADENA: CADA RESERVA COMPACTA LA SIGUIENTE ───────────────────────
  insert into turno_citas(perfil_id,cliente_id,negocio_id,servicio_id,fecha,hora_inicio,hora_fin,estado)
  values (p,u_due,v_neg,s_barba,v_dia,time '08:55',time '09:25','confirmada');

  n:=n+1; c:='encadenado · el corte siguiente entra a las 09:35';
  select to_char(min(s),'HH24:MI') into v_lista from turno_slots_disponibles(p, v_dia, s_corte) s;
  if v_lista = '09:35' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> '||coalesce(v_lista,'(ninguno)'); end if;

  -- ── UN BLOQUEO TAMBIÉN COMPACTA DETRÁS ────────────────────────────────────
  insert into turno_bloqueos(perfil_id,fecha,hora_inicio,hora_fin,motivo)
  values (p,v_dia,time '10:00',time '10:30','Diligencia');

  n:=n+1; c:='bloqueo · el hueco siguiente se pega al final del bloqueo (10:40)';
  select to_char(min(s),'HH24:MI') into v_lista from turno_slots_disponibles(p, v_dia, s_barba) s;
  if v_lista = '10:40' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> '||coalesce(v_lista,'(ninguno)'); end if;

  n:=n+1; c:='bloqueo · ningún hueco cae dentro del bloqueo';
  select count(*) into v_int
    from turno_slots_disponibles(p, v_dia, s_barba) s
   where s < time '10:30' and s >= time '09:30';
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos pisando el bloqueo'; end if;

  -- ── NADA SE OFRECE DESPUÉS DEL CIERRE ─────────────────────────────────────
  n:=n+1; c:='cierre · ningún servicio se ofrece si no termina antes de cerrar';
  select count(*) into v_int
    from turno_slots_disponibles(p, v_dia, s_corte) s
   where (s + interval '45 min')::time > time '12:00';
  if v_int = 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos terminan despues de cerrar'; end if;

  raise exception E'\n=== HORARIOS · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
