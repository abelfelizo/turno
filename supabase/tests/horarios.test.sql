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
  v_dia date; v_hoy_real date; v_lista text; v_int int; v_int2 int;
  n int := 0; ok int := 0; fallos text := ''; c text;
  -- El segundo local, el que se usa para ver cómo NACE una barbería (mig. 85).
  a_due2 uuid := gen_random_uuid(); a_emp2 uuid := gen_random_uuid();
  u_due2 uuid; v_neg2 uuid; p_due2 uuid; p_emp2 uuid;
  v_cod2 text := 'HR-' || upper(substr(md5(random()::text),1,5));
  v_txt2 text; v_bool boolean; r2 record;
begin
  -- Mañana, para que la antelación mínima (2h) no recorte nada.
  v_dia := (now() at time zone 'America/Santo_Domingo')::date + 1;
  v_hoy_real := (now() at time zone 'America/Santo_Domingo')::date;

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
  -- ON CONFLICT desde la migración 85: el perfil ya nace con jornada sembrada.
  insert into turno_horarios(perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p, d, time '08:00', time '12:00', true, 10 from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = true, tiempo_entre_clientes = excluded.tiempo_entre_clientes;

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

  -- ── SIN GAP, QUE ES COMO TRABAJA LA MAYORÍA ───────────────────────────────
  -- El tiempo entre clientes nace en 0 desde la migración 54: el 10 de antes no
  -- lo eligió nadie, se colaba por defecto, y en una jornada de nueve horas con
  -- cortes de 45 son casi hora y media de silla regalada.
  update turno_horarios set tiempo_entre_clientes = 0
   where perfil_id = p and dia_semana = extract(dow from (v_dia + 1));

  n:=n+1; c:='sin gap · con 0 los cortes van pegados, de 45 en 45';
  select string_agg(to_char(s,'HH24:MI'), ' ' order by s) into v_lista
    from turno_slots_disponibles(p, v_dia + 1, s_corte) s;
  if v_lista = '08:00 08:45 09:30 10:15 11:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' -> '||coalesce(v_lista,'(vacío)'); end if;

  -- El horario es por día de la semana porque el sábado no se trabaja como el
  -- martes. Antes turno_eta y turno_ocupar_ahora hacían min() sobre TODA la
  -- semana, así que un solo día en 0 ponía la semana entera en 0.
  -- Se compara contra un día LIMPIO: v_dia ya lleva dos citas y un bloqueo de
  -- los casos anteriores, así que allí la lista corta es la correcta y no
  -- demostraría nada.
  n:=n+1; c:='por día · poner un día en 0 NO afecta a los demás';
  select string_agg(to_char(s,'HH24:MI'), ' ' order by s) into v_lista
    from turno_slots_disponibles(p, v_dia + 2, s_corte) s;
  if v_lista = '08:00 08:55 09:50 10:45' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el dia con gap 10 salio como '||coalesce(v_lista,'(vacío)'); end if;

  -- ── DESCANSO vs INACTIVO ──────────────────────────────────────────────────
  -- LAS CITAS SON PRIORIDAD (migración 57). El descanso significa una sola cosa:
  -- no entra gente nueva a la fila AHORA. No toca la agenda, ni la de hoy: una
  -- cita es un compromiso ya adquirido y se cancela a mano o se respeta.
  -- El inactivo sí cierra la agenda entera; para eso son dos estados.
  --
  -- La primera versión de esta prueba afirmaba que el descanso cerraba también
  -- los huecos de hoy, que es como estaba escrito entonces. Se corrige aquí
  -- junto con la regla: una prueba que defiende el comportamiento viejo es peor
  -- que no tener prueba, porque da confianza en la dirección equivocada.
  -- OJO, esta se escribió mal la primera vez y solo se notaba pasado el
  -- mediodía. Afirmaba "hoy quedan huecos" con el local abierto de 08:00 a
  -- 12:00: por la mañana pasaba, y corriéndola a las dos de la tarde fallaba
  -- sola. No probaba la regla, probaba qué hora era.
  --
  -- Lo que hay que demostrar es que el descanso NO QUITA huecos de hoy, y eso
  -- se dice comparando el mismo día con el barbero disponible y en descanso. Si
  -- la jornada de hoy ya terminó, los dos lados valen cero y la igualdad sigue
  -- siendo cierta — no demuestra nada ese día, pero tampoco miente.
  select count(*) into v_int from turno_slots_disponibles(p, v_hoy_real, s_corte) s;
  update turno_perfiles set estado_actual = 'descanso' where id = p;

  n:=n+1; c:='descanso · NO quita ni un hueco de los de hoy';
  select count(*) into v_int2 from turno_slots_disponibles(p, v_hoy_real, s_corte) s;
  if v_int2 = v_int then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - de '||v_int||' huecos a '||v_int2
       ||': un descanso no puede cerrar la agenda'; end if;

  n:=n+1; c:='descanso · la agenda de dentro de unos días SIGUE abierta';
  select count(*) into v_int from turno_slots_disponibles(p, v_dia + 3, s_corte) s;
  if v_int > 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - 0 huecos: un descanso no puede cerrar la agenda'; end if;

  update turno_perfiles set estado_actual = 'inactivo' where id = p;

  n:=n+1; c:='inactivo · cierra también los días futuros';
  select count(*) into v_int from turno_slots_disponibles(p, v_dia + 3, s_corte) s;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' huecos'; end if;

  update turno_perfiles set estado_actual = 'disponible' where id = p;

  n:=n+1; c:='vuelve · al reactivarse se ofrece otra vez';
  select count(*) into v_int from turno_slots_disponibles(p, v_dia + 3, s_corte) s;
  if v_int > 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ── UN DÍA, UNA JORNADA (migración 65) ────────────────────────────────────
  -- Del piloto: "abrí los lunes, pero aparecen dos días abiertos afuera". En la
  -- base había DOS lunes idénticos para el mismo perfil, porque la app decidía
  -- entre insertar y modificar según si su estado en memoria traía id, y nada
  -- por debajo lo impedía. La lista de días enseñaba uno y el resumen contaba
  -- dos: las dos leyendo bien una tabla mal poblada.
  delete from turno_horarios where perfil_id = p and dia_semana = 1;

  n:=n+1; c:='jornada · abrir el mismo día dos veces deja UNA fila';
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  values (p, 1, time '09:00', time '18:00', true, 0)
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = excluded.activo, tiempo_entre_clientes = excluded.tiempo_entre_clientes;
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  values (p, 1, time '10:00', time '20:00', true, 5)
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = excluded.activo, tiempo_entre_clientes = excluded.tiempo_entre_clientes;
  select count(*) into v_int from turno_horarios where perfil_id = p and dia_semana = 1;
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedaron '||v_int; end if;

  -- Idempotente no es lo mismo que inerte: el segundo guardado manda.
  n:=n+1; c:='jornada · el segundo guardado MODIFICA, no se ignora';
  select count(*) into v_int from turno_horarios
   where perfil_id = p and dia_semana = 1 and hora_inicio = time '10:00';
  if v_int = 1 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - la jornada no se actualizó'; end if;

  -- Y el índice tiene que sostenerlo aunque la llamada no traiga on conflict:
  -- una regla que depende de que quien escribe se acuerde no es una regla.
  n:=n+1; c:='jornada · un insert crudo NO puede crear un segundo lunes';
  begin
    insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
    values (p, 1, time '08:00', time '12:00', true, 0);
    fallos:=fallos||E'\n  x '||c||' - se creó igualmente';
  exception when unique_violation then ok:=ok+1;
            when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ── UNA BARBERÍA NACE ABIERTA (migración 85) ──────────────────────────────
  --
  -- Desde la migración 72 la fila respeta el horario y desde la 74 hay un
  -- letrero que dice por qué está cerrada. Las dos correctas; juntas dejaron
  -- que NADA sembrara un horario. Reproducido creando un local desde cero:
  --
  --   horarios sembrados: 0
  --   la silla del dueño: «todavía no ha puesto su horario…»
  --   el local entero:    «ahora mismo no hay nadie abierto en el local»
  --
  -- Alguien monta su barbería, reparte el código, y no le entra ni una persona.
  -- Sin error y sin aviso, que es la peor forma de estar roto.
  --
  -- Estos casos usan un local NUEVO a propósito: el de arriba lleva media suite
  -- con horarios puestos a mano y no puede enseñar cómo se nace.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hd_'||v_cod2||'@t.test','',now(),now()),
         (a_emp2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','he_'||v_cod2||'@t.test','',now(),now());

  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  perform turno_crear_negocio('Nace Abierta','empleados','DOP',true,'barbero','Duenno','809',
                              2, 10, 5, true, 1, 3, false, true);
  select id into u_due2 from turno_usuarios where auth_id = a_due2;
  select id, negocio_id into p_due2, v_neg2 from turno_perfiles where usuario_id = u_due2 limit 1;
  select codigo_acceso into v_cod2 from turno_negocios where id = v_neg2;

  n:=n+1; c:='nace · el dueño se da de alta con seis días abiertos';
  select count(*) into v_int from turno_horarios where perfil_id = p_due2;
  if v_int = 6 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' días'; end if;

  n:=n+1; c:='nace · el domingo queda cerrado, que es lo normal aquí';
  select count(*) into v_int from turno_horarios where perfil_id = p_due2 and dia_semana = 0;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- Las horas no son un invento: son las que el editor de la app propone al
  -- abrir un día en blanco. Lo sembrado y lo que vería al configurarlo coinciden.
  n:=n+1; c:='nace · con las mismas horas que propone el editor (09:00-18:00)';
  select count(*) into v_int from turno_horarios
   where perfil_id = p_due2 and hora_inicio = time '09:00' and hora_fin = time '18:00' and activo;
  if v_int = 6 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' de 6'; end if;

  -- LA MITAD QUE IMPORTA: que el letrero deje de decir que está cerrado.
  n:=n+1; c:='nace · la fila del dueño ya no dice "todavía no ha puesto su horario"';
  select turno_fila_abierta(p_due2, v_neg2) into v_txt2;
  if v_txt2 is null or v_txt2 not like '%no ha puesto su horario%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt2||'"'; end if;

  -- Un horario que el sistema puso puede no ser el suyo. No se esconde: queda
  -- marcado para que la app lo avise.
  n:=n+1; c:='nace · queda marcado como jornada sembrada, para poder avisarlo';
  select jornada_sembrada into v_bool from turno_perfiles where id = p_due2;
  if v_bool then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_emp2::text)::text, true);
  select * into r2 from turno_unirse_profesional(v_cod2,'barbero','empleado','Empleado','809');
  p_emp2 := r2.id;

  -- Antes de aprobarlo no se le siembra: todavía no puede trabajar, y un
  -- horario en la agenda de alguien que el dueño aún no aceptó confunde.
  n:=n+1; c:='nace · al que espera aprobación todavía no se le siembra nada';
  select count(*) into v_int from turno_horarios where perfil_id = p_emp2;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' días sin aprobar'; end if;

  n:=n+1; c:='nace · al aprobarlo, el empleado entra al equipo con la fila abierta';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  perform turno_responder_solicitud(p_emp2, true);
  select count(*) into v_int from turno_horarios where perfil_id = p_emp2;
  if v_int = 6 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - '||v_int||' días'; end if;

  -- El disparador corre en cada guardado del perfil. Si no mirara si ya hay
  -- horario, cada vez que el dueño tocara cualquier campo duplicaría la semana.
  n:=n+1; c:='nace · guardar el perfil otra vez no vuelve a sembrar';
  update turno_perfiles set aprobado = true where id = p_emp2;
  update turno_perfiles set limite_cola = 5 where id = p_emp2;
  select count(*) into v_int from turno_horarios where perfil_id = p_emp2;
  if v_int = 6 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c||' - quedaron '||v_int; end if;

  -- Y NUNCA PISA LO QUE EL BARBERO PUSO. Es lo único que convertiría una ayuda
  -- en un destrozo: que al reactivarlo le borrara la jornada que se había hecho.
  n:=n+1; c:='nace · el que ya tenía horario conserva el suyo';
  update turno_horarios set hora_inicio = time '07:00' where perfil_id = p_emp2 and dia_semana = 1;
  update turno_perfiles set aprobado = false where id = p_emp2;
  update turno_perfiles set aprobado = true  where id = p_emp2;
  select hora_inicio::text into v_txt2 from turno_horarios where perfil_id = p_emp2 and dia_semana = 1;
  if v_txt2 = '07:00:00' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en '||coalesce(v_txt2,'NULL'); end if;

  raise exception E'\n=== HORARIOS · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
